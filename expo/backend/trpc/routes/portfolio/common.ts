import { z } from "zod";
import Decimal from "decimal.js";

export const CurrencySchema = z.enum(["CZK", "EUR", "USD", "GBP"]);
export type Currency = z.infer<typeof CurrencySchema>;

export const TradeSchema = z.object({
  id: z.string().optional(),
  broker: z.string().optional(),
  isin: z.string().optional(),
  ticker: z.string().optional(),
  symbol: z.string().optional(),
  name: z.string().optional(),
  type: z.enum(["buy", "sell", "deposit", "withdrawal", "dividend", "fee", "split"]),
  qty: z.number(),
  price: z.number().default(0),
  fee: z.number().optional().default(0),
  currency: CurrencySchema.default("EUR"),
  date: z.coerce.date(),
});
export type Trade = z.infer<typeof TradeSchema>;

export type Position = {
  symbol: string;
  name: string;
  isin?: string;
  qty: number;
  avgCost: number;
  currency: Currency;
  marketPrice?: number;
  marketValueCZK: number;
  unrealizedPnLCZK: number;
};

export interface PriceProvider {
  getPrice(symbolOrIsin: string, date?: Date): Promise<number | undefined>;
}

export interface FxProvider {
  getRate(from: Currency, to: Currency, date?: Date): Promise<number>;
}

export class StaticPriceProvider implements PriceProvider {
  private map: Record<string, number>;
  constructor(map?: Record<string, number>) {
    this.map = map ?? {};
  }
  async getPrice(key: string, _date?: Date) {
    return this.map[key] ?? undefined;
  }
  set(key: string, value: number) {
    this.map[key] = value;
  }
}

export class StaticFxProvider implements FxProvider {
  private table: Record<string, number>;
  constructor(table?: Record<string, number>) {
    this.table = table ?? {
      "EUR_CZK": 24.5,
      "USD_CZK": 22.8,
      "GBP_CZK": 28.7,
      "CZK_EUR": 1 / 24.5,
      "CZK_USD": 1 / 22.8,
      "CZK_GBP": 1 / 28.7,
      "EUR_USD": 1.08,
      "USD_EUR": 0.93,
      "EUR_GBP": 0.85,
      "GBP_EUR": 1.17,
      "USD_GBP": 0.79,
      "GBP_USD": 1.26,
    };
  }
  set(key: string, value: number) {
    this.table[key] = value;
  }
  async getRate(from: Currency, to: Currency, _date?: Date) {
    if (from === to) return 1;
    return this.table[`${from}_${to}`] ?? 1;
  }
}

export function normalizeNumber(input: string): number {
  if (!input) return 0;
  let s = input.replace(/\u00A0|\s/g, "");
  if (s.includes(",") && s.includes(".")) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    const parts = s.split(",");
    if (parts[1]?.length && parts[1].length <= 3) s = s.replace(",", ".");
    else s = s.replace(/,/g, "");
  }
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

export function instrumentKey(isin?: string | null, ticker?: string | null, symbol?: string | null): string {
  return (isin && isin.trim()) || (ticker && ticker.trim()) || (symbol && symbol.trim()) || "UNKNOWN";
}

export function buildPositionsFIFO(trades: Trade[]): Position[] {
  type Lot = { qty: Decimal; costPerUnit: Decimal };
  const lotsByKey = new Map<string, Lot[]>();
  const metaByKey = new Map<string, { name: string; isin?: string; currency: Currency }>();

  for (const t of [...trades].sort((a, b) => +a.date - +b.date)) {
    const key = instrumentKey(t.isin, t.ticker, t.symbol);
    if (!lotsByKey.has(key)) lotsByKey.set(key, []);
    if (!metaByKey.has(key)) metaByKey.set(key, { name: t.name ?? key, isin: t.isin, currency: t.currency });

    const lots = lotsByKey.get(key)!;

    if (t.type === "split") {
      const factor = new Decimal(t.qty !== 0 ? t.qty : 1);
      lots.forEach((l) => (l.qty = l.qty.mul(factor)));
      continue;
    }

    if (t.type === "buy") {
      const qty = new Decimal(t.qty);
      const price = new Decimal(t.price);
      const fee = new Decimal(t.fee ?? 0);
      const totalCost = qty.mul(price).add(fee);
      const costPerUnit = totalCost.div(qty);
      lots.push({ qty, costPerUnit });
    } else if (t.type === "sell") {
      let remaining = new Decimal(t.qty);
      while (remaining.gt(0) && lots.length) {
        const lot = lots[0];
        const take = Decimal.min(remaining, lot.qty);
        lot.qty = lot.qty.sub(take);
        remaining = remaining.sub(take);
        if (lot.qty.lte(new Decimal("0.00000001"))) lots.shift();
      }
    }
  }

  const positions: Position[] = [];
  for (const [key, lots] of lotsByKey.entries()) {
    const meta = metaByKey.get(key)!;
    const qtyD = lots.reduce((s, l) => s.add(l.qty), new Decimal(0));
    if (qtyD.lte(0)) continue;
    const totalCostD = lots.reduce((s, l) => s.add(l.qty.mul(l.costPerUnit)), new Decimal(0));
    const avgCostD = totalCostD.div(qtyD);
    const qty = Number(qtyD.toDecimalPlaces(8).toString());
    const avgCost = Number(avgCostD.toDecimalPlaces(8).toString());
    positions.push({ symbol: key, name: meta.name, isin: meta.isin, qty, avgCost, currency: meta.currency, marketValueCZK: 0, unrealizedPnLCZK: 0 });
  }
  return positions;
}

export async function enrichWithMarket(positions: Position[], priceProvider: PriceProvider, fx: FxProvider, valuationDate?: Date): Promise<Position[]> {
  const out: Position[] = [];
  for (const p of positions) {
    const px = (await priceProvider.getPrice(p.isin ?? p.symbol, valuationDate)) ?? p.avgCost;
    const rate = await fx.getRate(p.currency, "CZK", valuationDate);
    const qtyD = new Decimal(p.qty);
    const pxD = new Decimal(px);
    const rateD = new Decimal(rate);
    const mvCzkD = qtyD.mul(pxD).mul(rateD);
    const costCzkD = qtyD.mul(new Decimal(p.avgCost)).mul(rateD);
    const marketValueCZK = Number(mvCzkD.toDecimalPlaces(8).toString());
    const unrealizedPnLCZK = Number(mvCzkD.sub(costCzkD).toDecimalPlaces(8).toString());
    out.push({ ...p, marketPrice: Number(pxD.toDecimalPlaces(8).toString()), marketValueCZK, unrealizedPnLCZK });
  }
  return out;
}

export function calcAllocations(positions: Array<Position & { marketValueBase?: number }>) {
  const getMV = (p: Position & { marketValueBase?: number }) => (p as any).marketValueBase ?? p.marketValueCZK;
  const totalD = positions.reduce((s, p) => s.add(new Decimal(getMV(p))), new Decimal(0));
  const total = totalD.eq(0) ? new Decimal(1) : totalD;
  const byInstrument = positions.map((p) => {
    const pct = new Decimal(getMV(p)).div(total).mul(100);
    return { key: p.symbol, label: p.name, percent: Number(pct.toDecimalPlaces(2).toString()) };
  });
  const byCurrencyMap = new Map<Currency, Decimal>();
  positions.forEach((p) => byCurrencyMap.set(p.currency, (byCurrencyMap.get(p.currency) ?? new Decimal(0)).add(new Decimal(getMV(p)))));
  const byCurrency = Array.from(byCurrencyMap.entries()).map(([c, v]) => ({ key: c, label: c, percent: Number(v.div(total).mul(100).toDecimalPlaces(2).toString()) }));
  return { byInstrument, byCurrency };
}

export function calcTWRXIRR(): { twr: number; xirr: number } {
  return { twr: 0, xirr: 0 };
}
