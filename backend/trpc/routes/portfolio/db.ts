import { z } from 'zod';
import type { DB } from '../../utils/db';
import { Currency, Trade, buildPositionsFIFO, enrichWithMarket, StaticFxProvider, StaticPriceProvider } from './common';

export const ImportInputSchema = z.object({
  broker: z.enum(["XTB", "Trading212", "Anycoin", "Degiro"]).or(z.string()),
  rows: z.array(z.object({ raw: z.string(), cols: z.array(z.string()) })),
  baseCurrency: z.enum(["CZK", "EUR", "USD", "GBP"]).default("EUR"),
  userId: z.string().default('demo-user'),
  priceOverrides: z.record(z.string(), z.number()).optional(),
  fxOverrides: z.record(z.string(), z.number()).optional(),
});

export type ImportInput = z.infer<typeof ImportInputSchema>;

export async function importRows(db: DB, input: ImportInput) {
  let added = 0;
  for (const r of input.rows) {
    const rawHash = await sha256(r.raw);
    try {
      await db.run(
        `insert into transactions (user_id, broker, raw_hash, raw, type, qty, price, fee, currency, date, symbol, name, isin, ticker)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [input.userId, input.broker, rawHash, r.raw, 'buy', 0, 0, 0, input.baseCurrency, new Date().toISOString(), null, null, null, null]
      );
      added += 1;
    } catch (e) {}
  }
  return { added, deduped: input.rows.length - added };
}

export async function recomputePositions(db: DB, userId: string, priceOverrides?: Record<string, number>, fxOverrides?: Record<string, number>) {
  const rows = await db.all<any>(`select * from transactions where user_id = ? order by date asc`, [userId]);
  const trades: Trade[] = rows
    .filter((r) => r.type === 'buy' || r.type === 'sell')
    .map((r) => ({
      type: r.type,
      qty: Math.abs(Number(r.qty || 0)),
      price: Number(r.price || 0),
      fee: Number(r.fee || 0),
      currency: (r.currency as Currency) || 'EUR',
      date: new Date(r.date),
      isin: r.isin ?? undefined,
      ticker: r.ticker ?? undefined,
      symbol: r.symbol ?? undefined,
      name: r.name ?? undefined,
    }));

  const positions = buildPositionsFIFO(trades);
  const priceProvider = new StaticPriceProvider(priceOverrides);
  const fx = new StaticFxProvider(fxOverrides);
  const enriched = await enrichWithMarket(positions, priceProvider, fx);

  await db.run(`delete from positions where user_id = ?`, [userId]);
  for (const p of enriched) {
    await db.run(
      `insert into positions (user_id, symbol, name, isin, qty, avg_cost, currency, market_price, market_value_czk, unrealized_pnl_czk, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [userId, p.symbol, p.name, p.isin ?? null, p.qty, p.avgCost, p.currency, p.marketPrice ?? null, p.marketValueCZK, p.unrealizedPnLCZK]
    );
  }

  return enriched;
}

export async function getFxRate(db: DB, from: Currency, to: Currency): Promise<number> {
  if (from === to) return 1;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const row = await db.get<any>(
      `select rate from fx_rates where date <= ? and base = ? and quote = ? order by date desc limit 1`,
      [today, from, to]
    );
    if (row?.rate) return Number(row.rate);
  } catch (e) {}
  const fallback = new StaticFxProvider();
  return fallback.getRate(from, to);
}

export async function loadPositions(db: DB, userId: string, baseCurrency: Currency = 'CZK') {
  const rows = await db.all<any>(`select * from positions where user_id = ?`, [userId]);
  const out = [] as Array<{
    symbol: string;
    name: string;
    isin?: string;
    qty: number;
    avgCost: number;
    currency: Currency;
    marketPrice?: number;
    marketValueCZK: number;
    unrealizedPnLCZK: number;
    baseCurrency: Currency;
    marketValueBase: number;
    unrealizedPnLBase: number;
  }>;
  for (const r of rows) {
    const mvCzk = Number(r.market_value_czk);
    const pnlCzk = Number(r.unrealized_pnl_czk);
    const rate = await getFxRate(db, 'CZK' as Currency, baseCurrency);
    out.push({
      symbol: r.symbol,
      name: r.name,
      isin: r.isin ?? undefined,
      qty: Number(r.qty),
      avgCost: Number(r.avg_cost),
      currency: r.currency as Currency,
      marketPrice: r.market_price ? Number(r.market_price) : undefined,
      marketValueCZK: mvCzk,
      unrealizedPnLCZK: pnlCzk,
      baseCurrency,
      marketValueBase: mvCzk * rate,
      unrealizedPnLBase: pnlCzk * rate,
    });
  }
  return out;
}

export async function sha256(message: string) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}
