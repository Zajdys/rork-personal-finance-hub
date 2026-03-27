import { Txn } from "@/src/services/portfolio/importCsv";
import { buildPositions } from "@/src/services/portfolio/positions";

export type RealizedPnLRow = {
  key: string;
  ccy: string;
  time?: string;
  quantity: number;
  proceeds: number;
  cost: number;
  feesTaxes: number;
  pnl: number;
};

export type RealizedPnLSummary = {
  byInstrument: RealizedPnLRow[];
  totalsByCcy: Record<string, { proceeds: number; cost: number; feesTaxes: number; pnl: number }>;
};

export type UnrealizedPnLRow = {
  key: string;
  ccy: string;
  sharesOpen: number;
  avgCostOpen: number;
  lastPrice: number;
  pnl: number;
};

type Lot = { qty: number; unitCost: number };

function keyOf(t: Txn): string {
  return (t.ticker || t.isin || t.name || "").trim();
}

function isBuy(action: string | undefined): boolean {
  const a = (action || "").toLowerCase();
  return /buy/.test(a);
}

function isSell(action: string | undefined): boolean {
  const a = (action || "").toLowerCase();
  return /sell/.test(a);
}

function applySplit(lots: Lot[], ratio: number): Lot[] {
  if (!Number.isFinite(ratio) || ratio <= 0) return lots;
  return lots.map(l => ({ qty: l.qty * ratio, unitCost: l.unitCost / ratio }));
}

export function computeRealizedPnL(txns: Txn[]): RealizedPnLSummary {
  const lotsByKey = new Map<string, Lot[]>();
  const rows: RealizedPnLRow[] = [];
  for (const t of txns.slice().sort((a,b)=> new Date(a.time || "").getTime() - new Date(b.time || "").getTime())) {
    const key = keyOf(t);
    if (!key) continue;
    if (t.splitRatio && Number.isFinite(t.splitRatio)) {
      const oldLots = lotsByKey.get(key) ?? [];
      lotsByKey.set(key, applySplit(oldLots, t.splitRatio as number));
      continue;
    }
    const lots = lotsByKey.get(key) ?? [];
    if (isBuy(t.action) && (t.shares ?? 0) > 0 && (t.price ?? null) != null) {
      const qty = Math.abs(t.shares as number);
      const buyFeesTaxes = (t.fees ?? 0) + (t.taxes ?? 0);
      const unitCost = (t.price as number) + (qty > 0 ? buyFeesTaxes / qty : 0);
      lots.push({ qty, unitCost });
      lotsByKey.set(key, lots);
      continue;
    }
    if (isSell(t.action) && (t.shares ?? 0) > 0 && (t.price ?? null) != null) {
      let remaining = Math.abs(t.shares as number);
      let proceeds = 0;
      let cost = 0;
      while (remaining > 1e-12 && lots.length > 0) {
        const lot = lots[0];
        const take = Math.min(remaining, lot.qty);
        proceeds += take * (t.price as number);
        cost += take * lot.unitCost;
        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= 1e-12) lots.shift();
      }
      const feesTaxes = (t.fees ?? 0) + (t.taxes ?? 0);
      const qtySold = Math.abs((t.shares as number) - remaining);
      if (qtySold > 0) {
        const row: RealizedPnLRow = {
          key,
          ccy: t.ccyPrice || "",
          time: t.time,
          quantity: qtySold,
          proceeds,
          cost,
          feesTaxes,
          pnl: proceeds - cost - feesTaxes,
        };
        rows.push(row);
      }
      lotsByKey.set(key, lots);
      continue;
    }
  }
  const totalsByCcy: Record<string, { proceeds: number; cost: number; feesTaxes: number; pnl: number }> = {};
  for (const r of rows) {
    const c = r.ccy || "";
    const t = totalsByCcy[c] ?? { proceeds: 0, cost: 0, feesTaxes: 0, pnl: 0 };
    t.proceeds += r.proceeds;
    t.cost += r.cost;
    t.feesTaxes += r.feesTaxes;
    t.pnl += r.pnl;
    totalsByCcy[c] = t;
  }
  return { byInstrument: rows, totalsByCcy };
}

export function computeUnrealizedPnL(txns: Txn[]): UnrealizedPnLRow[] {
  const lotsByKey = new Map<string, Lot[]>();
  for (const t of txns.slice().sort((a,b)=> new Date(a.time || "").getTime() - new Date(b.time || "").getTime())) {
    const key = keyOf(t);
    if (!key) continue;
    if (t.splitRatio && Number.isFinite(t.splitRatio)) {
      const oldLots = lotsByKey.get(key) ?? [];
      lotsByKey.set(key, applySplit(oldLots, t.splitRatio as number));
      continue;
    }
    if (isBuy(t.action) && (t.shares ?? 0) > 0 && (t.price ?? null) != null) {
      const qty = Math.abs(t.shares as number);
      const buyFeesTaxes = (t.fees ?? 0) + (t.taxes ?? 0);
      const unitCost = (t.price as number) + (qty > 0 ? buyFeesTaxes / qty : 0);
      const lots = lotsByKey.get(key) ?? [];
      lots.push({ qty, unitCost });
      lotsByKey.set(key, lots);
    } else if (isSell(t.action) && (t.shares ?? 0) > 0) {
      let remaining = Math.abs(t.shares as number);
      const lots = lotsByKey.get(key) ?? [];
      while (remaining > 1e-12 && lots.length > 0) {
        const lot = lots[0];
        const take = Math.min(remaining, lot.qty);
        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= 1e-12) lots.shift();
      }
      lotsByKey.set(key, lots);
    }
  }
  const pos = buildPositions(txns);
  const priceByKey = new Map(pos.map(p => [p.key, { lastPrice: p.lastPrice ?? 0, ccy: p.ccyPrice || "" }]));
  const rows: UnrealizedPnLRow[] = [];
  for (const [key, lots] of lotsByKey.entries()) {
    const qty = lots.reduce((s,l)=> s + l.qty, 0);
    if (qty <= 1e-12) continue;
    const totalCost = lots.reduce((s,l)=> s + l.qty * l.unitCost, 0);
    const avgCost = qty > 0 ? totalCost / qty : 0;
    const pr = priceByKey.get(key);
    const lastPrice = pr?.lastPrice ?? 0;
    const ccy = pr?.ccy ?? "";
    rows.push({ key, ccy, sharesOpen: qty, avgCostOpen: avgCost, lastPrice, pnl: qty * (lastPrice - avgCost) });
  }
  return rows;
}

export type TwrPeriod = { date: string; starting: number; flows: number; ending: number };

export function computeTWR(periods: TwrPeriod[]): number | null {
  if (!periods || periods.length === 0) return null;
  let product = 1;
  for (const p of periods) {
    const start = p.starting;
    if (start <= 0) continue;
    const r = (p.ending - p.flows) / start;
    if (!Number.isFinite(r) || r <= 0) continue;
    product *= r;
  }
  return product - 1;
}

export type Cashflow = { date: string; amount: number };

function daysBetween(d0: Date, d1: Date): number {
  const ms = d1.getTime() - d0.getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function xnpv(rate: number, cashflows: Cashflow[]): number {
  if (!Number.isFinite(rate)) return NaN;
  const sorted = cashflows.slice().sort((a,b)=> new Date(a.date).getTime() - new Date(b.date).getTime());
  const t0 = new Date(sorted[0]?.date || Date.now());
  let npv = 0;
  for (const cf of sorted) {
    const t = new Date(cf.date);
    const dt = daysBetween(t0, t) / 365;
    npv += cf.amount / Math.pow(1 + rate, dt);
  }
  return npv;
}

export function xirr(cashflows: Cashflow[], guess = 0.1): number | null {
  if (!cashflows || cashflows.length === 0) return null;
  let rate = guess;
  for (let i = 0; i < 100; i++) {
    const f = xnpv(rate, cashflows);
    const h = 1e-6;
    const f1 = xnpv(rate + h, cashflows);
    const deriv = (f1 - f) / h;
    if (Math.abs(deriv) < 1e-10) break;
    const next = rate - f / deriv;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-9) {
      rate = next;
      break;
    }
    rate = next;
  }
  return Number.isFinite(rate) ? rate : null;
}
