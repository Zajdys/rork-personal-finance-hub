/**
 * Debug: vypíše syrový pdfjs text kolem transakcí datovaných 20. v měsíci.
 *
 * 1) Preferuje už uložené fixtures: scripts/fixtures/cs-raw/raw-*.txt
 * 2) Jinak extrahuje z ~/Downloads/Výpis_20260721_*.pdf (stejně jako edge: item.str + "\\n")
 *
 * Run: bun scripts/cs-debug-day20-raw.bun.ts
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

const OUT_DIR = join(import.meta.dir, 'fixtures/cs-raw');
const DOWNLOADS = `${process.env.HOME}/Downloads`;

function normalizeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function printDay20(label: string, lines: string[]) {
  console.log(`\n######## ${label} ########`);
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^20\.\d{2}\.\d{4}$/.test(lines[i]!) && /Inkaso/i.test(lines[i + 1] ?? '')) {
      starts.push(i);
    }
  }
  if (!starts.length) {
    for (let i = 0; i < lines.length; i++) {
      if (/^20\.\d{2}\.\d{4}$/.test(lines[i]!)) starts.push(i);
    }
  }
  for (const i of starts.slice(0, 8)) {
    const end = Math.min(lines.length, i + 16);
    console.log(`\n--- raw lines [${i}..${end}) ---`);
    for (let j = i; j < end; j++) console.log(`${String(j).padStart(4)}| ${lines[j]}`);
  }
}

mkdirSync(OUT_DIR, { recursive: true });

const fixtures = readdirSync(OUT_DIR)
  .filter((n) => n.startsWith('raw-') && n.endsWith('.txt'))
  .sort();

if (fixtures.length >= 3) {
  for (const f of fixtures) {
    printDay20(f, normalizeLines(readFileSync(join(OUT_DIR, f), 'utf8')));
  }
  console.log('\n(using existing fixtures in scripts/fixtures/cs-raw/)');
  process.exit(0);
}

// Re-extract via pdfjs (same join as parse-bank-pdf-v2)
const pdfjsPath = '/tmp/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
if (!existsSync(pdfjsPath)) {
  console.error('No fixtures and no pdfjs at', pdfjsPath);
  process.exit(1);
}
const pdfjs = await import(pdfjsPath);
const pdfs = readdirSync(DOWNLOADS)
  .filter((n) => n.includes('20260721') && n.endsWith('.pdf'))
  .sort()
  .map((n) => join(DOWNLOADS, n));

for (const path of pdfs) {
  const buf = readFileSync(path);
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
    fullText +=
      content.items.map((item: { str?: string }) => ('str' in item ? item.str ?? '' : '')).join('\n') +
      '\n';
  }
  const out = join(OUT_DIR, `raw-${basename(path).replace(/[^0-9]/g, '')}.txt`);
  writeFileSync(out, fullText);
  printDay20(basename(path), normalizeLines(fullText));
}
