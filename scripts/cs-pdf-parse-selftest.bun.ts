/**
 * Self-test for Česká spořitelna PDF parser (edge copy — no RN deps).
 * Run: bun scripts/cs-pdf-parse-selftest.bun.ts
 */
// @ts-nocheck — bun selftest; .ts imports mimo app tsc rozpočet
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  isCsPdfText,
  parseCsPdfPlainText,
  parseCsMoney,
  extractCsStatementBalances,
  verifyCsStatementBalance,
  csTransactionsToImportRows,
} from '../supabase/functions/parse-bank-pdf-v2/cs-pdf-parse.ts';

async function extractPdfPlainText(pdfPath: string): Promise<string> {
  const buf = readFileSync(pdfPath);
  const pdf = await pdfjs
    .getDocument({
      data: new Uint8Array(buf),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    })
    .promise;
  let full = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    full +=
      content.items.map((item: { str?: string }) => ('str' in item ? item.str ?? '' : '')).join('\n') +
      '\n';
  }
  return full;
}

/** Základní fixture bez rezervace (4 souhrnové řádky). */
const FIXTURE_JAN_2026 = `
Česká spořitelna, a.s.
GIBACZPP
Výpis z účtu
Standard účet
Číslo účtu 1234567890/0800
Období: 01.01.2026 - 31.01.2026
ZÁKLADNÍ ÚDAJE ÚČTU
Počáteční zůstatek +10 000.00
Celkem přišlo +25 000.00
Celkem odešlo -18 234.50
Konečný zůstatek +16 765.50

PŘEHLED POHYBŮ NA ÚČTU
Zaúčtováno Provedeno Položka Číslo protiúčtu Částka

05.01.2026
05.01.2026
Trvalý příkaz
9876543210/0800
Číslo instrukce: 42
Spořemí ČS
-2 000.00

10.01.2026
10.01.2026
Platba kartou
XXXXXXXXXXXX1234
d.tran.09.01.2026
TESCO STORES CR PRAHA
CZK 1 234.50 d.zúč.10.01.2026
částka v Kč: 1 234.50
-1 234.50

12.01.2026
12.01.2026
Tuzemská odchozí úhrada
okamžitá
1111222233/0100
Benzín
-1 500.00

15.01.2026
15.01.2026
Příchozí úhrada
ACME s.r.o.
5555666677/0300
Mzda
+25 000.00

18.01.2026
18.01.2026
Výběr hotovosti z bankomatu ČS
XXXXXXXXXXXX1234
d.tran.18.01.2026
PRAHA 1 BANKOMAT
CZK 2 000.00 d.zúč.18.01.2026
částka v Kč: 2 000.00
-2 000.00

20.01.2026
20.01.2026
Inkaso úvěru
Jan Novák
Anuita
-11 500.00

31.01.2026
31.01.2026
Cena za vedení účtu
+0.00

Konečný zůstatek +16 765.50
`.trim();

/**
 * Rozšířený souhrn: mezi Konečný zůstatek a PŘEHLED POHYBŮ NA ÚČTU
 * jsou navíc Rezervace prostředků + Disponibilní zůstatek (blokace karty).
 * Parser NESMÍ selhat kvůli těmto volitelným řádkům.
 */
const FIXTURE_WITH_RESERVATION = `
Česká spořitelna, a.s.
GIBACZPP
Výpis z účtu
Standard účet
Číslo účtu 1234567890/0800
Období: 01.02.2026 - 28.02.2026
ZÁKLADNÍ ÚDAJE ÚČTU
Počáteční zůstatek +16 765.50
Celkem přišlo +5 000.00
Celkem odešlo -3 000.00
Konečný zůstatek +18 765.50
Rezervace prostředků -1 250.00
Disponibilní zůstatek +17 515.50

PŘEHLED POHYBŮ NA ÚČTU
Zaúčtováno Provedeno Položka Číslo protiúčtu Částka

03.02.2026
03.02.2026
Tuzemská odchozí úhrada
2222333344/0100
Nájem
-3 000.00

20.02.2026
20.02.2026
Příchozí úhrada
Firma XYZ a.s.
9999888877/0300
Faktura
+5 000.00

Konečný zůstatek +18 765.50
`.trim();

/**
 * Regrese: protiúčet s předčíslím (19-2235210247/0800) + Telefon vyúčtování -585 Kč.
 * Dříve pdfjs často slepil účet s částkou → transakce zmizela.
 */
const FIXTURE_PREFIX_ACCOUNT_PHONE = `
Česká spořitelna, a.s.
GIBACZPP
Číslo účtu 1234567890/0800
Období: 01.03.2026 - 31.03.2026
ZÁKLADNÍ ÚDAJE ÚČTU
Počáteční zůstatek +10 000.00
Celkem přišlo +0.00
Celkem odešlo -585.00
Konečný zůstatek +9 415.00

PŘEHLED POHYBŮ NA ÚČTU
Zaúčtováno Provedeno Položka Číslo protiúčtu Částka

20.03.2026
20.03.2026
Tuzemská odchozí úhrada
19-2235210247/0800
Telefon vyúčtování
VS 9852191682
-585.00

21.03.2026
21.03.2026
Tuzemská odchozí úhrada
19-2235210247/0800 -585.00
Telefon vyúčtování

Konečný zůstatek +9 415.00
`.trim();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const stubDeps = {
  classifyCsob: () => 'Ostatní' as const,
  bucketToStoreCategory: () => 'Ostatní',
};

console.log('=== ČS PDF parser self-test ===');

assert(isCsPdfText(FIXTURE_JAN_2026), 'isCsPdfText should detect fixture');
assert(parseCsMoney('-46 511.00') === -46511, 'parseCsMoney negative');
assert(parseCsMoney('+2 274.18') === 2274.18, 'parseCsMoney positive');

const txs = parseCsPdfPlainText(FIXTURE_JAN_2026);
console.log('Parsed (basic):', txs.length);
for (const t of txs) console.log(`  ${t.date} ${t.rawAmount} | ${t.description}`);

assert(txs.length === 6, `expected 6, got ${txs.length}`);
assert(txs.some((t) => t.description.includes('TESCO') && t.amount === 1234.5), 'card');
assert(txs.some((t) => t.description === 'Benzín'), 'note');
assert(txs.some((t) => t.description === 'Mzda' && t.rawAmount === 25000), 'income note');
assert(txs.some((t) => t.description === 'Anuita'), 'inkaso note');

const bal = extractCsStatementBalances(FIXTURE_JAN_2026);
assert(bal.opening === 10000 && bal.closing === 16765.5, 'balances');
assert(bal.reservedFunds == null, 'no reservation on basic fixture');
assert(bal.availableBalance == null, 'no available on basic fixture');
const verify = verifyCsStatementBalance(FIXTURE_JAN_2026, txs);
assert(!!verify?.ok, `balance verify ${JSON.stringify(verify)}`);

const rows = csTransactionsToImportRows(txs, stubDeps);
assert(rows.every((r) => r.source === 'cs'), 'source');
assert(!isCsPdfText('CEKOCZPP ČSOB'), 'no csob FP');
assert(!isCsPdfText('RZBCCZPP Raiffeisenbank'), 'no rb FP');

console.log('--- reservation / available balance fixture ---');
const txsRes = parseCsPdfPlainText(FIXTURE_WITH_RESERVATION);
console.log('Parsed (with reservation):', txsRes.length);
for (const t of txsRes) console.log(`  ${t.date} ${t.rawAmount} | ${t.description}`);

assert(txsRes.length === 2, `reservation fixture expected 2 txs, got ${txsRes.length}`);
assert(txsRes.some((t) => t.description === 'Nájem' && t.rawAmount === -3000), 'najem');
assert(txsRes.some((t) => t.description === 'Faktura' && t.rawAmount === 5000), 'faktura');

const balRes = extractCsStatementBalances(FIXTURE_WITH_RESERVATION);
assert(balRes.opening === 16765.5, `res opening ${balRes.opening}`);
assert(balRes.totalIn === 5000, `res totalIn ${balRes.totalIn}`);
assert(balRes.totalOut === -3000, `res totalOut ${balRes.totalOut}`);
assert(balRes.closing === 18765.5, `res closing ${balRes.closing}`);
assert(balRes.reservedFunds === -1250, `reservedFunds ${balRes.reservedFunds}`);
assert(balRes.availableBalance === 17515.5, `availableBalance ${balRes.availableBalance}`);

const verifyRes = verifyCsStatementBalance(FIXTURE_WITH_RESERVATION, txsRes);
assert(!!verifyRes?.ok, `reservation balance verify ${JSON.stringify(verifyRes)}`);

console.log('--- prefix account / Telefon vyúčtování -585 ---');
const txsPhone = parseCsPdfPlainText(FIXTURE_PREFIX_ACCOUNT_PHONE);
console.log('Parsed (prefix account):', txsPhone.length);
for (const t of txsPhone) console.log(`  ${t.date} ${t.rawAmount} | ${t.description} | acc=${t.accountNumber}/${t.bankCode}`);

assert(txsPhone.length === 2, `expected 2 phone txs, got ${txsPhone.length}`);
const phoneTx = txsPhone.find((t) => t.date === '2026-03-20' && t.description === 'Telefon vyúčtování');
assert(!!phoneTx && phoneTx.rawAmount === -585, 'Telefon vyúčtování -585 missing');
assert(phoneTx!.accountNumber === '19-2235210247', `accountNumber got ${phoneTx!.accountNumber}`);
assert(phoneTx!.bankCode === '0800', `bankCode got ${phoneTx!.bankCode}`);
const gluedTx = txsPhone.find((t) => t.date === '2026-03-21' && t.rawAmount === -585);
assert(!!gluedTx, 'glued account+amount line should parse -585');
assert(gluedTx!.accountNumber === '19-2235210247', `glued account got ${gluedTx!.accountNumber}`);

/**
 * Regrese: Inkaso úvěru (pdfjs split „Inkaso“/„úvěru“) těsně před Telefon -585.
 * Dříve se bloky sloučily → Telefon dostal -4615 a Anuita zmizela / špatný popis.
 */
const FIXTURE_INKASO_THEN_PHONE = `
Česká spořitelna, a.s.
GIBACZPP
Číslo účtu 2916142083/0800
Období: 01.01.2026 - 31.01.2026
ZÁKLADNÍ ÚDAJE ÚČTU
Počáteční zůstatek +10 000.00
Celkem přišlo +0.00
Celkem odešlo -5 200.00
Konečný zůstatek +4 800.00

PŘEHLED POHYBŮ NA ÚČTU
Zaúčtováno
Provedeno
Položka
Částka

20.01.2026
Inkaso
úvěru
6610060833/0800
0000000002
-4 615.00
Valentová Hájková Vladimíra
0498
6610060833
Anuita
20.01.2026
Tuzemská odchozí úhrada
19-2235210247/0800
9852191682
-585.00
Telefon vyúčtování
21.01.2026
Platba kartou
XXXXXXXXXXXX5372
-100.00
částka v Kč: 100.00

Konečný zůstatek +4 800.00
`.trim();

console.log('--- Inkaso then Telefon (adjacent same day) ---');
const txsAdj = parseCsPdfPlainText(FIXTURE_INKASO_THEN_PHONE);
for (const t of txsAdj) console.log(`  ${t.date} ${t.rawAmount} | ${t.description} | acc=${t.accountNumber}`);
const anuita = txsAdj.find((t) => t.description === 'Anuita');
const telefon = txsAdj.find((t) => t.description === 'Telefon vyúčtování');
assert(!!anuita && anuita.rawAmount === -4615, `Anuita -4615 got ${anuita?.rawAmount}`);
assert(!!telefon && telefon.rawAmount === -585, `Telefon -585 got ${telefon?.rawAmount}`);
assert(anuita!.accountNumber === '6610060833', 'Anuita account');
assert(telefon!.accountNumber === '19-2235210247', 'Telefon account');

/** Reálné pdfjs raw texty ze 3 měsíců (scripts/fixtures/cs-raw/). */
console.log('--- real 3-month raw fixtures ---');

const rawDir = join(import.meta.dir, 'fixtures/cs-raw');
const rawFiles = readdirSync(rawDir)
  .filter((n) => n.startsWith('raw-') && n.endsWith('.txt'))
  .sort();
assert(rawFiles.length >= 3, `need >=3 raw fixtures, got ${rawFiles.length}`);

const allReal = rawFiles.flatMap((f) => parseCsPdfPlainText(readFileSync(join(rawDir, f), 'utf8')));
const phones = allReal.filter(
  (t) => t.accountNumber === '19-2235210247' && Math.abs(t.rawAmount) === 585,
);
const anuitas = allReal.filter(
  (t) => (t.description === 'Anuita' || /Inkaso/i.test(t.description)) && Math.abs(t.rawAmount) === 4615,
);
console.log(
  'phones',
  phones.map((t) => `${t.date} ${t.rawAmount} ${t.description}`),
);
console.log(
  'anuitas',
  anuitas.map((t) => `${t.date} ${t.rawAmount} ${t.description}`),
);

assert(phones.length === 3, `expected 3× -585 (account 19-2235210247), got ${phones.length}`);
assert(
  phones.every((t) => t.rawAmount === -585),
  'all phone amounts must be -585',
);
assert(anuitas.length === 3, `expected 3× Anuita -4615, got ${anuitas.length}`);
assert(
  anuitas.every((t) => t.rawAmount === -4615),
  'all anuita amounts must be -4615',
);
// Jan+Feb mají v PDF poznámku; březen ji v raw textu nemá → aspoň 2× exact popis
const phoneNamed = phones.filter((t) => t.description === 'Telefon vyúčtování');
assert(phoneNamed.length >= 2, `expected >=2 Telefon vyúčtování labels, got ${phoneNamed.length}`);
assert(
  phones.some((t) => t.date === '2026-03-20'),
  'March -585 must exist (PDF omits note „Telefon vyúčtování“)',
);

/**
 * Reálný výpis 09/2026 — text MUSÍ být Edge-identický pdfjs dump
 * (scripts/extract-cs-pdfjs-fixture.bun.ts → vypis-2026-09.pdfjs.txt).
 */
console.log('--- real Sep 2026 Edge pdfjs fixture ---');
const sepPdf = join(import.meta.dir, 'fixtures/cs/vypis-2026-09.pdf');
const sepPdfjsTxt = join(import.meta.dir, 'fixtures/cs/vypis-2026-09.pdfjs.txt');
if (!existsSync(sepPdfjsTxt)) {
  assert(existsSync(sepPdf), `missing ${sepPdf} (and no pdfjs.txt)`);
  const regenerated = await extractPdfPlainText(sepPdf);
  const { writeFileSync } = await import('fs');
  writeFileSync(sepPdfjsTxt, regenerated, 'utf8');
  console.log('regenerated', sepPdfjsTxt);
}
const sepText = readFileSync(sepPdfjsTxt, 'utf8');
// Guard: selftest nesmí jet nad „hezkým“ raw textem s jiným skládáním řádků
assert(
  sepText.includes('XXXXXXXXXXXX3927 d.tran.') || sepText.includes('d.tran.'),
  'pdfjs fixture must contain d.tran markers',
);
assert(sepText.includes('SBVPLEV_28|') || sepText.includes('|'), 'pdfjs fixture must contain page-footer | lines');
assert(isCsPdfText(sepText), 'Sep PDF must detect as ČS');
const sepBal = extractCsStatementBalances(sepText);
assert(sepBal.opening === 0, `opening 0 got ${sepBal.opening}`);
assert(sepBal.totalIn === 5930, `totalIn 5930 got ${sepBal.totalIn}`);
assert(sepBal.totalOut === -5920.59, `totalOut -5920.59 got ${sepBal.totalOut}`);
assert(sepBal.closing === 9.41, `closing 9.41 got ${sepBal.closing}`);
assert(sepBal.accountNumber === '6344660093/0800', `account ${sepBal.accountNumber}`);

const sepTxs = parseCsPdfPlainText(sepText);
assert(sepTxs.length === 22, `22 txs got ${sepTxs.length}`);
const sepIn = sepTxs.filter((t) => t.type === 'income');
const sepOut = sepTxs.filter((t) => t.type === 'expense');
assert(sepIn.length === 9, `9 income got ${sepIn.length}`);
assert(sepOut.length === 13, `13 expense got ${sepOut.length}`);
const sumIn = sepIn.reduce((s, t) => s + t.amount, 0);
const sumOut = sepOut.reduce((s, t) => s + t.amount, 0);
assert(Math.abs(sumIn - 5930) < 0.01, `sumIn 5930 got ${sumIn}`);
assert(Math.abs(sumOut - 5920.59) < 0.01, `sumOut 5920.59 got ${sumOut}`);
const sepVerify = verifyCsStatementBalance(sepText, sepTxs);
assert(sepVerify?.ok === true, `balance verify ${JSON.stringify(sepVerify)}`);

// Podezřelé txs za/před patičkou s `|` — musí existovat
assert(
  sepIn.some((t) => Math.abs(t.amount - 50) < 0.01 && t.date === '2026-09-24'),
  'missing +50 on 24.09 (page-break / | footer)',
);
assert(
  sepOut.some((t) => Math.abs(t.amount - 307) < 0.01 && /Slevomat/i.test(t.description)),
  'missing −307 Slevomat (page-break / | footer)',
);

const ownRb = ['767628004/5500'];
const sepRows = csTransactionsToImportRows(
  sepTxs,
  {
    classifyCsob: () => 'Ostatní',
    bucketToStoreCategory: (_b, t) => (t === 'income' ? 'Příjem' : 'Ostatní'),
  },
  ownRb,
);
const transfers = sepRows.filter((r) => r.bucket === 'Převod');
assert(transfers.length === 7, `7 transfers got ${transfers.length}`);
assert(
  Math.abs(transfers.reduce((s, r) => s + r.amount, 0) - 2930) < 0.01,
  'transfers sum 2930',
);
const anna = sepRows.filter((r) => /Medveďová|Medvedova/i.test(r.counterpartyName || r.description));
assert(anna.length === 2, `2× Anna got ${anna.length}`);
assert(
  anna.every((r) => r.bucket !== 'Převod'),
  'Anna must not be transfer',
);

const hajek500 = sepTxs.filter(
  (t) =>
    t.type === 'income' &&
    Math.abs(t.amount - 500) < 0.01 &&
    /Hájek|Hajek/i.test(t.counterpartyName || t.merchant) &&
    t.date === '2026-09-24',
);
assert(hajek500.length === 2, `2× +500 Jan Hájek on 24.09 got ${hajek500.length}`);
const ids = new Set(sepTxs.map((t) => t.bankTransactionId));
assert(ids.size === 22, `22 unique bankTransactionId got ${ids.size}`);

/**
 * Všech 22 řádků: date + booking_date (pořadí jako ve výpisu).
 * Úhrady: date = booking = zaúčtováno.
 * Karty: date = d.tran, booking = d.zúč.
 */
const EXPECTED_ALL_22: Array<{
  amount: number;
  date: string;
  booking: string;
  description: RegExp;
  card?: boolean;
}> = [
  { amount: 800, date: '2026-09-24', booking: '2026-09-24', description: /Hájek|Hajek/i },
  { amount: 2500, date: '2026-09-24', booking: '2026-09-24', description: /Medveďová|Medvedova/i },
  { amount: 500, date: '2026-09-24', booking: '2026-09-24', description: /Hájek|Hajek/i },
  { amount: 500, date: '2026-09-24', booking: '2026-09-24', description: /Hájek|Hajek/i },
  { amount: 500, date: '2026-09-24', booking: '2026-09-24', description: /Medveďová|Medvedova/i },
  { amount: 50, date: '2026-09-24', booking: '2026-09-24', description: /Hájek|Hajek/i },
  { amount: 50, date: '2026-09-25', booking: '2026-09-25', description: /Hájek|Hajek/i },
  { amount: 500, date: '2026-09-25', booking: '2026-09-25', description: /Hájek|Hajek/i },
  { amount: 176.5, date: '2026-09-24', booking: '2026-09-26', description: /^ALBERT\b/i, card: true },
  { amount: 59, date: '2026-09-24', booking: '2026-09-26', description: /^Bistro\s*Bauhaus/i, card: true },
  { amount: 157.5, date: '2026-09-24', booking: '2026-09-26', description: /^ALBERT\b/i, card: true },
  { amount: 2413, date: '2026-09-24', booking: '2026-09-26', description: /^BAUHAUS\b/i, card: true },
  { amount: 519.79, date: '2026-09-24', booking: '2026-09-26', description: /^Penny\b/i, card: true },
  { amount: 355.9, date: '2026-09-24', booking: '2026-09-26', description: /^Tesco\b/i, card: true },
  { amount: 89, date: '2026-09-24', booking: '2026-09-26', description: /^Hornbach\b/i, card: true },
  { amount: 1016, date: '2026-09-24', booking: '2026-09-26', description: /^ANAVA\b/i, card: true },
  { amount: 42.9, date: '2026-09-24', booking: '2026-09-26', description: /^ROSSMANN\b/i, card: true },
  { amount: 307, date: '2026-09-25', booking: '2026-09-27', description: /^Slevomat/i, card: true },
  { amount: 24, date: '2026-09-25', booking: '2026-09-27', description: /STEFLOVA/i, card: true },
  { amount: 129, date: '2026-09-26', booking: '2026-09-28', description: /^EsportArena/i, card: true },
  { amount: 530, date: '2026-09-28', booking: '2026-09-28', description: /Hájek|Hajek/i },
  { amount: 631, date: '2026-09-28', booking: '2026-09-30', description: /^Alza/i, card: true },
];

assert(EXPECTED_ALL_22.length === 22, 'expected table must have 22 rows');
assert(sepTxs.length === EXPECTED_ALL_22.length, `22 txs got ${sepTxs.length}`);

for (let idx = 0; idx < EXPECTED_ALL_22.length; idx++) {
  const exp = EXPECTED_ALL_22[idx]!;
  const t = sepTxs[idx]!;
  assert(
    Math.abs(t.amount - exp.amount) < 0.01 || Math.abs(t.rawAmount - exp.amount) < 0.01 ||
      Math.abs(Math.abs(t.rawAmount) - exp.amount) < 0.01,
    `#${idx} amount ${exp.amount} got raw=${t.rawAmount}`,
  );
  assert(exp.description.test(t.description), `#${idx} desc ${exp.amount} got ${JSON.stringify(t.description)}`);
  assert(t.date === exp.date, `#${idx} ${exp.amount} date ${exp.date} got ${t.date}`);
  assert(
    t.bookingDate === exp.booking,
    `#${idx} ${exp.amount} booking ${exp.booking} got ${t.bookingDate}`,
  );
  if (exp.card) {
    assert(!/^Platba kartou/i.test(t.description), `#${idx} card desc must be merchant only`);
    assert(!/^(CZ\s+)?(PLZEN|Plzen|Praha|Prague|SEDLEC)\s*$/i.test(t.description.trim()), `#${idx} desc must not be city`);
  }
}

console.log('=== ALL CS SELF-TEST PASSED ===');
