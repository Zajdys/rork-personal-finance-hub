/**
 * Fio banka — Edge Function parser (samostatný modul).
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

export interface FioParsedImportRow {
  date: string;
  rawAmount: number;
  description: string;
  type: "income" | "expense";
  amount: number;
  bucket: ImportBucket;
  category: string;
  /** Fio „ID operace“ — stabilní unique_key / dedup při reimportu. */
  bankTransactionId?: string;
  counterpartyAccount?: string;
  counterpartyName?: string;
}

export type FioParseDeps = {
  classifyCsob: (desc: string, misto?: string) => ImportBucket;
  bucketToStoreCategory: (bucket: ImportBucket, type: "income" | "expense") => string;
};

const FIO_DATE_LINE = /^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})$/;
const FIO_PARTIAL_DATE_LINE = /^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*$/;
const FIO_YEAR_ONLY_LINE = /^(\d{4})$/;
const FIO_OP_ID_LINE = /^\d{8,}$/;
const FIO_STANDALONE_AMOUNT = /^(-?\d{1,3}(?:\s\d{3})*,\d{2})$/;
/** České číslo účtu s volitelným předčíslím (19-2235210247/0800) i bez. */
const FIO_ACCOUNT = /(?:\d{1,6}-)?\d{6,}\/\d{4}/;
const MAX_TRANSACTION_CZK = 1_000_000;

const FIO_OP_TYPE_PREFIXES = [
  "Okamžitá odchozí platba",
  "Okamžitá příchozí platba",
  "Bezhotovostní platba",
  "Bezhotovostní příjem",
  "Platba převodem",
  "Příjem převodem",
  "Platba kartou",
  "Výběr z bankomatu",
  "Vklad do bankomatu",
] as const;

const FIO_COLUMN_HEADERS = [
  "Datum účtování",
  "Datum transakce",
  "ID operace",
  "Operace",
  "Číslo protiúčtu/Kód banky",
  "Částka",
  "Upřesnění",
  "Název protiúčtu",
  "Kč",
  "Symboly, reference plátce",
  "Zpráva pro příjemce",
  "Uživatelský symbol",
] as const;

/** Detekce Fio výpisu — stačí jeden z unikátních identifikátorů. */
export function isFioPdfText(text: string): boolean {
  const sample = text.slice(0, 30_000);
  if (/Fio banka,\s*a\.s\./i.test(sample) && /61858374/.test(sample)) return true;
  if (/FIOBCZPPXXX?/.test(sample)) return true;
  if (/Na\s+Florenci\s+2139\/2/i.test(sample)) return true;
  return false;
}

/**
 * Normalizuje extrahovaný text: sloupce v PDF jsou oddělené „\\n \\n“,
 * prázdné/mezerové řádky se vyhodí.
 */
function fioPlainTextToLines(text: string): string[] {
  const cut = text.split(/===== konec sestavy =====/i)[0] ?? text;
  const normalized = cut
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  return normalized
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
}

function parseFioMoney(tok: string): number {
  const t = tok.replace(/[−\u2212]/g, "-").replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(t);
  return isFinite(n) ? n : NaN;
}

function isValidFioCalendarDate(day: number, month: number, year: number): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return false;
  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 2100) return false;
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let maxDay = daysInMonth[month - 1]!;
  if (month === 2 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) {
    maxDay = 29;
  }
  return day <= maxDay;
}

function formatFioDateIso(day: number, month: number, year: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Roky z hlavičky výpisu (Výpis za období …) — jen z textu PDF, ne aktuální rok. */
function extractFioStatementYears(text: string): number[] {
  const years = new Set<number>();
  const period = text.match(
    /Výpis za období\s+(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})\s*[-–]\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})/i,
  );
  if (period) {
    years.add(parseInt(period[3]!, 10));
    years.add(parseInt(period[6]!, 10));
  }
  for (const m of text.matchAll(/(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})/g)) {
    years.add(parseInt(m[3]!, 10));
  }
  return [...years].filter((y) => y >= 1900 && y <= 2100).sort((a, b) => a - b);
}

function parseFioDateParts(
  dayStr: string,
  monthStr: string,
  yearStr: string,
): { day: number; month: number; year: number } | null {
  const day = parseInt(dayStr, 10);
  const month = parseInt(monthStr, 10);
  const year = parseInt(yearStr, 10);
  if (!isValidFioCalendarDate(day, month, year)) return null;
  return { day, month, year };
}

function isFioDateLine(line: string): boolean {
  const t = line.trim();
  return FIO_DATE_LINE.test(t) || FIO_PARTIAL_DATE_LINE.test(t);
}

/** Parsuje D.M.YYYY — rok vždy přímo z textu (3. část po rozdělení tečkami). */
function parseFioDateLine(line: string): { day: number; month: number; year: number } | null {
  const t = line.trim();
  const m = t.match(FIO_DATE_LINE);
  if (!m) return null;
  return parseFioDateParts(m[1]!, m[2]!, m[3]!);
}

function parseFioPartialDateLine(line: string): { day: number; month: number } | null {
  const m = line.trim().match(FIO_PARTIAL_DATE_LINE);
  if (!m) return null;
  const day = parseInt(m[1]!, 10);
  const month = parseInt(m[2]!, 10);
  if (month < 1 || month > 12 || day < 1) return null;
  return { day, month };
}

/**
 * Datum účtování z bloku transakce.
 * PDF může mít jen „27.2.“ a rok v jiném sloupci — doplní se z období výpisu nebo z data transakce ve stejném bloku.
 */
function parseBookingDateFromBlock(
  block: string[],
  statementYears: number[],
): { day: number; month: number; year: number } | null {
  const fullDates: { day: number; month: number; year: number }[] = [];
  for (const line of block) {
    const d = parseFioDateLine(line);
    if (d) fullDates.push(d);
  }

  if (fullDates.length >= 2) {
    const booking = fullDates[0]!;
    const txn = fullDates[1]!;
    if (booking.day === txn.day && booking.month === txn.month) {
      return { day: booking.day, month: booking.month, year: txn.year };
    }
  }

  if (fullDates.length >= 1) {
    const first = fullDates[0]!;
    if (statementYears.length > 0 && !statementYears.includes(first.year)) {
      const fallback = statementYears.find((y) => isValidFioCalendarDate(first.day, first.month, y));
      if (fallback != null) {
        return { day: first.day, month: first.month, year: fallback };
      }
    }
    return first;
  }

  const partial = parseFioPartialDateLine(block[0] ?? "");
  if (!partial) return null;

  for (let i = 1; i < Math.min(block.length, 4); i++) {
    const ym = block[i]!.trim().match(FIO_YEAR_ONLY_LINE);
    if (!ym) continue;
    const year = parseInt(ym[1]!, 10);
    if (statementYears.length > 0 && !statementYears.includes(year)) continue;
    const d = parseFioDateParts(String(partial.day), String(partial.month), ym[1]!);
    if (d) return d;
  }

  if (statementYears.length === 1) {
    const d = parseFioDateParts(
      String(partial.day),
      String(partial.month),
      String(statementYears[0]),
    );
    if (d) return d;
  }

  if (statementYears.length > 1) {
    const y = statementYears.find((yr) => isValidFioCalendarDate(partial.day, partial.month, yr));
    if (y != null) {
      return { day: partial.day, month: partial.month, year: y };
    }
  }

  return null;
}

function isStandaloneAmountLine(line: string): boolean {
  return FIO_STANDALONE_AMOUNT.test(line.trim());
}

function isFioColumnHeaderLine(line: string): boolean {
  const l = line.trim();
  if (FIO_COLUMN_HEADERS.some((h) => l === h)) return true;
  if (/Datum účtování/i.test(l) && /Datum transakce/i.test(l)) return true;
  if (/^Číslo protiúčtu/i.test(l) && /Kód banky/i.test(l)) return true;
  return false;
}

function isFioNoiseLine(line: string): boolean {
  const l = line.trim();
  if (!l) return true;
  if (/^Fio banka/i.test(l)) return true;
  if (/IČ\s*61858374/i.test(l)) return true;
  if (/FIOBCZPP/i.test(l)) return true;
  if (/Na Florenci/i.test(l)) return true;
  if (/^Výpis operací/i.test(l)) return true;
  if (isFioColumnHeaderLine(l)) return true;
  if (/^IBAN\b|^BIC\b|^Typ účtu|^Datum zřízení|^Měna\b|^Datum výpisu|^Výpis za období/i.test(l)) {
    return true;
  }
  if (/Starý zůstatek|Suma příjmů|Suma výdajů|Nový zůstatek|Majitel účtu/i.test(l)) return true;
  if (/^Číslo účtu:/i.test(l)) return true;
  if (/^Spisová značka:/i.test(l)) return true;
  if (/^\d+\s+z\s+\d+$/i.test(l)) return true;
  return false;
}

function isOpTypeLine(line: string): boolean {
  const s = line.trim();
  if (!s || isFioDateLine(s)) return false;
  for (const prefix of FIO_OP_TYPE_PREFIXES) {
    if (s.startsWith(prefix)) return true;
  }
  return false;
}

function isFioSkippableContentLine(line: string): boolean {
  const l = line.trim();
  if (!l) return true;
  if (/^VS:\s*\d+/i.test(l)) return true;
  if (/^KS:\s*\d+/i.test(l)) return true;
  if (/^SS:\s*\d+/i.test(l)) return true;
  if (FIO_ACCOUNT.test(l) && l.replace(FIO_ACCOUNT, "").trim().length < 4) return true;
  if (FIO_OP_ID_LINE.test(l)) return true;
  if (isFioDateLine(l)) return true;
  return false;
}

function parseOpTypeLine(line: string): string {
  let s = line.trim();
  const acc = s.match(FIO_ACCOUNT);
  if (acc) {
    s = s.replace(acc[0], "").replace(/\s+/g, " ").trim();
  }
  for (const prefix of FIO_OP_TYPE_PREFIXES) {
    if (s.startsWith(prefix)) return prefix;
  }
  return s.split(/\s{2,}/)[0]?.trim() || s;
}

function extractMerchantFromNakup(line: string): string | undefined {
  const m = line.match(/Nákup:\s*([^,;]+)/i);
  return m?.[1]?.trim() || undefined;
}

function extractEmbeddedAmount(line: string): number | null {
  const m = line.match(/částka\s+([\d]+(?:[.,]\d{2})?)\s+CZK/i);
  if (!m) return null;
  return parseFioMoney(m[1]!.replace(".", ","));
}

function extractTrailingFioAmount(line: string): number | null {
  const tail = line.trim().match(/(-?\d{1,3}(?:\s\d{3})*,\d{2})$/);
  if (!tail) return null;
  return parseFioMoney(tail[1]!);
}

function extractAmountFromLine(line: string): number | null {
  const trimmed = line.trim();
  if (isStandaloneAmountLine(trimmed)) return parseFioMoney(trimmed);

  const embedded = extractEmbeddedAmount(trimmed);
  if (embedded != null && isFinite(embedded)) {
    if (/^Nákup:/i.test(trimmed) || /Výběr z bankomatu/i.test(trimmed)) {
      return -Math.abs(embedded);
    }
    if (/Vklad/i.test(trimmed)) return Math.abs(embedded);
    return embedded;
  }

  // Typ operace + protiúčet + částka na jednom řádku (např. Okamžitá odchozí platba)
  if (isOpTypeLine(trimmed)) {
    const fromOp = extractTrailingFioAmount(trimmed);
    if (fromOp != null && isFinite(fromOp)) return fromOp;
  }

  const tail = extractTrailingFioAmount(trimmed);
  if (tail != null && isFinite(tail) && trimmed.length <= 48) return tail;
  return null;
}

function isInnerTransactionDate(lines: string[], index: number): boolean {
  if (!isFioDateLine(lines[index]!)) return false;
  for (let j = index - 1; j >= Math.max(0, index - 3); j--) {
    const prev = lines[j]!.trim();
    if (isFioNoiseLine(prev)) continue;
    if (isStandaloneAmountLine(prev)) return true;
    return false;
  }
  return false;
}

/** První řádek, který vypadá jako začátek transakce (datum + typ/částka v okolí). */
function findFioDataStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (!/^Výpis operací/i.test(lines[i]!)) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (isFioNoiseLine(lines[j]!)) continue;
      if (!isFioDateLine(lines[j]!) || isInnerTransactionDate(lines, j)) continue;
      for (let k = j + 1; k < Math.min(j + 6, lines.length); k++) {
        if (isFioNoiseLine(lines[k]!)) continue;
        if (isOpTypeLine(lines[k]!) || isStandaloneAmountLine(lines[k]!)) return j;
        if (isFioDateLine(lines[k]!)) break;
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (isFioNoiseLine(lines[i]!)) continue;
    if (!isFioDateLine(lines[i]!) || isInnerTransactionDate(lines, i)) continue;
    for (let k = i + 1; k < Math.min(i + 6, lines.length); k++) {
      if (isFioNoiseLine(lines[k]!)) continue;
      if (isOpTypeLine(lines[k]!) || isStandaloneAmountLine(lines[k]!)) return i;
      if (isFioDateLine(lines[k]!)) break;
    }
  }

  return 0;
}

/**
 * Začátek transakce = datum účtování (ne datum transakce uprostřed bloku).
 * PDF text má sloupce pod sebou: datum → typ → částka → datum transakce → popis → ID → …
 */
function findFioTxStarts(lines: string[], dataStart: number): number[] {
  const starts: number[] = [];

  for (let i = dataStart; i < lines.length; i++) {
    if (isFioNoiseLine(lines[i]!)) continue;
    if (!isFioDateLine(lines[i]!)) continue;
    if (isInnerTransactionDate(lines, i)) continue;

    let hasOpOrAmount = false;
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      if (isFioNoiseLine(lines[j]!)) continue;
      if (isFioDateLine(lines[j]!) && j > i + 1) break;
      if (isOpTypeLine(lines[j]!) || isStandaloneAmountLine(lines[j]!)) {
        hasOpOrAmount = true;
        break;
      }
    }

    if (hasOpOrAmount) starts.push(i);
  }

  return starts;
}

function findAmountInBlock(block: string[]): number | null {
  for (let j = block.length - 1; j >= 1; j--) {
    const l = block[j]!.trim();
    if (isStandaloneAmountLine(l)) {
      const v = parseFioMoney(l);
      if (isFinite(v) && Math.abs(v) >= 0.01 && Math.abs(v) <= MAX_TRANSACTION_CZK) return v;
    }
  }

  for (let j = 1; j < block.length; j++) {
    const v = extractAmountFromLine(block[j]!);
    if (v != null && isFinite(v) && Math.abs(v) >= 0.01 && Math.abs(v) <= MAX_TRANSACTION_CZK) {
      return v;
    }
  }

  return null;
}

function findOpTypeInBlock(block: string[]): string {
  for (let j = 1; j < block.length; j++) {
    if (isOpTypeLine(block[j]!)) return parseOpTypeLine(block[j]!);
  }
  return "";
}

function buildFioDescription(block: string[], opType: string): string {
  const contentLines = block
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !isFioNoiseLine(l))
    .filter((l) => !isFioSkippableContentLine(l))
    .filter((l) => !isOpTypeLine(l))
    .filter((l) => !isStandaloneAmountLine(l));

  if (/platba\s+kartou/i.test(opType)) {
    for (const l of contentLines) {
      const merchant = extractMerchantFromNakup(l);
      if (merchant) return merchant;
    }
  }

  if (/výběr\s+z\s+bankomatu/i.test(opType)) {
    for (const l of contentLines) {
      const m = l.match(/Výběr z bankomatu:\s*(.+)/i);
      if (m?.[1]) return m[1].trim().slice(0, 120);
    }
    return "Výběr z bankomatu";
  }

  if (/vklad/i.test(opType)) {
    for (const l of contentLines) {
      if (l.length > 2) return l.slice(0, 120);
    }
    return "Vklad do bankomatu";
  }

  for (const l of contentLines) {
    const merchant = extractMerchantFromNakup(l);
    if (merchant) return merchant;
  }

  const descParts: string[] = [];
  for (const l of contentLines) {
    if (/^\d+$/.test(l)) continue;
    if (l.length > 2) descParts.push(l);
  }
  if (descParts.length > 0) {
    return descParts.join(" · ").slice(0, 120);
  }

  return opType || "Bez popisu";
}

function extractFioStatementAccount(text: string): string | undefined {
  const m = text.match(/Číslo účtu:\s*\n?\s*((?:\d{1,6}-)?\d{2,10}\/\d{4})/i);
  if (!m?.[1]) return undefined;
  return normalizeAccount(m[1]) ?? undefined;
}

function extractFioOpId(block: string[]): string | undefined {
  for (const l of block) {
    if (FIO_OP_ID_LINE.test(l.trim())) return l.trim();
  }
  return undefined;
}

function extractFioCounterparty(
  block: string[],
  opts: { statementAccount?: string; isCardPayment?: boolean },
): {
  counterpartyAccount?: string;
  counterpartyName?: string;
} {
  // Kartová platba / ATM — protiúčet ve výpisu není (nesmí se vzít účet z hlavičky stránky)
  if (opts.isCardPayment) {
    return {};
  }

  let counterpartyAccount: string | undefined;
  let counterpartyName: string | undefined;
  for (let j = 0; j < block.length; j++) {
    const l = block[j]!;
    // Přeskoč účet hned za „Číslo účtu:“ (hlavička na další stránce)
    const prev = block[j - 1]?.trim() ?? "";
    if (/^Číslo účtu/i.test(prev)) continue;

    const acc = l.match(/\b(\d{1,6}-)?\d{2,10}\/\d{4}\b/);
    if (acc) {
      const n = normalizeAccount(acc[0]);
      if (!n) continue;
      // Nikdy neukládej vlastní účet z hlavičky výpisu jako protiúčet
      if (opts.statementAccount && n === opts.statementAccount) continue;
      counterpartyAccount = n;
      const next = block[j + 1];
      if (next && !/^\d/.test(next) && next.length > 2 && next.length < 80) {
        if (!isOpTypeLine(next) && !/^Nákup:/i.test(next) && !/^VS:/i.test(next)) {
          counterpartyName = next.trim();
        }
      }
      break;
    }
  }
  return { counterpartyAccount, counterpartyName };
}

export function parseFioPdfPlainText(
  text: string,
  ownerAccounts: string[] = [],
  deps: FioParseDeps,
): FioParsedImportRow[] {
  return parseFioPdf(text, ownerAccounts, deps);
}

/** Hlavní vstupní bod — parsuje extrahovaný text Fio PDF výpisu. */
export function parseFioPdf(
  text: string,
  ownerAccounts: string[] = [],
  deps: FioParseDeps,
): FioParsedImportRow[] {
  const lines = fioPlainTextToLines(text);
  const statementYears = extractFioStatementYears(text);
  const statementAccount = extractFioStatementAccount(text);
  const dataStart = findFioDataStart(lines);
  const txStarts = findFioTxStarts(lines, dataStart);
  const rows: FioParsedImportRow[] = [];
  const seen = new Set<string>();

  console.log(
    "[fio-pdf-parse] lines:",
    lines.length,
    "| statementYears:",
    statementYears.join(","),
    "| statementAccount:",
    statementAccount ?? "(none)",
    "| dataStart:",
    dataStart,
    "| tx blocks:",
    txStarts.length,
  );
  console.log(
    "[fio-pdf-parse] first 30 normalized lines:",
    lines.slice(0, 30).map((l, i) => `[${i}] ${l}`).join("\n"),
  );

  for (let s = 0; s < txStarts.length; s++) {
    const start = txStarts[s]!;
    const end = txStarts[s + 1] ?? lines.length;
    const block = lines
      .slice(start, end)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !isFioNoiseLine(l));

    const amountDbg = findAmountInBlock(block);
    const opTypeDbg = findOpTypeInBlock(block);
    console.log(
      "[FIO-BLOCK-DEBUG]",
      JSON.stringify({ block: s, lines: block.slice(0, 5), amount: amountDbg, opType: opTypeDbg }),
    );

    if (block.length < 2) continue;

    const bookingDate = parseBookingDateFromBlock(block, statementYears);
    if (!bookingDate) continue;

    const rawAmount = findAmountInBlock(block);
    if (rawAmount == null) continue;

    const opType = findOpTypeInBlock(block);
    const isCardPayment = /platba\s+kartou|výběr\s+z\s+bankomatu/i.test(opType);
    const description = buildFioDescription(block, opType);
    const { counterpartyAccount, counterpartyName } = extractFioCounterparty(block, {
      statementAccount,
      isCardPayment,
    });
    const isSelfTransfer = isOwnCounterpartyAccount(counterpartyAccount, ownerAccounts);

    const type: "income" | "expense" = rawAmount >= 0 ? "income" : "expense";
    const amount = Math.abs(rawAmount);
    const { day, month, year } = bookingDate;
    const date = formatFioDateIso(day, month, year);

    const opId = extractFioOpId(block) ?? "";
    const cpMeta = {
      ...(counterpartyAccount ? { counterpartyAccount } : {}),
      ...(counterpartyName ? { counterpartyName } : {}),
      ...(opId ? { bankTransactionId: opId } : {}),
    };

    if (isSelfTransfer) {
      const key = opId ? `opid:${opId}` : `${date}|${rawAmount}|převod`;
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
        ...cpMeta,
      });
      continue;
    }

    const bucket = deps.classifyCsob(description, undefined);
    const category = deps.bucketToStoreCategory(bucket, type);

    const key = opId ? `opid:${opId}` : `${date}|${rawAmount}|${description.slice(0, 96)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      date,
      rawAmount,
      description: description || "Bez popisu",
      type,
      amount,
      bucket,
      category,
      ...cpMeta,
    });
  }

  return rows.filter((t) => t.amount >= 0.01);
}
