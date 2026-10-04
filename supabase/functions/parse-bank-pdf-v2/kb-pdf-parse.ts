/**
 * Komerční banka (KB) — Edge Function parser (samostatný modul).
 */

import { normalizeAccount, isOwnCounterpartyAccount } from "./normalize-account.ts";

type ImportBucket =
  | "Jídlo"
  | "Auto/Benzín"
  | "Restaurace"
  | "Bydlení"
  | "Sport"
  | "Zdraví"
  | "Investice"
  | "Předplatné"
  | "Převod"
  | "Ostatní";

export interface KbParsedImportRow {
  date: string;
  rawAmount: number;
  description: string;
  type: "income" | "expense";
  amount: number;
  bucket: ImportBucket;
  category: string;
  bankTransactionId?: string;
  counterpartyAccount?: string;
  counterpartyName?: string;
}

export type KbParseDeps = {
  classifyCsob: (desc: string, misto?: string) => ImportBucket;
  bucketToStoreCategory: (bucket: ImportBucket, type: "income" | "expense") => string;
};

const KB_MAIN_DATE = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b/;

const KB_TX_TYPES = [
  "Vrácení nákupu",
  "Mobilní platba na internetu",
  "Nákup na internetu",
  "Mobilní platba",
  "Příchozí úhrada",
  "Odchozí úhrada",
] as const;

const MAX_TRANSACTION_CZK = 1_000_000;

export function isKbPdfText(text: string): boolean {
  const sample = text.slice(0, 20_000);
  const hasKbHeader =
    /Komerční banka,\s*a\.\s*s\./i.test(sample) && /Na\s+Příkopě\s+33/i.test(sample);
  const hasKbCode = /Code:\s*VYPIS1_NDB/i.test(sample);
  return hasKbHeader || hasKbCode;
}

function kbPlainTextToLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function parseKbMoneyToken(tok: string): number {
  const t = tok.replace(/[−\u2212]/g, "-").replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(t);
  return isFinite(n) ? n : NaN;
}

function parseKbAmountFromLine(line: string): { rawAmount: number; withoutAmount: string } | null {
  const m = line.match(/(?:^|\s)(-\s*)?(\d{1,3}(?:\s\d{3})*,\d{2})\s*Kč\s*$/i);
  if (!m) return null;
  const neg = Boolean(m[1]);
  const num = parseKbMoneyToken(m[2]!);
  if (!isFinite(num)) return null;
  const rawAmount = neg ? -num : num;
  const withoutAmount = line.slice(0, line.length - m[0]!.length).trimEnd();
  return { rawAmount, withoutAmount };
}

function isKbNoiseLine(line: string): boolean {
  const l = line.trim();
  if (!l) return true;
  if (/^Komerční banka/i.test(l)) return true;
  if (/Zapsaná v obchodním rejstříku/i.test(l)) return true;
  if (/^Id:\s*Code:/i.test(l) || /VYPIS1_NDB/i.test(l)) return true;
  if (/^Výpis z účtu/i.test(l) && /\d+\s*\/\s*\d+/.test(l)) return true;
  if (/^Počáteční zůstatek|^Konečný zůstatek|^Číslo účtu|^IBAN|^SWIFT|^Měna účtu/i.test(l)) return true;
  if (/^Transakce$/i.test(l)) return true;
  if (/^Datum provedení/i.test(l) && /Kód transakce/i.test(l)) return true;
  if (/^Celkový počet transakcí/i.test(l)) return true;
  return false;
}

function isKbDetailHeader(line: string): boolean {
  return /^Datum provedení/i.test(line) && /Kód transakce/i.test(line);
}

function isKbTotalLine(line: string): boolean {
  return /^Celkový počet transakcí/i.test(line);
}

function findKbTransactionsStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (/^Transakce$/i.test(lines[i]!.trim())) {
      return i + 1;
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (!KB_MAIN_DATE.test(lines[i]!)) continue;
    const before = lines.slice(Math.max(0, i - 8), i).join(" ");
    if (/Výpis z účtu|VYPIS1_NDB|Komerční banka/i.test(before)) {
      return i;
    }
  }
  return 0;
}

function extractKbTxType(rest: string): string {
  const trimmed = rest.trim();
  for (const t of KB_TX_TYPES) {
    if (trimmed.startsWith(t)) return t;
  }
  const withoutSymbols = trimmed.replace(/\s+[-–]\s*([-–]\s*)*$/g, "").trim();
  for (const t of KB_TX_TYPES) {
    if (withoutSymbols.startsWith(t)) return t;
  }
  return withoutSymbols.split(/\s+\d{6,}/)[0]?.trim() || trimmed;
}

function parseKbDetailValueLine(
  line: string,
): { txCode?: string; txType: string } | undefined {
  const m = line.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\S+)\s+(.+)$/);
  if (!m) return undefined;
  return {
    txCode: m[4]?.trim() || undefined,
    txType: extractKbTxType(m[5]!),
  };
}

function parseKbMessageLine(line: string): string | undefined {
  const m =
    line.match(/^Zpráva pro příjemce:\s*(.+)$/i) ??
    line.match(/^Popis pro mě:\s*(.+)$/i);
  return m?.[1]?.trim() || undefined;
}

function stripCounterpartyFromMiddle(middle: string): {
  merchant: string;
  /** Label for description only — never used for transfer classification. */
  counterpartyLabel?: string;
  /** Real account number only; card masks stay unset (NULL). */
  counterpartyAccount?: string;
} {
  let s = middle.trim();
  const card = s.match(/(\d{6}\*+\d{4})\s*$/);
  if (card) {
    s = s.slice(0, s.length - card[0].length).trim();
    return { merchant: s, counterpartyLabel: card[1] };
  }
  // Volitelné předčíslí: 19-2235210247/0800 i bez: 2235210247/0800
  const acc = s.match(/((?:\d{1,6}-)?\d{6,}\/\d{4})\s*$/);
  if (acc) {
    s = s.slice(0, s.length - acc[0].length).trim();
    const normalized = normalizeAccount(acc[1]);
    return {
      merchant: s,
      counterpartyLabel: acc[1],
      ...(normalized ? { counterpartyAccount: normalized } : {}),
    };
  }
  return { merchant: s };
}

function parseKbMainDateLine(line: string): { day: number; month: number; year: number; rest: string } | null {
  const m = line.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s*(.*)$/);
  if (!m) return null;
  return {
    day: +m[1]!,
    month: +m[2]!,
    year: +m[3]!,
    rest: (m[4] ?? "").trim(),
  };
}

function collectKbMainLine(lines: string[], start: number): { merged: string; nextIdx: number } {
  let merged = lines[start]!.trim();
  let i = start + 1;

  while (i < lines.length) {
    if (isKbTotalLine(lines[i]!)) break;
    if (isKbNoiseLine(lines[i]!)) {
      i++;
      continue;
    }
    if (parseKbMainDateLine(lines[i]!) && parseKbAmountFromLine(merged)) break;
    if (parseKbMainDateLine(lines[i]!) && !parseKbAmountFromLine(merged)) {
      break;
    }
    if (isKbDetailHeader(lines[i]!)) break;

    const nextAmt = parseKbAmountFromLine(lines[i]!);
    const mergedAmt = parseKbAmountFromLine(merged);
    if (nextAmt && !mergedAmt) {
      merged = `${merged} ${lines[i]!.trim()}`.replace(/\s+/g, " ").trim();
      i++;
      break;
    }
    if (!parseKbMainDateLine(lines[i]!) && !nextAmt) {
      merged = `${merged} ${lines[i]!.trim()}`.replace(/\s+/g, " ").trim();
      i++;
      continue;
    }
    break;
  }

  return { merged, nextIdx: i };
}

function kbIncomeFromType(txType: string | undefined, rawAmount: number): boolean {
  if (txType && /vrácení\s+nákupu|příchozí\s+úhrada/i.test(txType)) return true;
  if (txType && /odchozí\s+úhrada|mobilní\s+platba|nákup\s+na\s+internetu/i.test(txType)) return false;
  return rawAmount >= 0;
}

function buildKbDescription(
  merchant: string,
  txType: string | undefined,
  counterparty: string | undefined,
  note?: string,
): string {
  let base = merchant.trim();
  if (!base && counterparty) base = counterparty;
  if (!base && txType) base = txType;
  if (!base) base = "Bez popisu";
  const withNote = note && !base.includes(note) ? `${base} — ${note}` : base;
  return withNote.length > 200 ? `${withNote.slice(0, 197)}…` : withNote;
}

export function parseKbPdfPlainText(
  text: string,
  ownerAccounts: string[] = [],
  deps: KbParseDeps,
): KbParsedImportRow[] {
  const lines = kbPlainTextToLines(text);
  const rows: KbParsedImportRow[] = [];
  const seen = new Set<string>();

  let i = findKbTransactionsStart(lines);
  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (isKbTotalLine(line)) break;
    if (isKbNoiseLine(line)) {
      i++;
      continue;
    }

    const mainDate = parseKbMainDateLine(line);
    if (!mainDate) {
      i++;
      continue;
    }

    const { merged, nextIdx } = collectKbMainLine(lines, i);
    i = nextIdx;

    const amountParsed = parseKbAmountFromLine(merged);
    if (!amountParsed) continue;

    const { rawAmount, withoutAmount } = amountParsed;
    if (!isFinite(rawAmount) || Math.abs(rawAmount) < 0.01) continue;
    if (Math.abs(rawAmount) > MAX_TRANSACTION_CZK) continue;

    const mainParsed = parseKbMainDateLine(withoutAmount);
    if (!mainParsed) continue;

    const { day, month, year } = mainDate;
    const check = new Date(year, month - 1, day);
    if (check.getMonth() !== month - 1) continue;

    const {
      merchant: merchantPart,
      counterpartyLabel,
      counterpartyAccount,
    } = stripCounterpartyFromMiddle(mainParsed.rest);
    let txType: string | undefined;
    let bankTransactionId: string | undefined;
    let note: string | undefined;

    if (i < lines.length && isKbDetailHeader(lines[i]!)) {
      i++;
      if (i < lines.length) {
        const detail = parseKbDetailValueLine(lines[i]!);
        if (detail) {
          txType = detail.txType;
          bankTransactionId = detail.txCode;
        }
        i++;
      }
    } else if (i < lines.length && parseKbDetailValueLine(lines[i]!)) {
      const detail = parseKbDetailValueLine(lines[i]!)!;
      txType = detail.txType;
      bankTransactionId = detail.txCode;
      i++;
    }

    if (i < lines.length) {
      const msg = parseKbMessageLine(lines[i]!);
      if (msg) {
        note = msg;
        i++;
      }
    }

    const description = buildKbDescription(merchantPart, txType, counterpartyLabel, note);
    const isSelfTransfer = isOwnCounterpartyAccount(counterpartyAccount, ownerAccounts);

    const type: "income" | "expense" = kbIncomeFromType(txType, rawAmount) ? "income" : "expense";
    const amount = Math.abs(rawAmount);
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const cpMeta = {
      ...(counterpartyAccount ? { counterpartyAccount } : {}),
      ...(merchantPart.trim() && counterpartyAccount
        ? { counterpartyName: merchantPart.trim() }
        : {}),
    };

    if (isSelfTransfer) {
      const key = `${date}|${rawAmount}|${description.slice(0, 96)}|převod`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        date,
        rawAmount,
        description: "Převod mezi účty",
        type,
        amount,
        bucket: "Převod",
        category: "Převod",
        ...(bankTransactionId ? { bankTransactionId } : {}),
        ...cpMeta,
      });
      continue;
    }

    const bucket = deps.classifyCsob(description, counterpartyLabel);
    const category = deps.bucketToStoreCategory(bucket, type);

    const key = `${date}|${rawAmount}|${description.slice(0, 96)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      date,
      rawAmount,
      description,
      type,
      amount,
      bucket,
      category,
      ...(bankTransactionId ? { bankTransactionId } : {}),
      ...cpMeta,
    });
  }

  return rows.filter((t) => t.amount >= 0.01);
}
