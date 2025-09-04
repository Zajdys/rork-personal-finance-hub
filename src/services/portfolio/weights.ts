import { Txn } from "./importCsv";

export function portfolioWeightsAtLatest(txns: Txn[]) {
  const withPos = txns.filter(t => t.price != null && t.shares != null && t.time);
  if (!withPos.length) return [];
  withPos.sort((a,b)=> (a.time! < b.time! ? -1 : 1));
  const latest = withPos[withPos.length-1].time!;
  const snap = withPos.filter(t => t.time === latest);

  const groups = new Map<string, number>(); // ccy::label -> value
  const totals = new Map<string, number>(); // ccy -> total

  for (const t of snap) {
    const value = (t.price ?? 0) * (t.shares ?? 0);
    const ccy = t.ccyPrice || "";
    const label = t.ticker ?? t.name ?? "N/A";
    const key = `${ccy}::${label}`;
    groups.set(key, (groups.get(key) ?? 0) + value);
    totals.set(ccy, (totals.get(ccy) ?? 0) + value);
  }

  return [...groups.entries()].map(([key, val]) => {
    const [ccy, label] = key.split("::");
    const total = totals.get(ccy) ?? 0;
    const weightPct = total ? (val / total) * 100 : null;
    return { ccy, label, value: val, weightPct };
  }).sort((a,b)=> a.ccy.localeCompare(b.ccy) || (b.weightPct ?? 0) - (a.weightPct ?? 0));
}
