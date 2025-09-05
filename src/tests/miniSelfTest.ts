// @ts-nocheck
import { valueAndWeightsByCurrency } from "../services/portfolio/allocation";
import { mapRow } from "../services/portfolio/importCsv"; // uprav cestu podle projektu

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
