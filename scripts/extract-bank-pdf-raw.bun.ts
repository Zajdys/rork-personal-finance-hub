/**
 * One-shot: extract pdfjs text from Downloads PDFs into scripts/fixtures/bank-pdf-raw/
 * Run: bun scripts/extract-bank-pdf-raw.bun.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

async function extract(path: string): Promise<string> {
  const buf = readFileSync(path);
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

const DOWNLOADS = `${process.env.HOME}/Downloads`;
const OUT = join(import.meta.dir, 'fixtures/bank-pdf-raw');
mkdirSync(OUT, { recursive: true });

const files = [
  'Vypis_0767628004_CZK_2026_003.pdf',
  'Vypis_0767628004_CZK_2026_001.pdf',
  'Vypis_110125955_20260501_20260531.pdf',
  'Vypis_z_uctu-2102032408_20250201-20250228_cislo-2.pdf.pdf',
  '363468155_20260531_5_MCZB.pdf.pdf',
  '363468155_20260331_3_MCZB.pdf.pdf',
  '363468155_20260131_1_MCZB.pdf.pdf',
];

for (const name of files) {
  const path = join(DOWNLOADS, name);
  if (!existsSync(path)) {
    console.log('skip missing', name);
    continue;
  }
  const text = await extract(path);
  const outName = name.replace(/\.pdf(\.pdf)?$/i, '') + '.txt';
  writeFileSync(join(OUT, outName), text);
  const head = text.replace(/\s+/g, ' ').slice(0, 220);
  console.log('OK', outName, 'chars=', text.length, '|', head);
}
