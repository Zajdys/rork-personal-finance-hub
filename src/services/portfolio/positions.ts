import { Txn, calcNetCash } from "./importCsv";
import { getFxRates } from "../fx";

// změna počtu kusů podle akce
function sharesDelta(action: string | undefined, shares: number | null | undefined): number {
  const s = shares ?? 0;
  const a = (action || "").toLowerCase();
  if (/buy/.test(a))  return +Math.abs(s);
  if (/sell/.test(a)) return -Math.abs(s);
  return 0;
}

// sestav aktuální držby a nejnovější cenu dle času
export type Position = { key: string; name?: string; shares: number; lastPrice?: number | null; ccyPrice: string; lastTime?: string; lastPriceSource: 'quote' | 'txn' | 'none' };

export function buildPositions(txns: Txn[]) {
  const pos = new Map<string, Position>();

  for (const t of txns) {
    const key = (t.ticker || t.name || "").trim();
    if (!key) continue;

    const d = sharesDelta(t.action, t.shares);
    if (!pos.has(key)) pos.set(key, { key, name: t.name, shares: 0, lastPrice: null, ccyPrice: t.ccyPrice || "", lastTime: undefined, lastPriceSource: 'none' });
    const p = pos.get(key)!;
    p.shares += d;

    if (t.price != null && Number.isFinite(t.price)) {
      if (!p.lastTime || (t.time && new Date(t.time) > new Date(p.lastTime))) {
        p.lastPrice = t.price!;
        p.ccyPrice = t.ccyPrice || p.ccyPrice || "";
        p.lastTime = t.time;
        p.lastPriceSource = 'txn';
      }
    }
  }

  // ponech jen kladné držby (shorty/0 vyhoď, jinak kazí váhy)
  return [...pos.values()].filter(p => p.shares > 0);
}

export type ValuedPosition = Position & { marketValue: number; stale: boolean };

// ocenění a váhy v rámci každé měny (pozice + cash)
export function valueAndWeightsByCurrency(txns: Txn[]) {
  const positions = buildPositions(txns);

  const valued: ValuedPosition[] = positions.map(p => ({
    ...p,
    marketValue: (p.lastPrice ?? 0) * p.shares,
    stale: p.lastPriceSource !== 'quote' && (p.lastPrice ?? null) !== null,
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

  const rows: { ccy: string; label: string; value: number; weightPct: number; stale?: boolean }[] = [];
  for (const v of valued) {
    const total = totalByCcy.get(v.ccyPrice || "") ?? 0;
    rows.push({ ccy: v.ccyPrice || "", label: v.key, value: v.marketValue, weightPct: total ? (v.marketValue / total) * 100 : 0, stale: v.stale });
  }
  for (const [ccy, csh] of cashByCcy.entries()) {
    const total = totalByCcy.get(ccy) ?? 0;
    rows.push({ ccy, label: "CASH", value: csh, weightPct: total ? (csh / total) * 100 : 0 });
  }

  return rows.sort((a,b)=> a.ccy.localeCompare(b.ccy) || b.weightPct - a.weightPct);
}

export function logWeightsCheck(txns: Txn[], tolerance: number = 0.01) {
  const rows = valueAndWeightsByCurrency(txns);
  console.table(rows);
  const sums = new Map<string, number>();
  for (const r of rows) {
    const c = r.ccy || "";
    sums.set(c, (sums.get(c) ?? 0) + r.weightPct);
  }
  for (const [ccy, sum] of sums) {
    const diff = Math.abs(sum - 100);
    if (diff > tolerance) {
      console.warn(`[weights] Sum for ${ccy} = ${sum.toFixed(6)}% (Δ ${diff.toFixed(6)} > tol ${tolerance})`);
    } else {
      console.log(`[weights] Sum for ${ccy} OK: ${sum.toFixed(6)}%`);
    }
  }
  return rows;
}

// váhy převedené do base měny po FX konverzi po výpočtu hodnot
export async function valueAndWeightsInBase(txns: Txn[], baseCcy: string) {
  console.log('[valueAndWeightsInBase] start', { baseCcy, txns: txns.length });
  const perCcy = valueAndWeightsByCurrency(txns);
  const fx = await getFxRates(baseCcy);
  console.log('[valueAndWeightsInBase] fx', fx);

  type Row = { ccy: string; label: string; value: number; valueBase: number; weightPct: number; stale?: boolean };
  const rowsBase: Row[] = perCcy.map(r => {
    const ccy = r.ccy || baseCcy;
    const rate = ccy.toUpperCase() === baseCcy.toUpperCase() ? 1 : (fx.rates[ccy.toUpperCase()] ?? null);
    let valueBase = r.value;
    if (rate && rate > 0) {
      valueBase = r.value / rate;
    } else if (ccy && ccy.toUpperCase() !== baseCcy.toUpperCase()) {
      console.warn('[FX] Missing rate for', ccy, '->', baseCcy, 'keeping nominal value');
    }
    return { ...r, valueBase } as Row;
  });

  const totalBase = rowsBase.reduce((s, r) => s + (r.valueBase ?? 0), 0);
  const final = rowsBase.map(r => ({ ...r, weightPct: totalBase ? (r.valueBase / totalBase) * 100 : 0 }));
  final.sort((a, b) => b.weightPct - a.weightPct);
  console.table(final);
  return final;
}
