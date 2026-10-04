/**
 * Self-test: Revolut Transfer/Topup/Exchange klasifikace (Převod vs Investice vs ostatní).
 * Run: bun scripts/revolut-transfer-classify-selftest.bun.ts
 */
// @ts-nocheck — bun selftest (`.ts` importy + top-level await); tsc neřeší
import './selftest-mocks.ts';

const { parseRevolutCsv, REVOLUT_HEADER } = await import('../lib/revolut-csv-parse.ts');
const {
  matchImportTransferRules,
  extractTransferPartyName,
  isCurrencyExchangeDescription,
  isCardTopupDescription,
} = await import('../lib/import-transfer-rules.ts');
const { namesMatchOwner, namesMatchAnyOwner } = await import('../lib/suggest-own-accounts.ts');
const { buildOwnerNames } = await import('../lib/owner-names.ts');
const { lookupMerchantDictionary } = await import('../lib/merchant-dictionary.ts');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const OWNER = 'Jan Hájek';

/** Mini CSV: Type=Transfer (kromě Exchange/Topup kde to dává smysl). */
function miniCsv(
  rows: { type: string; desc: string; amount: string }[],
): string {
  const lines = [REVOLUT_HEADER];
  let i = 0;
  for (const r of rows) {
    i += 1;
    const bal = '100.00';
    lines.push(
      `${r.type},Current,2025-01-0${(i % 9) + 1} 10:00:00,2025-01-0${(i % 9) + 1} 10:00:01,${r.desc},${r.amount},0.00,CZK,COMPLETED,${bal}`,
    );
  }
  return lines.join('\n');
}

console.log('=== Revolut transfer classify self-test ===');

assert(lookupMerchantDictionary('XTB') === 'Investice', 'XTB ve slovníku');
assert(extractTransferPartyName('To XTB') === 'XTB', 'extract To XTB');
assert(extractTransferPartyName('Payment from Acme s.r.o.') === 'Acme s.r.o.', 'extract Payment from');
assert(isCurrencyExchangeDescription('Exchanged to EUR'), 'Exchanged to');
assert(isCardTopupDescription('Apple Pay top-up by *1234'), 'Apple Pay top-up');
assert(isCardTopupDescription('Top-up by *9999'), 'Top-up by');

// namesMatchOwner — case / pořadí / diakritika
assert(namesMatchOwner('JAN HAJEK', OWNER), 'namesMatchOwner JAN HAJEK');
assert(namesMatchOwner('Hájek Jan', OWNER), 'namesMatchOwner Hájek Jan');
assert(namesMatchOwner('jan hájek', OWNER), 'namesMatchOwner jan hájek');
assert(!namesMatchOwner('JAN HAJEK', ''), 'empty ownerName → no match');
assert(matchImportTransferRules('To Jan Hájek', null) === null, 'null owner → not prevod');
assert(matchImportTransferRules('To Jan Hájek', '') === null, 'empty owner → not prevod');

// RB-style karta s držitelem v popisu NESMÍ spadnout do Převod přes jméno
assert(
  matchImportTransferRules('ALBERT VAM DEKUJE; PLZEN; CZE JAN HAJEK', OWNER) === null,
  'RB Albert+holder description not transfer rule',
);
assert(
  matchImportTransferRules('Platba kartou JAN HÁJEK ALBERT VAM DEKUJE', OWNER) === null,
  'RB Platba kartou+holder not transfer rule',
);

assert(matchImportTransferRules('Exchanged to EUR', OWNER)?.kind === 'prevod', 'rule Exchanged');
assert(
  matchImportTransferRules('Apple Pay top-up by *1234', OWNER)?.kind === 'prevod',
  'rule Apple top-up',
);
assert(matchImportTransferRules('To Jan Hájek', OWNER)?.kind === 'prevod', 'rule own name');
assert(matchImportTransferRules('To Hájek Jan', OWNER)?.kind === 'prevod', 'rule own name reorder');
assert(matchImportTransferRules('Transfer to Petra Nováková', OWNER) === null, 'rule foreign null');

// Pole jmen: auth display + profil — shoda s kterýmkoli
assert(
  namesMatchAnyOwner('Jan Hájek', ['Jan Bro', 'Jan Hájek']),
  'namesMatchAnyOwner multi',
);
assert(
  matchImportTransferRules('To Jan Hájek', ['Jan Bro', 'Jan Hájek'])?.kind === 'prevod',
  'ownerNames [Bro, Hájek] → To Jan Hájek Převod',
);
assert(
  matchImportTransferRules('To Jan Hájek', ['Jan Bro']) === null,
  'ownerNames [Jan Bro] alone → not Převod',
);
assert(
  buildOwnerNames({
    profileFirstName: 'Jan',
    profileLastName: 'Hájek',
    authDisplayName: 'Jan Bro',
  }).includes('Jan Hájek') &&
    !buildOwnerNames({
      profileFirstName: 'Jan',
      profileLastName: 'Hájek',
      authDisplayName: 'Jan Bro',
    }).includes('Jan Bro'),
  'buildOwnerNames: profile wins, auth not added when profile present',
);
assert(
  buildOwnerNames({
    profileFirstName: '',
    profileLastName: '',
    authDisplayName: 'Jan Bro',
  })[0] === 'Jan Bro',
  'buildOwnerNames: auth only when profile empty',
);
assert(
  matchImportTransferRules('To XTB', OWNER)?.kind === 'investice',
  'rule To XTB investice',
);
assert(
  matchImportTransferRules('From Flexible Cash Funds', OWNER)?.kind === 'investice',
  'rule Flexible Cash Funds',
);

const csv = miniCsv([
  { type: 'Exchange', desc: 'Exchanged to EUR', amount: '-100.00' },
  { type: 'Topup', desc: 'Apple Pay top-up by *1234', amount: '500.00' },
  { type: 'Transfer', desc: `To ${OWNER}`, amount: '-50.00' },
  { type: 'Transfer', desc: 'Transfer to Petra Nováková', amount: '-80.00' },
  { type: 'Topup', desc: 'Payment from Acme s.r.o.', amount: '1200.00' },
  { type: 'Transfer', desc: 'To XTB', amount: '-200.00' },
  { type: 'Transfer', desc: 'From Flexible Cash Funds', amount: '30.00' },
]);

const parsed = parseRevolutCsv(csv, [], [OWNER]);
assert(!('error' in parsed), `parse: ${'error' in parsed ? parsed.error : ''}`);
if ('error' in parsed) throw new Error(parsed.error);

// ownerNames pole: Bro + Hájek → Převod; jen Bro → ne
{
  const multi = parseRevolutCsv(
    miniCsv([{ type: 'Transfer', desc: 'To Jan Hájek', amount: '-10.00' }]),
    [],
    ['Jan Bro', 'Jan Hájek'],
  );
  assert(!('error' in multi) && multi.rows[0]!.category === 'Převod', 'multi ownerNames → Převod');
  const broOnly = parseRevolutCsv(
    miniCsv([{ type: 'Transfer', desc: 'To Jan Hájek', amount: '-10.00' }]),
    [],
    ['Jan Bro'],
  );
  assert(
    !('error' in broOnly) && broOnly.rows[0]!.category !== 'Převod',
    'ownerNames [Jan Bro] → not Převod',
  );
}

const byDesc = Object.fromEntries(parsed.rows.map((r) => [r.description, r]));

const expect: { desc: string; category: string; source?: string }[] = [
  { desc: 'Exchanged to EUR', category: 'Převod', source: 'transfer' },
  { desc: 'Apple Pay top-up by *1234', category: 'Převod', source: 'transfer' },
  { desc: `To ${OWNER}`, category: 'Převod', source: 'transfer' },
  { desc: 'Transfer to Petra Nováková', category: 'Ostatní' }, // NE Převod
  { desc: 'Payment from Acme s.r.o.', category: 'Ostatní' }, // NE Převod
  { desc: 'To XTB', category: 'Investice' },
  { desc: 'From Flexible Cash Funds', category: 'Investice' },
];

for (const e of expect) {
  const row = byDesc[e.desc];
  assert(!!row, `missing row ${e.desc}`);
  assert(
    row!.category === e.category,
    `${e.desc}: category=${row!.category} want ${e.category}`,
  );
  assert(row!.category !== 'Převod' || row!.categorySource === 'transfer', `${e.desc} source`);
  if (e.source) {
    assert(row!.categorySource === e.source, `${e.desc} source=${row!.categorySource}`);
  }
  if (e.category !== 'Převod') {
    assert(row!.categorySource !== 'transfer', `${e.desc} must not be transfer source`);
  }
  console.log(`OK ${e.desc} → ${row!.category}`);
}

// Bez ownerName: „To Jan Hájek“ NESMÍ být Převod (žádný hardcoded owner)
const noOwner = parseRevolutCsv(
  miniCsv([{ type: 'Transfer', desc: 'To Jan Hájek', amount: '-10.00' }]),
  [],
  null,
);
assert(!('error' in noOwner), 'noOwner parse');
if (!('error' in noOwner)) {
  assert(
    noOwner.rows[0]!.category !== 'Převod',
    'without ownerName, To Jan Hájek is not Převod',
  );
}

console.log('=== ALL transfer classify tests passed ===');
