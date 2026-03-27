import { Txn, calcNetCash } from "./importCsv";

function sharesDelta(action: string | undefined, shares: number | null | undefined): number {
  const s = shares ?? 0;
  const a = (action || "").toLowerCase();
  if (/buy/.test(a))  return +Math.abs(s);
  if (/sell/.test(a)) return -Math.abs(s);
  return 0;
}

export function buildPositions(txns: Txn[]) {
  type Pos = { key: string; name?: string; shares: number; lastPrice?: number|null; ccyPrice: string; lastTime?: string };
  const pos = new Map<string, Pos>();

  for (const t of txns) {
    const key = (t.ticker || t.name || "").trim();
    if (!key) continue;

    // korporátní akce: split/reverse split
    if (t.splitRatio && Number.isFinite(t.splitRatio)) {
      const p = pos.get(key) ?? { key, name: t.name, shares: 0, lastPrice: null, ccyPrice: t.ccyPrice || "", lastTime: undefined };
      p.shares = p.shares * (t.splitRatio as number);
      pos.set(key, p);
    }

    const d = sharesDelta(t.action, t.shares);
    if (!pos.has(key)) pos.set(key, { key, name: t.name, shares: 0, lastPrice: null, ccyPrice: t.ccyPrice || "", lastTime: undefined });
    const p = pos.get(key)!;
    p.shares += d;

    const act = (t.action || "").toLowerCase();
    if ((/buy|sell/.test(act)) && t.price != null && Number.isFinite(t.price)) {
      if (!p.lastTime || (t.time && new Date(t.time) > new Date(p.lastTime))) {
        p.lastPrice = t.price!;
        p.ccyPrice = t.ccyPrice || p.ccyPrice || "";
        p.lastTime = t.time;
      }
    }
  }

  return [...pos.values()].filter(p => p.shares > 0);
}

export function valueAndWeightsByCurrency(txns: Txn[]) {
  const positions = buildPositions(txns);

  const valued = positions.map(p => ({
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

  type Row = { ccy: string; label: string; value: number; weightPct: number | null };
  const rows: Row[] = [];
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

  return rows.sort((a,b)=> a.ccy.localeCompare(b.ccy) || ((b.weightPct ?? -Infinity) - (a.weightPct ?? -Infinity)));
}

export type PositionDetail = {
  ticker: string;
  shares: number;
  lastPrice: number;
  ccy: string;
  value: number;
  lastPriceTime?: string;
};

export function positionDetail(txns: Txn[], key: string): PositionDetail | null {
  try {
    console.log('[positionDetail] start', { key, txnsCount: txns?.length ?? 0 });
    const pos = buildPositions(txns).find(p => p.key === key);
    if (!pos) {
      console.warn('[positionDetail] position not found', { key });
      return null;
    }
    const lastPrice = pos.lastPrice ?? 0;
    const value = lastPrice * pos.shares;
    const detail: PositionDetail = {
      ticker: key,
      shares: pos.shares,
      lastPrice,
      ccy: pos.ccyPrice || "",
      value,
      lastPriceTime: pos.lastTime,
    };
    console.log('[positionDetail] detail', detail);
    return detail;
  } catch (e) {
    console.error('[positionDetail] error', e);
    return null;
  }
}
