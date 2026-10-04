/**
 * Extrahuje text z cs/vypis-2026-09.pdf přesně jako Edge parse-bank-pdf-v2
 * (pdfjs-dist@4.0.379, items.join("\\n") + page separator).
 * Run: bun scripts/extract-cs-pdfjs-fixture.bun.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

async function extractEdgeStyle(pdfPath: string): Promise<string> {
  const buf = readFileSync(pdfPath);
  const pdf = await pdfjs
    .getDocument({
      data: new Uint8Array(buf),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    })
    .promise;
  let fullText = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: { str?: string }) => ('str' in item ? item.str ?? '' : ''))
      .join('\n');
    fullText += pageText + '\n';
  }
  return fullText;
}

const dir = join(import.meta.dir, 'fixtures/cs');
const pdfPath = join(dir, 'vypis-2026-09.pdf');
const outPath = join(dir, 'vypis-2026-09.pdfjs.txt');
const text = await extractEdgeStyle(pdfPath);
writeFileSync(outPath, text, 'utf8');
console.log('wrote', outPath, 'len', text.length, 'lines', text.split('\n').length);
