import { Txn } from "./importCsv";

// 1) změna počtu akcií podle typu akce
export function sharesDelta(action: string | undefined, shares: number | null): number {
  const s = shares ?? 0;
  const a = (action || "").toLowerCase();
  if (/buy/.test(a)) return +Math.abs(s);
  if (/sell/.test(a)) return -Math.abs(s);
  return 0;
}

// 2) aktuální držby po tickeru
export function buildPositions(txns: Txn[]) {
  type Pos = {
    ticker: string;
    name?: string;
    shares: number;
    lastPrice?: number | null;
    ccyPrice: string;
    lastTime?: string;
  };
  const pos = new Map<string, Pos>();

  for (const t of txns) {
    const key = (t.ticker || t.name || "N/A").trim();
    if (!key) continue;
    const d = sharesDelta(t.action, t.shares ?? null);
    if (!pos.has(key)) {
      pos.set(key, {
        ticker: key,
        name: t.name,
        shares: 0,
        lastPrice: null,
        ccyPrice: t.ccyPrice || "",
        lastTime: undefined,
      });
    }
    const p = pos.get(key)!;
    p.shares += d;

    if (t.price != null && Number.isFinite(t.price)) {
      if (!p.lastTime || (t.time && p.lastTime && t.time > p.lastTime) || (!p.lastTime && t.time)) {
        p.lastPrice = t.price ?? null;
        p.ccyPrice = t.ccyPrice || p.ccyPrice || "";
        p.lastTime = t.time;
      }
    }
  }

  return [...pos.values()].filter((p) => (p.shares ?? 0) > 0);
}

// 3) ocenění pozic a váhy – per měna (bez FX)
export function valueAndWeightsByCurrency(txns: Txn[]) {
  const positions = buildPositions(txns);

  const valued = positions.map((p) => {
    const price = p.lastPrice ?? 0;
    return {
      ...p,
      marketValue: (p.shares ?? 0) * price,
    } as const;
  });

  const cashByCcy = new Map<string, number>();
  for (const t of txns) {
    const c = t.ccyAmount || "";
    const amt = (t.amount ?? 0) - (t.fees ?? 0) - (t.taxes ?? 0);
    cashByCcy.set(c, (cashByCcy.get(c) ?? 0) + amt);
  }

  type Row = { label: string; ccy: string; value: number; weightPct: number };
  const out: Row[] = [];

  const byCcy = new Map<string, number>();
  for (const v of valued) {
    const ccy = v.ccyPrice || "";
    byCcy.set(ccy, (byCcy.get(ccy) ?? 0) + v.marketValue);
  }
  for (const [ccy, cash] of cashByCcy.entries()) {
    byCcy.set(ccy, (byCcy.get(ccy) ?? 0) + cash);
  }

  const totals = byCcy;
  for (const v of valued) {
    const total = totals.get(v.ccyPrice || "") ?? 0;
    const w = total ? (v.marketValue / total) * 100 : 0;
    out.push({ label: v.ticker, ccy: v.ccyPrice || "", value: v.marketValue, weightPct: w });
  }
  for (const [ccy, cash] of cashByCcy.entries()) {
    const total = totals.get(ccy) ?? 0;
    const w = total ? (cash / total) * 100 : 0;
    out.push({ label: "CASH", ccy, value: cash, weightPct: w });
  }

  out.sort((a, b) => a.ccy.localeCompare(b.ccy) || b.weightPct - a.weightPct);
  return out;
}
