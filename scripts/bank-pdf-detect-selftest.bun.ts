/**
 * Self-test: celý tok detekce banky z PDF (klient bytes/filename → auto → Edge text).
 * Run: bun scripts/bank-pdf-detect-selftest.bun.ts
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  detectBankType,
  detectBankTypeFromExtractedText,
  detectBankTypeFromFileName,
  detectBankTypeFromPdfBytes,
  extractAccountHintFromPdfFileName,
  isCsPdfSniff,
} from '../lib/bank-pdf-detect.ts';
import { isCsPdfText } from '../supabase/functions/parse-bank-pdf-v2/cs-pdf-parse.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

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

/** Stejná větev jako Edge: detectedFromText ?? (bankType === 'auto' ? null : bankType) */
function effectiveBankType(
  clientBankType: string,
  text: string,
): string | null {
  const detectedFromText = detectBankTypeFromExtractedText(text);
  const hint = clientBankType === 'auto' ? null : clientBankType;
  return detectedFromText ?? hint;
}

console.log('=== bank-pdf-detect self-test ===');

// --- filename patterns ---
assert(
  detectBankTypeFromFileName('Account_statement_0-6344660093_from_20260930.pdf') === 'cs',
  'George EN → cs',
);
assert(
  detectBankTypeFromFileName('Vypis_z_uctu_0-6344660093_from_20260930.pdf') === 'cs',
  'George CS → cs',
);
assert(
  extractAccountHintFromPdfFileName('Account_statement_0-6344660093_from_20260930.pdf') ===
    '6344660093',
  'George account hint',
);
// Fio historický název (pomlčka po uctu) — nesmí spadnout na CS jen kvůli Vypis_z_uctu
assert(
  detectBankTypeFromFileName('Vypis_z_uctu-2102032408_20250201-20250228_cislo-2.pdf') !== 'cs',
  'Fio Vypis_z_uctu-… není cs',
);

const fixture = join(import.meta.dir, 'fixtures/cs/vypis-2026-09.pdf');
assert(existsSync(fixture), `missing fixture ${fixture}`);

const base64 = readFileSync(fixture).toString('base64');

// FlateDecode: surové bajty ČS neobsahují GIBACZ / spořitelna
assert(detectBankTypeFromPdfBytes(base64) === null, 'CS fixture bytes → null (FlateDecode)');

// Bez názvu → auto (ne throw)
assert(detectBankType(base64, undefined) === 'auto', 'CS fixture no name → auto');
assert(detectBankType(base64, 'statement.pdf') === 'auto', 'CS fixture generic name → auto');

// George název → cs už na klientovi
assert(
  detectBankType(base64, 'Account_statement_0-6344660093_from_20260930.pdf') === 'cs',
  'CS fixture + George name → cs',
);

// Edge větev: pdfjs text → cs (i při client auto)
const text = await extractPdfPlainText(fixture);
assert(isCsPdfText(text), 'isCsPdfText(pdfjs) → true');
assert(isCsPdfSniff(text), 'isCsPdfSniff(pdfjs) → true');
assert(detectBankTypeFromExtractedText(text) === 'cs', 'Edge text detect → cs');

const clientAuto = detectBankType(base64, 'vypis-2026-09.pdf');
assert(clientAuto === 'auto', 'client on fixture filename → auto');
const effective = effectiveBankType(clientAuto, text);
assert(effective === 'cs', `full flow auto→Edge must be cs, got ${effective}`);

console.log('OK bank-pdf-detect self-test');
