import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { getDB } from "../../../utils/db";
import { normalizeNumber, StaticFxProvider } from "../common";
import { recomputePositions, sha256 } from "../db";

const RowSchema = z.object({
  raw: z.string(),
  cols: z.array(z.string()),
});

export default publicProcedure
  .input(
    z.object({
      broker: z.enum(["XTB", "Trading212", "Anycoin", "Degiro"]).or(z.string()),
      rows: z.array(RowSchema),
      baseCurrency: z.enum(["CZK", "EUR", "USD", "GBP"]).default("EUR"),
      userId: z.string().default("demo-user"),
      priceOverrides: z.record(z.string(), z.number()).optional(),
      fxOverrides: z.record(z.string(), z.number()).optional(),
    })
  )
  .mutation(async ({ input }) => {
    const db = getDB();
    let added = 0;
    let deduped = 0;

    for (const row of input.rows) {
      const broker = String(input.broker);
      const tx = parseRow(broker, row.cols, input.baseCurrency);
      if (tx.type === 'buy' || tx.type === 'sell') {
        if (!tx.isin) {
          throw new Error("ISIN missing. Provide manual mapping.");
        }
      }
      const rawHash = await getRawHash(broker, row.cols, row.raw);
      try {
        await db.run(
          `insert into transactions (user_id, broker, raw_hash, raw, type, qty, price, fee, currency, date, symbol, name, isin, ticker)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.userId,
            broker,
            rawHash,
            row.raw,
            tx.type,
            Math.abs(tx.qty ?? 0),
            tx.price ?? 0,
            tx.fee ?? 0,
            tx.currency ?? input.baseCurrency,
            tx.date?.toISOString() ?? new Date().toISOString(),
            tx.symbol ?? null,
            tx.name ?? null,
            tx.isin ?? null,
            tx.ticker ?? null,
          ]
        );
        added += 1;
      } catch (e: any) {
        const msg = String(e?.message ?? "");
        if (msg.includes("ISIN missing")) {
          throw e;
        }
        deduped += 1;
      }
    }

    const enriched = await recomputePositions(db, input.userId, input.priceOverrides, input.fxOverrides);
    const total = enriched.reduce((s, p) => s + p.marketValueCZK, 0) || 1;

    const fx = new StaticFxProvider(input.fxOverrides);

    const debug = await Promise.all(
      enriched.map(async (p) => {
        const rate = await fx.getRate(p.currency as any, "CZK" as any);
        return {
          ISIN: p.isin ?? null,
          qty: p.qty,
          lastPrice: p.marketPrice ?? p.avgCost,
          FX: rate,
          marketValueCZK: p.marketValueCZK,
          percent: Math.round(((p.marketValueCZK / total) * 100) * 100) / 100,
        };
      })
    );

    return {
      broker: input.broker,
      received: input.rows.length,
      added,
      deduped,
      baseCurrency: input.baseCurrency,
      positions: enriched,
      debug,
    };
  });

async function getRawHash(broker: string, cols: string[], raw: string) {
  const b = broker.toLowerCase();
  if (b.includes('trading212')) {
    const candidates = cols
      .map((c) => (c ?? '').trim())
      .filter((c) => /[a-z0-9]/i.test(c))
      .filter((c) => /^[-a-z0-9]+$/i.test(c))
      .filter((c) => c.length >= 6);
    const id = candidates[candidates.length - 1];
    if (id) return id;
  }
  return await sha256(raw);
}

function parseRow(broker: string, cols: string[], baseCurrency: string) {
  const toLower = (s?: string) => (s ? s.toLowerCase() : "");
  const flat = cols.map((c) => (c ?? "").trim());
  const joined = toLower(flat.join("|"));

  const guessType = () => {
    if (/^market\s*sell|^limit\s*sell|\|\s*sell\s*\|/.test(joined)) return "sell" as const;
    if (/^market\s*buy|^limit\s*buy|\|\s*buy\s*\|/.test(joined)) return "buy" as const;
    if (/dividend/.test(joined)) return "dividend" as const;
    if (/interest/.test(joined)) return "interest" as const;
    if (/fee|poplatek/.test(joined)) return "fee" as const;
    if (/deposit|vklad/.test(joined)) return "deposit" as const;
    if (/withdraw|vyber|výběr/.test(joined)) return "withdrawal" as const;
    if (/sell|prodej/.test(joined)) return "sell" as const;
    if (/buy|nakup|nákup/.test(joined)) return "buy" as const;
    return "buy" as const;
  };

  const type = guessType();

  const pick = (idxFallback: number) => flat[idxFallback] ?? "";

  let qtyStr = pick(2);
  let priceStr = pick(3);
  let feeStr = pick(4);

  const currencyGuess = flat.find((c) => /^(czk|eur|usd|gbp)$/i.test(c));
  let currency = (currencyGuess as any) || (flat[5] as any) || baseCurrency;

  let dateStr = pick(6) || new Date().toISOString();
  const isin = flat.find((c) => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(c)) || flat[7];
  const ticker = flat[8];
  const symbol = flat[1] || ticker || (isin ?? undefined) || undefined;
  const name = flat[1] || symbol || undefined;

  let qty = normalizeNumber(qtyStr);
  let price = normalizeNumber(priceStr);
  let fee = normalizeNumber(feeStr);

  if (isNaN(qty) || qty === 0) {
    const numericCol = flat.find((c) => /[0-9]/.test(c));
    qty = normalizeNumber(numericCol ?? "0");
  }

  if (isNaN(price)) price = 0;
  if (isNaN(fee)) fee = 0;

  if (qty < 0) qty = Math.abs(qty);

  const b = toLower(broker);
  if (b.includes("trading212")) {
    const action = toLower(flat[0] || joined);
    if (/(^|\|)market\s*buy|(^|\|)limit\s*buy/.test(action)) {
      // buy
    } else if (/(^|\|)market\s*sell|(^|\|)limit\s*sell/.test(action)) {
      // sell
    } else if (/withdrawal/.test(action)) {
      return { type: 'withdrawal' as const, qty: 0, price: 0, fee, currency: String(currency).toUpperCase(), date: new Date(dateStr), isin: undefined, ticker, symbol: undefined, name };
    } else if (/deposit/.test(action)) {
      return { type: 'deposit' as const, qty: 0, price: 0, fee, currency: String(currency).toUpperCase(), date: new Date(dateStr), isin: undefined, ticker, symbol: undefined, name };
    } else if (/interest/.test(action)) {
      return { type: 'interest' as const, qty: 0, price: 0, fee, currency: String(currency).toUpperCase(), date: new Date(dateStr), isin, ticker, symbol, name } as any;
    } else if (/dividend/.test(action)) {
      return { type: 'dividend' as const, qty: 0, price: 0, fee, currency: String(currency).toUpperCase(), date: new Date(dateStr), isin, ticker, symbol, name };
    }
  }
  if (b.includes("xtb") || b.includes("degiro")) {
    // qty stays positive, type dictates direction
  }
  if (b.includes("anycoin")) {
    // fees remain in fee column
  }

  const date = new Date(!isNaN(Date.parse(dateStr)) ? dateStr : new Date().toISOString());

  return { type, qty, price, fee, currency: String(currency).toUpperCase(), date, isin, ticker, symbol, name };
}
