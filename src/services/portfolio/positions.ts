import { Txn } from "./importCsv";

export function sharesDelta(action: string | undefined, shares: number | null): number {
  const s: number = shares ?? 0;
  const a = (action || "").toLowerCase();
  if (/buy/.test(a)) return +Math.abs(s);
  if (/sell/.test(a)) return -Math.abs(s);
  return 0;
}

function parseTimeMs(t?: string): number | null {
  if (!t) return null;
  const ms = new Date(t).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function buildPositions(txns: Txn[]) {
  type Pos = {
    ticker: string;
    name?: string;
    shares: number;
    lastPrice?: number | null;
    ccyPrice: string;
    lastTime?: number; // ms epoch
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

    const price = t.price;
    const tMs = parseTimeMs(t.time);
    if (price != null && Number.isFinite(price) && tMs != null) {
      if (!p.lastTime || tMs > p.lastTime) {
        p.lastPrice = price;
        p.ccyPrice = t.ccyPrice || p.ccyPrice || "";
        p.lastTime = tMs;
      }
    }
  }

  return [...pos.values()].filter((p) => (p.shares ?? 0) > 0);
}

export function valueAndWeightsByCurrency(txns: Txn[]) {
  const positions = buildPositions(txns);

  const valued = positions.map((p) => {
    const price = p.lastPrice ?? 0;
    const hasPrice = p.lastPrice != null && Number.isFinite(p.lastPrice);
    const mv = (p.shares ?? 0) * (hasPrice ? price : 0);
    if (!hasPrice) {
      console.warn("[positions.valueAndWeightsByCurrency] Missing last price for ticker; weight set to 0", {
        ticker: p.ticker,
      });
    }
    return {
      ...p,
      marketValue: mv,
      missingPrice: !hasPrice,
    } as const;
  });

  const cashByCcy = new Map<string, number>();
  for (const t of txns) {
    const c = t.ccyAmount || "";
    const amt = (t.amount ?? 0) - (t.fees ?? 0) - (t.taxes ?? 0);
    cashByCcy.set(c, (cashByCcy.get(c) ?? 0) + amt);
  }

  type Row = { label: string; ccy: string; value: number; weightPct: number; missingPrice?: boolean };
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
    out.push({ label: v.ticker, ccy: v.ccyPrice || "", value: v.marketValue, weightPct: w, missingPrice: v.missingPrice });
  }
  for (const [ccy, cash] of cashByCcy.entries()) {
    const total = totals.get(ccy) ?? 0;
    const w = total ? (cash / total) * 100 : 0;
    out.push({ label: "CASH", ccy, value: cash, weightPct: w });
  }

  out.sort((a, b) => a.ccy.localeCompare(b.ccy) || b.weightPct - a.weightPct);
  return out;
}
