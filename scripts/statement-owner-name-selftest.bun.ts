/**
 * Self-test: extract statement owner name from PDF plain-text fixtures.
 * Run: bun scripts/statement-owner-name-selftest.bun.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractStatementOwnerName,
  extractOwnerFromNazevUctu,
  extractOwnerFromMajitelUctu,
  extractOwnerFromKbHeader,
  extractOwnerFromAirBankHeader,
} from '../lib/statement-owner-name.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const root = join(import.meta.dir, 'fixtures');

function load(...parts: string[]): string {
  return readFileSync(join(root, ...parts), 'utf8');
}

console.log('=== statement-owner-name self-test ===');

const csob = load('bank-pdf-raw', '363468155_20260131_1_MCZB.txt');
assert(extractOwnerFromNazevUctu(csob) === 'Jan Hájek', 'ČSOB Název účtu');
assert(extractStatementOwnerName(csob, 'csob') === 'Jan Hájek', 'ČSOB bankType');

const rb = load('bank-pdf-raw', 'Vypis_0767628004_CZK_2026_001.txt');
assert(extractOwnerFromNazevUctu(rb) === 'Jan Hájek', 'RB Název účtu');
assert(extractStatementOwnerName(rb, 'raiffeisenbank') === 'Jan Hájek', 'RB bankType');

const kb = load('bank-pdf-raw', 'Vypis_110125955_20260501_20260531.txt');
const kbName = extractOwnerFromKbHeader(kb);
assert(kbName === 'JAN HÁJEK', `KB header got ${kbName}`);
assert(extractStatementOwnerName(kb, 'kb') === 'JAN HÁJEK', 'KB bankType');

const fio = load('bank-pdf-raw', 'Vypis_z_uctu-2102032408_20250201-20250228_cislo-2.txt');
const fioName = extractOwnerFromMajitelUctu(fio);
assert(fioName === 'Anna Medveďová', `Fio Majitel got ${fioName}`);
assert(extractStatementOwnerName(fio, 'fio') === 'Anna Medveďová', 'Fio bankType');

const cs = load('cs-raw', 'raw-20260721195730.txt');
const csName = extractOwnerFromMajitelUctu(cs);
assert(csName === 'Valentová Hájková Vladimíra', `ČS Majitel got ${csName}`);
assert(extractStatementOwnerName(cs, 'cs') === 'Valentová Hájková Vladimíra', 'ČS bankType');

const airbank = load('bank-pdf-raw', 'airbank-PDF-document-3.txt');
assert(extractOwnerFromAirBankHeader(airbank) === 'Jan Hájek', 'Air Bank address block');
assert(extractStatementOwnerName(airbank, 'airbank') === 'Jan Hájek', 'Air Bank bankType');

const airbankSynthetic = `
Air Bank a.s.
AIRACZPP
Výpis z účtu
Číslo účtu: 3672144019 / 3030
`.trim();
assert(extractOwnerFromAirBankHeader(airbankSynthetic) === undefined, 'Air Bank: no name in synthetic');

console.log('OK statement-owner-name-selftest');
console.log('Banks WITH header name: ČSOB, Raiffeisenbank, KB, Fio, Česká spořitelna, Air Bank');
