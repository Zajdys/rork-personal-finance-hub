/**
 * Self-test: owner account matching / IBAN normalization.
 * Run: bun scripts/owner-account-match-selftest.bun.ts
 */
import {
  blockContainsAnyOwnerAccount,
  compactAccountKey,
  czechIbanToDomesticForms,
  expandOwnerAccountNeedles,
} from '../lib/owner-account-match.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

assert(compactAccountKey('767628012 / 5500') === '767628012/5500', 'spaces');
assert(
  compactAccountKey('CZ67 5500 0000 0007 6762 8012') === 'cz6755000000000767628012',
  'iban compact',
);

const forms = czechIbanToDomesticForms('cz6755000000000767628012');
assert(forms.some((f) => f === '767628012/5500'), `iban→domestic got ${JSON.stringify(forms)}`);

assert(
  blockContainsAnyOwnerAccount('Odchozí úhrada na 767628012/5500 Jan Hájek', [
    'CZ67 5500 0000 0007 6762 8012',
  ]),
  'IBAN owner matches domestic in text',
);
assert(
  blockContainsAnyOwnerAccount('Převod 767628012 / 5500', ['767628012/5500']),
  'spaced domestic',
);
assert(
  blockContainsAnyOwnerAccount('Odchozí okamžitá úhrada\n767628012/5500', [
    '767628012 / 5500',
  ]),
  'user entered with spaces',
);
assert(
  !blockContainsAnyOwnerAccount('Platba kartou Albert', ['767628012/5500']),
  'no false positive',
);

const needles = expandOwnerAccountNeedles('767628012/5500');
assert(needles.includes('767628012/5500'), 'needle domestic');
assert(needles.includes('767628012'), 'needle number only');

// Simulace CSV klasifikace (stejná podmínka jako parseBankStatementCsv)
function csvBucket(desc: string, owners: string[]): string {
  return blockContainsAnyOwnerAccount(desc, owners) ? 'Převod' : 'Ostatní';
}
assert(
  csvBucket('767628012/5500 Jan Hájek převod', ['767628012/5500']) === 'Převod',
  'csv-like transfer',
);
assert(csvBucket('Albert Praha', ['767628012/5500']) === 'Ostatní', 'csv-like expense');

console.log('OK owner-account-match-selftest');
