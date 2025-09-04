import { Txn, calcNetCash } from "./importCsv";

// změna počtu kusů podle akce
function sharesDelta(action: string | undefined, shares: number | null): number {
  const s = shares ?? 0;
  const a = (action || "").toLowerCase();
  if (/buy/.test(a))  return +Math.abs(s);
  if (/sell/.test(a)) return -Math.abs(s);
  return 0;
}

// sestav aktuální držby a nejnovější cenu dle času
export function buildPositions(txns: Txn[]) {
  type Pos = { key: string; name?: string; shares: number; lastPrice?: number|null; ccyPrice: string; lastTime?: string };
  const pos = new Map<string, Pos>();

  for (const t of txns) {
    const key = (t.ticker || t.name || "").trim();
    if (!key) continue;

    const d = sharesDelta(t.action, t.shares);
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

  // ponech jen kladné držby (shorty/0 vyhoď, jinak kazí váhy)
  return [...pos.values()].filter(p => p.shares > 0);
}

// ocenění a váhy v rámci každé měny (pozice + cash)
export function valueAndWeightsByCurrency(txns: Txn[]) {
  const positions = buildPositions(txns);

  const valued = positions.map(p => ({
    ...p,
    marketValue: (p.lastPrice ?? 0) * p.shares, // v měně ceny
  }));

  // CASH po měnách (podle měny Amount)
  const cashByCcy = new Map<string, number>();
  for (const t of txns) {
    const ccy = t.ccyAmount || "";
    const net = calcNetCash(t);
    cashByCcy.set(ccy, (cashByCcy.get(ccy) ?? 0) + net);
  }

  // celkové součty po měně: pozice (měna ceny) + cash (měna amount)
  const totalByCcy = new Map<string, number>();
  for (const v of valued) {
    const c = v.ccyPrice || "";
    totalByCcy.set(c, (totalByCcy.get(c) ?? 0) + v.marketValue);
  }
  for (const [c, csh] of cashByCcy.entries()) {
    totalByCcy.set(c, (totalByCcy.get(c) ?? 0) + csh);
  }

  const rows: { ccy: string; label: string; value: number; weightPct: number }[] = [];
  for (const v of valued) {
    const total = totalByCcy.get(v.ccyPrice || "") ?? 0;
    rows.push({ ccy: v.ccyPrice || "", label: v.key, value: v.marketValue, weightPct: total ? (v.marketValue / total) * 100 : 0 });
  }
  for (const [ccy, csh] of cashByCcy.entries()) {
    const total = totalByCcy.get(ccy) ?? 0;
    rows.push({ ccy, label: "CASH", value: csh, weightPct: total ? (csh / total) * 100 : 0 });
  }

  return rows.sort((a,b)=> a.ccy.localeCompare(b.ccy) || b.weightPct - a.weightPct);
}
