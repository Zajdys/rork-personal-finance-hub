import { Txn } from "./importCsv";

// změna kusů podle akce
function sharesDelta(action: string | undefined, shares: number | null): number {
  const s = shares ?? 0;
  const a = (action || "").toLowerCase();
  if (/buy/.test(a)) return +Math.abs(s);
  if (/sell/.test(a)) return -Math.abs(s);
  return 0;
}

// postav aktuální držby a nejnovější cenu
export function buildPositions(txns: Txn[]) {
  type Pos = { key: string; name?: string; shares: number; lastPrice?: number|null; ccyPrice: string; lastTime?: string };
  const pos = new Map<string, Pos>();

  for (const t of txns) {
    const key = (t.ticker || t.name || "").trim();
    if (!key) continue;

    // akumulace shares
    const d = sharesDelta(t.action, t.shares);
    if (!pos.has(key)) pos.set(key, { key, name: t.name, shares: 0, lastPrice: null, ccyPrice: t.ccyPrice || "", lastTime: undefined });
    const p = pos.get(key)!;
    p.shares += d;

    // nejnovější známá cena (podle času)
    if (t.price != null && Number.isFinite(t.price)) {
      if (!p.lastTime || (t.time && new Date(t.time) > new Date(p.lastTime))) {
        p.lastPrice = t.price!;
        p.ccyPrice = t.ccyPrice || p.ccyPrice || "";
        p.lastTime = t.time;
      }
    }
  }

  // jen kladné držby (vyhoď uzavřené/short)
  return [...pos.values()].filter(p => p.shares > 0);
}

export function valueAndWeightsByCurrency(txns: Txn[]) {
  const positions = buildPositions(txns);

  const valued = positions.map(p => ({
    ...p,
    marketValue: (p.lastPrice ?? 0) * p.shares, // v měně ceny
  }));

  // cash po měně částky
  const cashByCcy = new Map<string, number>();
  for (const t of txns) {
    const ccy = t.ccyAmount || "";
    const net = (t.amount ?? 0) - (t.fees ?? 0) - (t.taxes ?? 0);
    cashByCcy.set(ccy, (cashByCcy.get(ccy) ?? 0) + net);
  }

  // celkové sumy po měně (pozice v měně ceny + cash v téže měně)
  const totalByCcy = new Map<string, number>();
  for (const v of valued) {
    const c = v.ccyPrice || "";
    totalByCcy.set(c, (totalByCcy.get(c) ?? 0) + v.marketValue);
  }
  for (const [c, csh] of cashByCcy.entries()) {
    totalByCcy.set(c, (totalByCcy.get(c) ?? 0) + csh);
  }

  // výsledné řádky (tickery + cash)
  const rows: { ccy: string; label: string; value: number; weightPct: number }[] = [];
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

  // seřaď do UI: měna → váha desc
  return rows.sort((a,b)=> a.ccy.localeCompare(b.ccy) || b.weightPct - a.weightPct);
}
