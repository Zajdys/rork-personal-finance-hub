import { parseCsPdfPlainText } from '../supabase/functions/parse-bank-pdf-v2/cs-pdf-parse.ts';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = join(import.meta.dir, 'fixtures/cs-raw');
for (const f of readdirSync(dir).sort()) {
  const text = readFileSync(join(dir, f), 'utf8');
  const txs = parseCsPdfPlainText(text);
  const day20 = txs.filter((t) => t.date.endsWith('-20'));
  console.log('\n==', f, 'total', txs.length, 'day20', day20.length);
  for (const t of day20) {
    console.log(`  ${t.date} ${t.rawAmount} | ${t.description} | acc=${t.accountNumber}`);
  }
  const tel = txs.filter(
    (t) =>
      /Telefon/i.test(t.description) ||
      t.accountNumber.includes('2235210247') ||
      Math.abs(t.rawAmount) === 585,
  );
  const anu = txs.filter(
    (t) => /Anuita|Inkaso/i.test(t.description) || Math.abs(t.rawAmount) === 4615,
  );
  console.log(
    'tel-ish',
    tel.map((t) => `${t.date} ${t.rawAmount} ${t.description}`),
  );
  console.log(
    'anu-ish',
    anu.map((t) => `${t.date} ${t.rawAmount} ${t.description}`),
  );
}
