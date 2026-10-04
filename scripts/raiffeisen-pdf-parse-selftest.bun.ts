/**
 * Self-test: produkční Edge Raiffeisenbank „block“ parser
 * (parseRaiffeisenLinesToImportRows / parseRaiffeisenPdfPlainText)
 * proti reálným pdfjs raw fixtures (scripts/fixtures/bank-pdf-raw/Vypis_0767628004_*.txt).
 *
 * NE importuje lib/raiffeisen-pdf-parse (one-line) — appka na RB PDF v produkci
 * používá Edge Function parse-bank-pdf-v2 (multi-line block layout).
 *
 * Run: bun scripts/raiffeisen-pdf-parse-selftest.bun.ts
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  parseRaiffeisenPdfPlainText,
  parseRaiffeisenLinesToImportRows,
  extractRaiffeisenMerchant,
} from '../supabase/functions/parse-bank-pdf-v2/raiffeisen-pdf-parse.ts';
import {
  csobPlainTextToLines,
  cleanMerchantName,
} from '../supabase/functions/parse-bank-pdf-v2/csob-pdf-parse.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function approx(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) <= eps;
}

/** Ztiš produkční debug logy Edge parseru během selftestu. */
const _log = console.log;
console.log = (...args: unknown[]) => {
  const s = String(args[0] ?? '');
  if (s.startsWith('[RB-') || s.startsWith('[CLASSIFY')) return;
  _log(...args);
};

const rawDir = join(import.meta.dir, 'fixtures/bank-pdf-raw');

console.log('=== Edge RB block parser self-test (real fixtures) ===');

assert(cleanMerchantName('ALBERT VAM DEKUJE; PLZEN; CZE') === 'Albert', 'cleanMerchantName Albert');
assert(extractRaiffeisenMerchant('GOOGLE *YouTubePremium; g.co/helppay#;') === 'YouTube Premium', 'YT merchant');

const rbFiles = readdirSync(rawDir)
  .filter((n) => n.startsWith('Vypis_0767628004') && n.endsWith('.txt'))
  .sort();
assert(rbFiles.length >= 2, `need >=2 RB fixtures, got ${rbFiles.length}`);

for (const f of rbFiles) {
  const text = readFileSync(join(rawDir, f), 'utf8');
  assert(/Raiffeisenbank/i.test(text), `${f} header`);
  assert(/767628004/.test(text), `${f} account`);

  const rows = parseRaiffeisenPdfPlainText(text);
  console.log(`  ${f}: ${rows.length} txs`);
  assert(rows.length >= 50, `${f} expected many block txs, got ${rows.length}`);
  assert(
    rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.amount > 0),
    `${f} row shape`,
  );
  assert(rows.some((r) => r.type === 'expense' && r.rawAmount < 0), `${f} has expense`);
  assert(rows.some((r) => r.type === 'income' && r.rawAmount > 0), `${f} has income`);

  // Stejný výsledek přes lines → block parser přímo
  const viaLines = parseRaiffeisenLinesToImportRows(csobPlainTextToLines(text));
  assert(viaLines.length === rows.length, `${f} LinesToImportRows length mismatch`);
}

/** Březen 2026 — konkrétní transakce z reálného výpisu (pdfjs multi-line). */
console.log('--- Mar 2026 concrete txs ---');
const marText = readFileSync(join(rawDir, 'Vypis_0767628004_CZK_2026_003.txt'), 'utf8');
const mar = parseRaiffeisenPdfPlainText(marText);
console.log(
  '  sample:',
  mar
    .slice(0, 8)
    .map((r) => `${r.date} ${r.rawAmount} | ${r.description}`)
    .join(' · '),
);

assert(mar.length === 127, `Mar expected 127 txs, got ${mar.length}`);

const albert132 = mar.find(
  (r) => /Albert/i.test(r.description) && approx(Math.abs(r.rawAmount), 132.1),
);
assert(!!albert132 && albert132.rawAmount < 0, 'Mar Albert -132.10 (PK + merchant block)');

const yt = mar.find(
  (r) =>
    /YouTube|Premium/i.test(r.description) &&
    approx(Math.abs(r.rawAmount), 389) &&
    r.date === '2026-03-29',
);
assert(!!yt && yt.rawAmount < 0, 'Mar YouTube Premium -389 (zaúčtování 29.3.)');
assert(
  yt!.bookingDate === '2026-03-27',
  `Mar YouTube bookingDate (valuta) expected 2026-03-27, got ${yt!.bookingDate}`,
);

const ytEarly = mar.find(
  (r) =>
    /YouTube|Premium/i.test(r.description) &&
    approx(Math.abs(r.rawAmount), 389) &&
    r.date === '2026-03-01',
);
assert(!!ytEarly, 'Mar early YouTube on booking 2026-03-01');
assert(ytEarly!.bookingDate === '2026-02-27', `Mar early YouTube valuta ${ytEarly!.bookingDate}`);

const jakub = mar.find(
  (r) => /Jakub Matas/i.test(r.description) && approx(r.rawAmount, 130) && r.type === 'income',
);
assert(!!jakub, 'Mar Příchozí Jakub Matas +130');

const anna = mar.find((r) => /Anna Medve/i.test(r.description) && approx(r.rawAmount, 2000));
assert(!!anna && anna.type === 'income', 'Mar Anna Medveďová +2000');

assert(mar.filter((r) => /Albert/i.test(r.description)).length >= 3, 'Mar multiple Albert card txs');
assert(mar.filter((r) => r.type === 'income').length >= 40, 'Mar many incomes');
assert(mar.filter((r) => r.type === 'expense').length >= 60, 'Mar many expenses');

/** Karta s držitelem „JAN HÁJEK“ v bloku — ani s ownerName nesmí být Převod. */
console.log('--- Card + holder name must not be Převod ---');
const marWithOwner = parseRaiffeisenPdfPlainText(marText, 'Jan Hájek', []);
const albertHolder = marWithOwner.find(
  (r) => /Albert/i.test(r.description) && approx(Math.abs(r.rawAmount), 132.1),
);
assert(!!albertHolder && albertHolder.rawAmount < 0, 'Albert -132.10 with ownerName');
assert(
  albertHolder!.category !== 'Převod',
  `RB card ALBERT+JAN HAJEK must not be Převod, got ${albertHolder!.category}`,
);
assert(
  !albertHolder!.counterpartyAccount,
  'RB card must have null counterpartyAccount',
);

/** Kartové vratky (Jednorázová + PK + kladná) — ověřené případy. */
console.log('--- Card refunds ---');
function assertRefund(
  rows: ReturnType<typeof parseRaiffeisenPdfPlainText>,
  pred: (r: (typeof rows)[0]) => boolean,
  label: string,
) {
  const hit = rows.find(pred);
  assert(!!hit, `missing refund: ${label}`);
  assert(hit!.type === 'income', `${label} type income`);
  assert(hit!.isRefund === true, `${label} isRefund`);
  assert(!/Výpis z běžného|K0000810|Jednorázová|PK:/i.test(hit!.description), `${label} clean title: ${hit!.description}`);
  assert(hit!.description.length < 80, `${label} short title len=${hit!.description.length}`);
}

const decPath = join(rawDir, 'Vypis_0767628004_CZK_2025_012.txt');
const augPath = join(rawDir, 'Vypis_0767628004_CZK_2025_008.txt');
const sepPath = join(rawDir, 'Vypis_0767628004_CZK_2025_009.txt');
const octPath = join(rawDir, 'Vypis_0767628004_CZK_2025_010.txt');
const novPath = join(rawDir, 'Vypis_0767628004_CZK_2025_011.txt');
const junPath = join(rawDir, 'Vypis_0767628004_CZK_2026_006.txt');
const aug26Path = join(rawDir, 'Vypis_0767628004_CZK_2026_008.txt');

function loadIf(p: string) {
  try {
    return parseRaiffeisenPdfPlainText(readFileSync(p, 'utf8').replace(/---PAGE---\n?/g, '\n'));
  } catch {
    return null;
  }
}

const dec = loadIf(decPath);
if (dec) {
  assertRefund(dec, (r) => r.isRefund === true && /OK INVEST/i.test(r.description) && approx(r.amount, 890), 'OK INVESTICE 890');
  const glued = dec.filter((r) => /Výpis z běžného|K0000810|Raiffeisenbank a\.s/i.test(r.description));
  assert(glued.length === 0, `Dec glued headers: ${glued.length}`);
}

const aug = loadIf(augPath);
if (aug) {
  assertRefund(aug, (r) => r.isRefund === true && /APPLE|Apple/i.test(r.description) && approx(r.amount, 699), 'APPLE 699');
}

const sep = loadIf(sepPath);
if (sep) {
  assertRefund(sep, (r) => r.isRefund === true && /Alza/i.test(r.description) && approx(r.amount, 1166), 'Alza 1166');
}

const oct = loadIf(octPath);
if (oct) {
  assertRefund(oct, (r) => r.isRefund === true && /Alza/i.test(r.description) && approx(r.amount, 791), 'Alza 791');
}

const nov = loadIf(novPath);
if (nov) {
  assertRefund(nov, (r) => r.isRefund === true && /DECATHLON|Decathlon/i.test(r.description) && approx(r.amount, 699), 'Decathlon 699');
}

assertRefund(
  mar,
  (r) => r.isRefund === true && approx(r.amount, 169) && /Dráh|cd\.cz|České/i.test(r.description),
  'cd.cz 169',
);
assertRefund(
  mar,
  (r) => r.isRefund === true && /Trading\s*212/i.test(r.description) && approx(r.amount, 100),
  'Trading 212 100',
);

const jun = loadIf(junPath);
if (jun) {
  assertRefund(jun, (r) => r.isRefund === true && /Alza/i.test(r.description) && approx(r.amount, 296), 'Alza 296');
  assertRefund(jun, (r) => r.isRefund === true && /Hornbach/i.test(r.description) && approx(r.amount, 849), 'Hornbach 849');
}

const aug26 = loadIf(aug26Path);
if (aug26) {
  assertRefund(aug26, (r) => r.isRefund === true && /Hornbach/i.test(r.description) && approx(r.amount, 405), 'Hornbach 405');
  assertRefund(aug26, (r) => r.isRefund === true && /Hornbach/i.test(r.description) && approx(r.amount, 219), 'Hornbach 219');
}

/** Leden 2026 fixture — block parser musí také vrátit desítky tx. */
console.log('--- Jan 2026 smoke ---');
const jan = parseRaiffeisenPdfPlainText(
  readFileSync(join(rawDir, 'Vypis_0767628004_CZK_2026_001.txt'), 'utf8'),
);
assert(jan.length === 106, `Jan expected 106 txs, got ${jan.length}`);
assert(jan.some((r) => /Albert|Tesco|Penny|Lidl|YouTube/i.test(r.description)), 'Jan merchants');

/** Odchozí okamžitá bez jména → counterpartyName undefined; HÁJEK JAN u 283199805/0600 zachován. */
console.log('--- counterpartyName / Odchozí okamžitá ---');
const aug26All = parseRaiffeisenPdfPlainText(
  readFileSync(join(rawDir, 'Vypis_0767628004_CZK_2026_008.txt'), 'utf8'),
);
const odchozi300 = aug26All.find(
  (r) =>
    r.counterpartyAccount === '283199805/0600' &&
    approx(r.amount, 300) &&
    r.type === 'expense',
);
assert(!!odchozi300, 'found Odchozí 300 → 283199805/0600');
assert(
  !odchozi300!.counterpartyName,
  `Odchozí bez jména must not store tx type as name, got: ${odchozi300!.counterpartyName}`,
);

const hajek79 = aug26All.find(
  (r) =>
    r.counterpartyAccount === '283199805/0600' &&
    approx(r.amount, 79) &&
    r.type === 'income',
);
assert(!!hajek79, 'found Příchozí 79 from 283199805/0600');
assert(
  normalizeName(hajek79!.counterpartyName || '') === 'hajek jan',
  `expect HÁJEK JAN, got: ${hajek79!.counterpartyName}`,
);

const junAll = parseRaiffeisenPdfPlainText(
  readFileSync(join(rawDir, 'Vypis_0767628004_CZK_2026_006.txt'), 'utf8'),
);
const odchozi20k = junAll.find(
  (r) =>
    r.counterpartyAccount === '3201219010/3030' &&
    approx(r.amount, 20000) &&
    r.type === 'expense',
);
assert(!!odchozi20k, 'found Odchozí 20k → 3201219010/3030');
assert(
  !odchozi20k!.counterpartyName,
  `Odchozí 20k must not store tx type, got: ${odchozi20k!.counterpartyName}`,
);

function normalizeName(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

console.log('=== ALL EDGE RB BLOCK PARSER SELF-TEST PASSED ===');
