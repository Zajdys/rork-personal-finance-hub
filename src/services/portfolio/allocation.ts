import type { Txn } from "./importCsv";
import { calcNetCash } from "./importCsv";
import { buildPositions } from "./holdings";

export type AllocationRow = {
  ccy: string;
  label: string;
  value: number;
  weightPct: number | null;
};

export function valueAndWeightsByCurrency(txns: Txn[]): AllocationRow[] {
  try {
    console.log("[allocation] valueAndWeightsByCurrency: txns count=", txns?.length ?? 0);

    const positions = buildPositions(txns);

    const valued = positions.map((p) => ({
      ...p,
      marketValue: (p.lastPrice ?? 0) * p.shares,
    }));

    const cashByCcy = new Map<string, number>();
    for (const t of txns) {
      const ccy = t.ccyAmount || "";
      const net = calcNetCash(t);
      cashByCcy.set(ccy, (cashByCcy.get(ccy) ?? 0) + net);
    }

    const totalByCcy = new Map<string, number>();
    for (const v of valued) {
      const c = v.ccyPrice || "";
      totalByCcy.set(c, (totalByCcy.get(c) ?? 0) + v.marketValue);
    }
    for (const [c, csh] of cashByCcy.entries()) {
      totalByCcy.set(c, (totalByCcy.get(c) ?? 0) + csh);
    }

    const rows: AllocationRow[] = [];
    for (const v of valued) {
      const total = totalByCcy.get(v.ccyPrice || "") ?? 0;
      const weight = total > 0 ? (v.marketValue / total) * 100 : null;
      rows.push({ ccy: v.ccyPrice || "", label: v.key, value: v.marketValue, weightPct: weight });
    }
    for (const [ccy, csh] of cashByCcy.entries()) {
      const total = totalByCcy.get(ccy) ?? 0;
      const weight = total > 0 ? (csh / total) * 100 : null;
      rows.push({ ccy, label: "CASH", value: csh, weightPct: weight });
    }

    rows.sort((a, b) => a.ccy.localeCompare(b.ccy) || ((b.weightPct ?? -Infinity) - (a.weightPct ?? -Infinity)));

    console.log("[allocation] rows sample=", rows.slice(0, 5));
    return rows;
  } catch (err) {
    console.error("[allocation] valueAndWeightsByCurrency error:", err);
    return [];
  }
}
