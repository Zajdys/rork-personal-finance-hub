// @ts-nocheck
import { valueAndWeightsByCurrency } from "../services/portfolio/allocation";
import { mapRow } from "../services/portfolio/importCsv";
import { toNum } from '@/src/lib/num';

// Test různých formátů čísel
const testCases = [
  // Základní formáty
  { input: '123.45', expected: 123.45 },
  { input: '123,45', expected: 123.45 },
  { input: '1,234.56', expected: 1234.56 },
  { input: '1.234,56', expected: 1234.56 },
  
  // S měnami
  { input: '€123.45', expected: 123.45 },
  { input: '$1,234.56', expected: 1234.56 },
  { input: '1.234,56 Kč', expected: 1234.56 },
  
  // S mezerami
  { input: ' 123.45 ', expected: 123.45 },
  { input: '1 234.56', expected: 1234.56 },
  { input: '1\u00A0234,56', expected: 1234.56 }, // non-breaking space
  
  // Záporná čísla
  { input: '-123.45', expected: -123.45 },
  { input: '(123.45)', expected: -123.45 },
  
  // Velká čísla
  { input: '1,234,567.89', expected: 1234567.89 },
  { input: '1.234.567,89', expected: 1234567.89 },
  
  // Neplatné hodnoty
  { input: '', expected: null },
  { input: 'abc', expected: null },
  { input: null, expected: null },
  { input: undefined, expected: null },
];

export function runNumberParsingTests() {
  console.log('🧪 Spouštím testy parsování čísel...');
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    const result = toNum(testCase.input);
    const success = result === testCase.expected;
    
    if (success) {
      passed++;
      console.log(`✅ '${testCase.input}' -> ${result}`);
    } else {
      failed++;
      console.log(`❌ '${testCase.input}' -> ${result} (očekáváno: ${testCase.expected})`);
    }
  }
  
  console.log(`\n📊 Výsledky: ${passed} úspěšných, ${failed} neúspěšných`);
  return { passed, failed };
}

async function parseCsvFile(filePath: string) {
  try {
    console.log("[miniSelfTest] parseCsvFile path=", filePath);
    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();

    const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];
    const headerLine = lines[0];
    const headers = headerLine.split(",").map((h) => h.trim());

    const dataRows = lines.slice(1);
    const rawRows = dataRows.map((line) => {
      const cells = line.split(",");
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = (cells[i] ?? "").trim();
      });
      return obj;
    });

    const txns = rawRows.map(mapRow);
    console.log("[miniSelfTest] Parsed txns=", txns.length);
    return txns;
  } catch (e) {
    console.error("[miniSelfTest] parseCsvFile error", e);
    return [];
  }
}

function positionDetail(txns: any[], key: string) {
  const { buildPositions } = require("../services/portfolio/holdings");
  const pos = buildPositions(txns).find((p: any) => p.key === key);
  if (!pos) return null;
  const value = (pos.lastPrice ?? 0) * pos.shares;
  return {
    ticker: key,
    shares: pos.shares,
    lastPrice: pos.lastPrice ?? 0,
    ccy: pos.ccyPrice || "",
    value,
    lastPriceTime: pos.lastTime,
  };
}

// Spustit testy při importu
if (typeof window !== 'undefined') {
  // Pouze v prohlížeči
  setTimeout(() => runNumberParsingTests(), 1000);
}

(async () => {
  const txns = await parseCsvFile("public/test-data.csv"); // dej cestu k tvému CSV
  console.log("Počet transakcí:", txns.length);
  if (!txns.length) throw new Error("CSV je prázdné nebo se nenačetlo.");

  const weights = valueAndWeightsByCurrency(txns);
  const sumByCcy: Record<string, number> = {};
  for (const r of weights) {
    sumByCcy[r.ccy] = (sumByCcy[r.ccy] ?? 0) + (r.weightPct ?? 0);
  }
  console.table(sumByCcy);

  console.log("Portfolio detail:");
  console.table(weights);

  const detail = positionDetail(txns, "AAPL");
  console.log("Detail AAPL:", detail);
})();
