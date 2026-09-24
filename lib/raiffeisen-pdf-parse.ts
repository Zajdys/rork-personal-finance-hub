/**
 * Raiffeisenbank výpis z plain textu (pdf.co): řádek D. M. YYYY Platba … částka CZK,
 * volitelně řádek PK: … a řádek obchodníka „Název; město; CZE“, nebo číslo účtu + protiúčet.
 */
import type { ImportBucket, ParsedImportRow } from '@/lib/bank-statement-parser';
import { BUCKET_TO_EXPENSE_CATEGORY, DEFAULT_INCOME_CATEGORY } from '@/lib/bank-statement-parser';
import { classifyCsob, csobPlainTextToLines } from '@/lib/csob-pdf-parse';

/** Částka vždy na konci celého řádku před „CZK“ (poslední číslo před CZK). */
const amountRegex = /(-?\d{1,3}(?:[\s ]\d{3})*[.,]\d{2})\s*CZK\s*$/;

/** Datum Raiffeisen „D. M. YYYY“ na začátku řádku (např. 1. 2. 2026). */
const DATE_LINE_PREFIX = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/;

/** Rozumný horní limit jedné transakce při importu (ochrana před chybným spojením s VS/účtem). */
const MAX_TRANSACTION_CZK = 2_000_000;

/** Řádek obsahuje český formát číslo účtu/kód banky (např. 2001141349/0800) kdekoli v textu. */
function isAccountOrRefLine(line: string): boolean {
  return /\d{6,}\/\d{4}\b/.test(line.trim());
}

/** Platba kartou: řádek s maskovanou kartou „PK: 408359XXXXXX3561“ kdekoli v textu. */
function isPkCardLine(line: string): boolean {
  return /PK:\s*\d{6}X+\d+/i.test(line.trim());
}

function parseRbAmountToken(tok: string): number {
  let s = tok.replace(/\s/g, '').replace(/[−\u2212]/g, '-');
  if (/,(\d{2})$/.test(s)) {
    s = s.replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return n;
}

export type ParsedRbTxnLine = {
  day: number;
  month: number;
  year: number;
  descRest: string;
  rawAmount: number;
};

/** Parsuje jeden řádek výpisu RB s částkou v CZK (regex na celý řádek). */
export function tryParseRaiffeisenTxnLine(line: string): ParsedRbTxnLine | null {
  const trimmed = line.trim();
  const am = trimmed.match(amountRegex);
  if (!am) return null;
  const rawAmount = parseRbAmountToken(am[1]!);
  if (!isFinite(rawAmount)) return null;

  const head = trimmed.slice(0, trimmed.length - am[0].length).trimEnd();
  const dm = head.match(DATE_LINE_PREFIX);
  if (!dm) return null;

  const day = +dm[1]!;
  const month = +dm[2]!;
  const year = +dm[3]!;
  const descRest = head.slice(dm[0].length).trim();
  if (!descRest) return null;

  return { day, month, year, descRest, rawAmount };
}

/**
 * descRest může mít více řádků (PK/KS apod.) — normalizuj mezery a použij slova jako celek.
 */
function isPlatbaKartouNeboNaInternetu(descRest: string): boolean {
  const t = descRest.toLowerCase().replace(/\s+/g, ' ').trim();
  return /\bplatba\s+kartou\b/.test(t) || /\bplatba\s+na\s+internetu\b/.test(t);
}

/**
 * Čištění názvu obchodníka (po řezu na část před „;“ z Raiffeisen řádku).
 * @param fullLineForHints celý řádek merchantu (např. pro „Trading“ → „Trading 212“ když je 212 jinde v řádku)
 */
export function cleanMerchantName(raw: string, fullLineForHints?: string): string {
  const hint = (fullLineForHints ?? raw).toLowerCase();

  // Odstraň hvězdičky a čísla karet
  let name = raw.replace(/\*+\d*/g, '').replace(/\*+/g, '').trim();

  // Odstraň .cz, .com/bill atd.
  name = name.replace(/\.com\/\w+/gi, '').replace(/\.cz$/gi, '').trim();

  const BRAND_MAP: Record<string, string> = {
    'kaufland': 'Kaufland',
    'penny': 'Penny',
    'tesco': 'Tesco',
    'albert': 'Albert',
    'lidl': 'Lidl',
    'billa': 'Billa',
    'ikea': 'IKEA',
    'datart': 'Datart',
    'vodafone': 'Vodafone',
    'mcdonald': "McDonald's",
    'revolut': 'Revolut',
    'foodora': 'Foodora',
    'gymbeam': 'GymBeam',
    'apple': 'Apple',
    'c & a': 'C&A',
    'trading 212': 'Trading 212',
    'arriva': 'Arriva',
    'autobusy': 'Autobusy',
    'coop': 'Coop',
    'aktin': 'Aktin',
    'ceska posta': 'Česká pošta',
    'max fitness': 'Max Fitness',
    'bazen': 'Bazén Slovany',
    'galerie slovany': 'Galerie Slovany',
    'running sushi': 'Running Sushi Sumo',
    'payu': 'PayU',
    'tipsport': 'Tipsport',
  };

  const brandEntries = Object.entries(BRAND_MAP).sort((a, b) => b[0].length - a[0].length);
  let lower = name.toLowerCase();
  for (const [key, cleanName] of brandEntries) {
    if (lower.includes(key)) return cleanName;
  }

  // „Trading“ → „Trading 212“, pokud je v celém řádku merchantu
  if (hint.includes('trading 212') && /^\s*trading\s*$/i.test(name.trim())) {
    return 'Trading 212';
  }

  // Odstraň číslo pobočky na konci (3–5 číslic)
  name = name.replace(/\s+\d{3,5}$/, '').trim();

  // Odstraň typické „Cz“ za řetězcem (např. Kaufland Cz)
  name = name.replace(/\s+cz$/i, '').trim();

  // Title case
  return name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Řádek obchodníka „Název; City; CZE“ (po PK) → title.
 */
export function extractRaiffeisenMerchant(line: string): string {
  const beforeSemicolon = line.split(';')[0].trim();
  return cleanMerchantName(beforeSemicolon, line);
}

/** Merchant řádek hned za „PK: …“ — může být uvnitř víceřádkového descRest, ne jen v následujících řádcích PDF. */
function extractMerchantLineAfterPkInDesc(descRest: string): string | undefined {
  const lines = descRest
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  for (let i = 0; i < lines.length; i++) {
    if (isPkCardLine(lines[i]!) && i + 1 < lines.length) {
      return lines[i + 1]!;
    }
  }
  return undefined;
}

/** title: PK+merchant pro kartou/internet; jinak protiúčet; jinak vyčištěný popis. */
function rbHumanTitle(
  descRest: string,
  merchantAfterPk?: string,
  counterpartyLine?: string,
): string {
  const kartouNeboNet = isPlatbaKartouNeboNaInternetu(descRest);

  const logRb = (title: string) => {
    console.log('[rb-parse] descRest:', JSON.stringify(descRest));
    console.log('[rb-parse] merchantAfterPk:', JSON.stringify(merchantAfterPk));
    console.log('[rb-parse] title:', title);
    return title;
  };

  if (kartouNeboNet && merchantAfterPk) {
    return logRb(extractRaiffeisenMerchant(merchantAfterPk));
  }

  if (!kartouNeboNet && counterpartyLine) {
    const cp = counterpartyLine.split(';')[0].trim();
    if (cp) return logRb(cp.replace(/\s+/g, ' ').trim());
  }

  const cleaned = descRest
    .replace(/platba kartou apple pay/gi, '')
    .replace(/platba na internetu apple pay/gi, '')
    .replace(/platba kartou/gi, '')
    .replace(/platba na internetu/gi, '')
    .replace(/apple pay/gi, '')
    .replace(/KS:\d+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const title =
    cleaned ||
    counterpartyLine?.split(';')[0]?.trim() ||
    'Platba kartou';

  return logRb(title);
}

export function parseRaiffeisenLinesToImportRows(lines: string[]): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const parsed = tryParseRaiffeisenTxnLine(line);
    if (!parsed) continue;

    const amountAbs = Math.abs(parsed.rawAmount);
    if (amountAbs > MAX_TRANSACTION_CZK) {
      console.warn(
        '[Raiffeisen import] Přeskočena transakce s částkou nad limitem:',
        MAX_TRANSACTION_CZK,
        'Kč —',
        line.slice(0, 200),
        '→',
        parsed.rawAmount,
      );
      continue;
    }

    let merchantAfterPk: string | undefined = extractMerchantLineAfterPkInDesc(parsed.descRest);
    let counterpartyLine: string | undefined;
    for (let j = i + 1; j < lines.length; j++) {
      const L = lines[j].trim();
      if (tryParseRaiffeisenTxnLine(L)) break;
      if (!merchantAfterPk && isPkCardLine(L) && j + 1 < lines.length) {
        const next = lines[j + 1].trim();
        if (!tryParseRaiffeisenTxnLine(next)) merchantAfterPk = next;
      }
      if (isAccountOrRefLine(L) && j + 1 < lines.length) {
        const next = lines[j + 1].trim();
        if (!tryParseRaiffeisenTxnLine(next)) counterpartyLine = next;
      }
    }

    const title = rbHumanTitle(parsed.descRest, merchantAfterPk, counterpartyLine);
    const descForClassify = title;

    const type: 'income' | 'expense' = parsed.rawAmount >= 0 ? 'income' : 'expense';
    const amount = Math.abs(parsed.rawAmount);
    const bucket: ImportBucket = classifyCsob(
      descForClassify,
      counterpartyLine?.split(';')[0]?.trim() ?? merchantAfterPk?.split(';')[0]?.trim(),
    );
    const category = type === 'income' ? DEFAULT_INCOME_CATEGORY : BUCKET_TO_EXPENSE_CATEGORY[bucket];

    const check = new Date(parsed.year, parsed.month - 1, parsed.day);
    if (check.getMonth() !== parsed.month - 1) continue;

    const date = `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;

    const key = `${parsed.day}|${parsed.month}|${parsed.year}|${parsed.rawAmount}|${title.slice(0, 96)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      date,
      rawAmount: parsed.rawAmount,
      description: title || 'Bez popisu',
      type,
      amount,
      bucket,
      category,
    });
  }

  return rows;
}

export function parseRaiffeisenPdfPlainText(text: string): ParsedImportRow[] {
  const lines = csobPlainTextToLines(text);
  return parseRaiffeisenLinesToImportRows(lines);
}
