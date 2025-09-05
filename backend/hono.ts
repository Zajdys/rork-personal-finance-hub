import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { cors } from "hono/cors";
import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import * as fs from "node:fs";
import Papa from "papaparse";
import yahooFinance from "yahoo-finance2";

interface TradeRow {
  Action: string;
  Ticker: string;
  Time?: string;
  [key: string]: string | number | undefined;
}

interface FIFOPosition {
  fifo: Array<{ shares: number; cost: number }>;
  shares: number;
  invested: number;
}

// app will be mounted at /api
const app = new Hono();

// Enable CORS for all routes
app.use("*", cors());

// Mount tRPC router at /trpc
app.use(
  "/trpc/*",
  trpcServer({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext,
  })
);

// Simple health check endpoint
app.get("/", (c) => {
  return c.json({ status: "ok", message: "API is running" });
});

function calculateFIFO(trades: TradeRow[]) {
  const portfolio: Record<string, FIFOPosition> = {};

  const sorted = [...trades].sort((a, b) => {
    const at = new Date(String(a.Time ?? "")).getTime();
    const bt = new Date(String(b.Time ?? "")).getTime();
    return at - bt;
  });

  for (const trade of sorted) {
    const ticker = String(trade.Ticker);
    const shares = parseFloat(String(trade["No. of shares"])) || 0;
    const total = parseFloat(String(trade["Total"])) || 0;
    const action = String(trade.Action ?? "").toLowerCase();

    if (!portfolio[ticker]) {
      portfolio[ticker] = { fifo: [], shares: 0, invested: 0 };
    }

    if (action.includes("buy")) {
      portfolio[ticker].fifo.push({ shares, cost: total });
      portfolio[ticker].shares += shares;
      portfolio[ticker].invested += total;
    } else if (action.includes("sell")) {
      let sharesToSell = shares;
      while (sharesToSell > 0 && portfolio[ticker].fifo.length > 0) {
        const batch = portfolio[ticker].fifo.shift() as { shares: number; cost: number };
        if (batch.shares <= sharesToSell) {
          sharesToSell -= batch.shares;
          portfolio[ticker].shares -= batch.shares;
          portfolio[ticker].invested -= batch.cost;
        } else {
          const originalShares = batch.shares;
          const costPerShare = batch.cost / originalShares;
          const remainingShares = originalShares - sharesToSell;
          const remainingCost = remainingShares * costPerShare;
          portfolio[ticker].fifo.unshift({ shares: remainingShares, cost: remainingCost });
          portfolio[ticker].shares -= sharesToSell;
          portfolio[ticker].invested -= costPerShare * sharesToSell;
          sharesToSell = 0;
        }
      }
    }
  }

  return portfolio;
}

app.get("/portfolio", async (c) => {
  try {
    const csvPath = `${process.cwd()}/trading all.csv`;
    if (!fs.existsSync(csvPath)) {
      return c.json({ error: "CSV file not found. Place 'trading all.csv' in project root." }, 404);
    }

    const csvFile = fs.readFileSync(csvPath, "utf8");
    const parsed = Papa.parse<TradeRow>(csvFile, { header: true, skipEmptyLines: true });
    const rows = parsed.data.filter(Boolean);

    const trades = rows.filter((row) =>
      ["Market buy", "Limit buy", "Market sell", "Limit sell"].includes(String(row.Action))
    );

    const portfolio = calculateFIFO(trades);
    const tickers = Object.keys(portfolio);

    const results = await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const quote = await yahooFinance.quote(ticker as any);
          const currentPrice = Number((quote as any)?.regularMarketPrice ?? 0) || 0;
          const info = portfolio[ticker];
          const currentValue = currentPrice * info.shares;
          const profitLoss = currentValue - info.invested;
          const profitLossPct = info.invested > 0 ? (profitLoss / info.invested) * 100 : 0;

          return {
            Ticker: ticker,
            Shares: Number(info.shares),
            Invested: Number(info.invested.toFixed(2)),
            CurrentPrice: Number(currentPrice.toFixed(2)),
            CurrentValue: Number(currentValue.toFixed(2)),
            ProfitLoss: Number(profitLoss.toFixed(2)),
            ProfitLossPct: Number(profitLossPct.toFixed(2)),
          };
        } catch (err) {
          console.error(`[portfolio] price fetch failed for ${ticker}`, err);
          const info = portfolio[ticker];
          return {
            Ticker: ticker,
            Shares: Number(info.shares),
            Invested: Number(info.invested.toFixed(2)),
            CurrentPrice: 0,
            CurrentValue: 0,
            ProfitLoss: Number((-info.invested).toFixed(2)),
            ProfitLossPct: -100,
          };
        }
      })
    );

    const sorted = results.sort((a, b) => b.CurrentValue - a.CurrentValue);
    return c.json(sorted);
  } catch (e) {
    console.error("/portfolio error", e);
    return c.json({ error: "Failed to build portfolio" }, 500);
  }
});

export default app;