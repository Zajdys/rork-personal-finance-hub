/**
 * Run: bun scripts/classify-import-selftest.bun.ts
 */
import {
  normalizeMerchantKey,
  extractMerchantCityHint,
  merchantNameLetterCount,
} from '../lib/normalize-merchant-key.ts';
import { lookupMerchantDictionary } from '../lib/merchant-dictionary.ts';
import { lookupMerchantKeywords } from '../lib/merchant-keywords.ts';
import {
  classifyImportRow,
  classifyUnknown,
  buildCounterpartyNameByAccount,
  buildSubscriptionMerchantKeys,
  withBackfilledCounterpartyName,
} from '../lib/classify-import-category.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

assert(normalizeMerchantKey('ALBERT VAM DEKUJE; PLZEN; CZE') === 'ALBERT', 'albert');
assert(normalizeMerchantKey('APPLE.COM/BILL') === 'APPLE.COM', 'apple bill');
assert(normalizeMerchantKey('APPLE.COM') === 'APPLE.COM', 'apple com');
assert(normalizeMerchantKey('Hobby Riha') === 'HOBBY RIHA', 'hobby riha');
assert(normalizeMerchantKey('HOBBY RIHA') === 'HOBBY RIHA', 'HOBBY RIHA');
assert(normalizeMerchantKey('BAUHAUS k.s. 889') === 'BAUHAUS', 'bauhaus');
assert(
  normalizeMerchantKey(
    'nakup: potraviny lanhung, stahlavy, cz, dne 25.6.2026, castka 161.50 czk',
  ) === 'POTRAVINY LANHUNG',
  'lanhung',
);
assert(
  normalizeMerchantKey('RADKA STEFLOVA ul.Tymakovska 42,') === 'RADKA STEFLOVA',
  'airbank radka',
);
assert(normalizeMerchantKey('Slevomat.cz Pernerova 42, Praha, 18600') === 'SLEVOMAT', 'slevomat');
assert(normalizeMerchantKey('KFC Olympia Plzen DT Pisecka 1011/4,') === 'KFC', 'kfc');
assert(normalizeMerchantKey('COOP Plzen 168 Sedlec 197, Stary') === 'COOP', 'coop');
assert(normalizeMerchantKey('AUTOBUSY POD HAJEM 97, KRALUV') === 'AUTOBUSY', 'autobusy');
assert(normalizeMerchantKey('POTRAVINY LANHUNG NAVES') === 'POTRAVINY LANHUNG', 'lanhung naves');
assert(normalizeMerchantKey('BOLT O 2510021428') === 'BOLT', 'bolt spaced id');
assert(normalizeMerchantKey('BOLT O 2601172016') === 'BOLT', 'bolt spaced id2');
assert(normalizeMerchantKey('BOLT.EUO2509121122') === 'BOLT', 'bolt glued eu');
assert(normalizeMerchantKey('BOLT.EUO2509151513') === 'BOLT', 'bolt glued eu2');
assert(normalizeMerchantKey('BOLT FOOD') === 'BOLT', 'bolt food');
assert(normalizeMerchantKey('BOLT.EU') === 'BOLT', 'bolt eu');
assert(normalizeMerchantKey('UBER TRIP 123456789') === 'UBER', 'uber');
assert(normalizeMerchantKey('WOLT1234567') === 'WOLT', 'wolt glued');
assert(normalizeMerchantKey('PAYPAL *1234567890') === 'PAYPAL', 'paypal');
assert(normalizeMerchantKey('GOPAY 987654321') === 'GOPAY', 'gopay');
assert(normalizeMerchantKey('NYX260101123456') === 'NYX', 'nyx');
assert(normalizeMerchantKey('PMDP 123456') === 'PMDP', 'pmdp');
assert(normalizeMerchantKey('KLEPIERRE PLAZA 1234567') === 'KLEPIERRE', 'klepierre');


assert(lookupMerchantDictionary('APPLE.COM') === 'Elektronika', 'apple dict → Elektronika');
assert(lookupMerchantDictionary('APPLE') === 'Elektronika', 'apple dict2');
assert(lookupMerchantDictionary('NETFLIX') === 'Předplatné', 'netflix stays sub');
assert(lookupMerchantDictionary('SPOTIFY') === 'Předplatné', 'spotify stays sub');

// Short name: CS MILOVICE is NOT short
assert(merchantNameLetterCount('CS MILOVICE') >= 3, 'cs milovice letters');
assert(merchantNameLetterCount('s; Plzen') < 3, 'short s');

const short = classifyImportRow({
  type: 'expense',
  category: 'Ostatní',
  description: 's',
  merchantRaw: 's; Plzen; CZE',
});
assert(/Neznámý obchodník/i.test(short.description), `short desc ${short.description}`);

const csFuel = classifyImportRow({
  type: 'expense',
  category: 'Ostatní',
  description: 'CS MILOVICE',
  merchantRaw: 'CS MILOVICE',
});
assert(csFuel.category === 'Doprava', `cs fuel ${csFuel.category} src=${csFuel.source}`);

assert(lookupMerchantKeywords('RAJ KURAKU') === 'Jídlo a nápoje', 'kurak');
assert(lookupMerchantKeywords('ESPORTARENA PLZEN') === 'Zábava a kultura', 'arena infix');
assert(lookupMerchantKeywords('DOLNIMORAVA PARK') === 'Zábava a kultura', 'dolnimorava');
assert(lookupMerchantKeywords('DETSKY PARK') === 'Zábava a kultura', 'detsky park');
assert(lookupMerchantKeywords('CERPACI STANICE ORLEN') === 'Doprava', 'cerpaci');

assert(classifyUnknown('X') === null, 'stub');

// Name backfill → Platby lidem
const names = buildCounterpartyNameByAccount([
  { counterpartyAccount: '283199805/0600', counterpartyName: 'HÁJEK JAN' },
  { counterpartyAccount: '283199805/0600', counterpartyName: null },
]);
assert(names.get('283199805/0600') === 'HÁJEK JAN', 'name map');
const filled = withBackfilledCounterpartyName(
  {
    type: 'expense',
    category: 'Ostatní',
    description: '283199805/0600',
    counterpartyAccount: '283199805/0600',
    counterpartyName: null,
  },
  names,
);
assert(filled.counterpartyName === 'HÁJEK JAN', 'backfill name');
const people = classifyImportRow(filled);
assert(people.category === 'Platby lidem', `people ${people.category}`);

// Apple jednorázově → Elektronika (ne Předplatné přes merchant key)
const appleOnce = classifyImportRow({
  type: 'expense',
  category: 'Ostatní',
  amount: 2799,
  description: 'APPLE.COM/BILL',
  merchantRaw: 'APPLE.COM/BILL',
});
assert(appleOnce.category === 'Elektronika', `apple once ${appleOnce.category}`);
assert(appleOnce.source === 'dictionary', appleOnce.source);

// buildSubscriptionMerchantKeys deprecated — empty
const subKeys = buildSubscriptionMerchantKeys([
  { type: 'expense', amount: 389, description: 'YouTube Premium', title: 'YouTube Premium' },
  { type: 'expense', amount: 389, description: 'YouTube Premium', title: 'YouTube Premium' },
]);
assert(subKeys.size === 0, 'no merchant-wide subscription keys');

console.log('OK classify-import-selftest');
