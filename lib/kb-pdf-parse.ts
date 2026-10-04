/**
 * Komerční banka (KB) výpis z plain textu PDF.
 * Samostatný modul — nesdílí parsovací logiku s ČSOB ani Raiffeisenbank.
 */
import type { ImportBucket, ParsedImportRow } from '@/lib/bank-statement-parser';
import { bucketToStoreCategory } from '@/lib/bank-statement-parser';
import { classifyCsob } from '@/lib/csob-pdf-parse';
import { normalizeAccount, isOwnCounterpartyAccount } from '@/utils/normalizeAccount';
import { isLoanPaymentText, LOAN_PAYMENT_CATEGORY } from '@/lib/loan-payment-detect';
import { isAtmOrCashDescription, isCashDepositDescription } from '@/lib/classify-import-category';

const KB_MAIN_DATE = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b/;

const KB_TX_TYPES = [
  'Vrácení nákupu',
  'Mobilní výběr hotovosti',
  'Mobilní vklad přes ATM',
  'Poplatek za extra službu',
  'Mobilní platba na internetu',
  'Nákup na internetu',
  'Mobilní platba',
  'Příchozí úhrada',
  'Odchozí úhrada',
] as const;

const MAX_TRANSACTION_CZK = 1_000_000;

/** Unikátní detekce KB výpisu v extrahovaném textu PDF. */
export function isKbPdfText(text: string): boolean {
  const sample = text.slice(0, 20_000);
  const hasKbHeader =
    /Komerční banka,\s*a\.\s*s\./i.test(sample) && /Na\s+Příkopě\s+33/i.test(sample);
  const hasKbCode = /Code:\s*VYPIS1_NDB/i.test(sample);
  return hasKbHeader || hasKbCode;
}

export function kbPlainTextToLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function parseKbMoneyToken(tok: string): number {
  const t = tok.replace(/[−\u2212]/g, '-').replace(/\s/g, '').replace(',', '.');
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
    const before = lines.slice(Math.max(0, i - 8), i).join(' ');
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
  const withoutSymbols = trimmed.replace(/\s+[-–]\s*([-–]\s*)*$/g, '').trim();
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
  counterpartyLabel?: string;
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
    rest: (m[4] ?? '').trim(),
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
      merged = `${merged} ${lines[i]!.trim()}`.replace(/\s+/g, ' ').trim();
      i++;
      break;
    }
    if (!parseKbMainDateLine(lines[i]!) && !nextAmt) {
      merged = `${merged} ${lines[i]!.trim()}`.replace(/\s+/g, ' ').trim();
      i++;
      continue;
    }
    break;
  }

  return { merged, nextIdx: i };
}

function kbIncomeFromType(txType: string | undefined, rawAmount: number): boolean {
  if (txType && /vrácení\s+nákupu|příchozí\s+úhrada|mobilní\s+vklad/i.test(txType)) return true;
  if (
    txType &&
    /odchozí\s+úhrada|mobilní\s+platba|nákup\s+na\s+internetu|mobilní\s+výběr|poplatek/i.test(txType)
  ) {
    return false;
  }
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
  if (!base) base = 'Bez popisu';
  const withNote = note && !base.includes(note) ? `${base} — ${note}` : base;
  return withNote.length > 200 ? `${withNote.slice(0, 197)}…` : withNote;
}

function classifyKbRow(params: {
  txType: string | undefined;
  description: string;
  merchantPart: string;
  counterpartyLabel: string | undefined;
  note: string | undefined;
  counterpartyAccount: string | undefined;
  ownerAccounts: string[];
  type: 'income' | 'expense';
}): { category: string; description: string; isRefund?: boolean; type: 'income' | 'expense' } {
  const { txType, merchantPart, counterpartyLabel, note, counterpartyAccount, ownerAccounts } =
    params;
  let { description, type } = params;
  const blob = [description, merchantPart, txType, note, counterpartyLabel].filter(Boolean).join('\n');

  // Poplatek banky
  if (txType && /poplatek/i.test(txType)) {
    return {
      category: 'Bankovní poplatky',
      description: 'Poplatek KB',
      type: 'expense',
    };
  }

  // Vrácení nákupu → refund (income + is_refund), kategorie podle obchodníka
  if (txType && /vrácení\s+nákupu/i.test(txType)) {
    const bucket = classifyCsob(description, counterpartyLabel);
    const cat = bucketToStoreCategory(bucket, 'expense');
    return {
      category: cat === 'Ostatní' || cat === 'Převod' ? 'Nákupy' : cat,
      description: merchantPart.trim() || description,
      isRefund: true,
      type: 'income',
    };
  }

  // Vklad hotovosti
  if (
    (txType && /mobilní\s+vklad/i.test(txType)) ||
    isCashDepositDescription(blob)
  ) {
    return {
      category: 'Vklad hotovosti',
      description: 'Vklad hotovosti',
      type: 'income',
    };
  }

  // Výběr hotovosti / KB ATM
  if (
    (txType && /mobilní\s+výběr\s+hotovosti/i.test(txType)) ||
    /kb\s*atm/i.test(blob) ||
    isAtmOrCashDescription(blob)
  ) {
    return {
      category: 'Výběr hotovosti',
      description: 'Výběr hotovosti',
      type: 'expense',
    };
  }

  // Splátka úvěru — i kdyby byl účet v „vlastních“
  if (isLoanPaymentText(blob, note)) {
    return {
      category: LOAN_PAYMENT_CATEGORY,
      description,
      type: 'expense',
    };
  }

  const isSelfTransfer = isOwnCounterpartyAccount(counterpartyAccount, ownerAccounts);
  if (isSelfTransfer) {
    return {
      category: 'Převod',
      description: 'Převod mezi účty',
      type,
    };
  }

  const bucket: ImportBucket = classifyCsob(description, counterpartyLabel);
  return {
    category: bucketToStoreCategory(bucket, type),
    description,
    type,
  };
}

export function parseKbLinesToImportRows(
  lines: string[],
  ownerAccounts: string[] = [],
): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
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
    let type: 'income' | 'expense' = kbIncomeFromType(txType, rawAmount) ? 'income' : 'expense';
    const amount = Math.abs(rawAmount);
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const classified = classifyKbRow({
      txType,
      description,
      merchantPart,
      counterpartyLabel,
      note,
      counterpartyAccount,
      ownerAccounts,
      type,
    });
    type = classified.type;

    const cpMeta = {
      ...(counterpartyAccount ? { counterpartyAccount } : {}),
      ...(merchantPart.trim() && counterpartyAccount
        ? { counterpartyName: merchantPart.trim() }
        : {}),
    };

    const key = `${date}|${rawAmount}|${classified.description.slice(0, 96)}|${classified.category}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const bucket: ImportBucket =
      classified.category === 'Převod'
        ? 'Převod'
        : classified.category === 'Výběr hotovosti'
          ? 'Ostatní'
          : 'Ostatní';

    rows.push({
      date,
      rawAmount,
      description: classified.description,
      type,
      amount,
      bucket,
      category: classified.category,
      ...(classified.isRefund ? { isRefund: true } : {}),
      ...(bankTransactionId ? { bankTransactionId } : {}),
      ...cpMeta,
    });
  }

  return rows.filter((t) => t.amount >= 0.01);
}

export function parseKbPdfPlainText(text: string, ownerAccounts: string[] = []): ParsedImportRow[] {
  const lines = kbPlainTextToLines(text);
  return parseKbLinesToImportRows(lines, ownerAccounts);
}
