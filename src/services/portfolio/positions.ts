import { Txn } from "./importCsv";

function sharesDelta(action: string | undefined, shares: number | null): number {
  const s = shares ?? 0;
  const a = (action || "").toLowerCase();
  if (/buy/.test(a)) return +Math.abs(s);
  if (/sell/.test(a)) return -Math.abs(s);
  return 0;
}

export type BuiltPosition = { key: string; name?: string; shares: number; lastPrice?: number|null; ccyPrice: string; lastTime?: string };

export function buildPositions(txns: Txn[]) {
  type Pos = BuiltPosition;
  const pos = new Map<string, Pos>();

  for (const t of txns) {
    const key = (t.ticker || t.name || "").trim();
    if (!key) continue;

    const d = sharesDelta(t.action, t.shares ?? null);
    if (!pos.has(key)) pos.set(key, { key, name: t.name, shares: 0, lastPrice: null, ccyPrice: t.ccyPrice || "", lastTime: undefined });
    const p = pos.get(key)!;
    p.shares += d;

    if (t.price != null && Number.isFinite(t.price)) {
      if (!p.lastTime || (t.time && new Date(t.time) > new Date(p.lastTime))) {
        p.lastPrice = t.price!;
        p.ccyPrice = t.ccyPrice || p.ccyPrice || "";
        p.lastTime = t.time;
      }
    }
  }

  return [...pos.values()].filter(p => p.shares > 0);
}

export type WeightRow = { ccy: string; label: string; value: number; weightPct: number };

export function valueAndWeightsByCurrency(txns: Txn[]): WeightRow[] {
  const positions = buildPositions(txns);

  const valued = positions.map(p => ({
    ...p,
    marketValue: (p.lastPrice ?? 0) * p.shares,
  }));

  const cashByCcy = new Map<string, number>();
  for (const t of txns) {
    const ccy = t.ccyAmount || "";
    const net = (t.amount ?? 0) - (t.fees ?? 0) - (t.taxes ?? 0);
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

  const rows: WeightRow[] = [];
  for (const v of valued) {
    const total = totalByCcy.get(v.ccyPrice || "") ?? 0;
    rows.push({
      ccy: v.ccyPrice || "",
      label: v.key,
      value: v.marketValue,
      weightPct: total ? (v.marketValue / total) * 100 : 0,
    });
  }
  for (const [ccy, csh] of cashByCcy.entries()) {
    const total = totalByCcy.get(ccy) ?? 0;
    rows.push({
      ccy,
      label: "CASH",
      value: csh,
      weightPct: total ? (csh / total) * 100 : 0,
    });
  }

  return rows.sort((a,b)=> a.ccy.localeCompare(b.ccy) || b.weightPct - a.weightPct);
}

export type WeightsDiagnostics = {
  rows: WeightRow[];
  sumsByCcy: Record<string, number>;
  missingPriceTickers: string[];
};

export function computeWeightsDiagnostics(txns: Txn[]): WeightsDiagnostics {
  const rows = valueAndWeightsByCurrency(txns);
  const sums: Record<string, number> = {};
  for (const r of rows) {
    sums[r.ccy] = (sums[r.ccy] ?? 0) + r.weightPct;
  }
  const pos = buildPositions(txns);
  const missing = pos.filter(p => (p.lastPrice == null || !Number.isFinite(p.lastPrice as number)) && p.shares > 0).map(p => p.key);
  return { rows, sumsByCcy: sums, missingPriceTickers: missing };
}

export function logWeightsDebug(txns: Txn[], tolerance: number = 0.01) {
  try {
    const { rows, sumsByCcy, missingPriceTickers } = computeWeightsDiagnostics(txns);
    // eslint-disable-next-line no-console
    console.log("valueAndWeightsByCurrency rows");
    // eslint-disable-next-line no-console
    console.table(rows);
    const entries = Object.entries(sumsByCcy).sort((a,b)=> a[0].localeCompare(b[0]));
    for (const [ccy, sum] of entries) {
      const ok = Math.abs(sum - 100) <= tolerance;
      // eslint-disable-next-line no-console
      console.log(`CCY ${ccy}: sum=${sum.toFixed(4)}% ok=${ok}`);
    }
    if (missingPriceTickers.length) {
      // eslint-disable-next-line no-console
      console.warn("Missing last price for tickers (value=0):", missingPriceTickers.join(", "));
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("logWeightsDebug failed", e);
  }
}
