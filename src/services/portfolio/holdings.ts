import type { Txn } from "./importCsv";

export function sharesDelta(action: string | undefined, shares: number | null): number {
  const s = shares ?? 0;
  const a = (action || "").toLowerCase();
  if (a.includes("buy")) return +Math.abs(s);
  if (a.includes("sell")) return -Math.abs(s);
  return 0;
}

export function buildPositions(txns: Txn[]) {
  type Pos = {
    key: string;
    name?: string;
    shares: number;
    lastPrice?: number | null;
    ccyPrice: string;
    lastTime?: string;
  };

  const pos = new Map<string, Pos>();

  for (const t of txns) {
    const key = (t.ticker || t.name || "").trim();
    if (!key) continue;

    const d = sharesDelta(t.action, t.shares ?? 0);
    if (!pos.has(key))
      pos.set(key, {
        key,
        name: t.name,
        shares: 0,
        lastPrice: null,
        ccyPrice: t.ccyPrice || "",
        lastTime: undefined,
      });

    const p = pos.get(key)!;
    p.shares += d;

    const price = t.price;
    if (price != null && Number.isFinite(price)) {
      if (!p.lastTime || (t.time && new Date(t.time) > new Date(p.lastTime))) {
        p.lastPrice = price;
        p.ccyPrice = t.ccyPrice || p.ccyPrice || "";
        p.lastTime = t.time;
      }
    }
  }

  return [...pos.values()].filter((p) => p.shares > 0);
}
