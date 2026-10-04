/**
 * Self-test: odvození banky z kódu v čísle účtu.
 * bun scripts/cz-bank-codes-selftest.bun.ts
 */
import {
  extractCzBankCode,
  bankNameFromAccountNumber,
  resolveOwnerBankName,
  isGenericBankName,
} from '../lib/cz-bank-codes';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(extractCzBankCode('767628004/5500') === '5500', 'RB code');
assert(extractCzBankCode('110125955/0100') === '0100', 'KB code');
assert(extractCzBankCode('363468155/0300') === '0300', 'CSOB code');
assert(extractCzBankCode('2503536930/2010') === '2010', 'Fio code');
assert(extractCzBankCode('3672144019/3030') === '3030', 'Air Bank code');
assert(extractCzBankCode('670100-2231759259/6210') === '6210', 'mBank code');
assert(extractCzBankCode('283199805/0600') === '0600', 'Moneta code');
assert(extractCzBankCode('4059123003/0800') === '0800', 'CS code');

assert(bankNameFromAccountNumber('767628004/5500') === 'Raiffeisenbank', 'RB name');
assert(bankNameFromAccountNumber('110125955/0100') === 'Komerční banka', 'KB name');
assert(bankNameFromAccountNumber('363468155/0300') === 'ČSOB', 'CSOB name');

assert(isGenericBankName('Moje účty'), 'generic Moje účty');
assert(isGenericBankName(''), 'generic empty');
assert(!isGenericBankName('Raiffeisenbank'), 'not generic RB');

assert(bankNameFromAccountNumber('111222333/9999') === 'Jiná banka', 'unknown code');
assert(
  resolveOwnerBankName('767628004/5500', 'Moje účty') === 'Raiffeisenbank',
  'derive when generic',
);
assert(
  resolveOwnerBankName('767628004/5500', 'Komerční banka') === 'Komerční banka',
  'keep user bank',
);
assert(
  resolveOwnerBankName('767628004/5500', null) === 'Raiffeisenbank',
  'derive when null',
);

// CZ IBAN → kód banky (pozice 5–8)
assert(extractCzBankCode('CZ6508000000192000145399') === '0800', 'IBAN CS code');
assert(bankNameFromAccountNumber('CZ6508000000192000145399') === 'Česká spořitelna', 'IBAN CS name');

console.log('cz-bank-codes-selftest: OK');
