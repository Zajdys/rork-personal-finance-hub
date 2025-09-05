import { portfolioAndCashByCurrency, type PortfolioRow, type CashRow } from "./allocation";
import { mapRow, type Txn } from "./importCsv";

export type CalcPortfolioResult = { portfolio: PortfolioRow[]; cash: CashRow[] };

export function calcPortfolio(trades: Array<Record<string, string | undefined>>): CalcPortfolioResult {
  try {
    console.log("[calcPortfolio] start", { tradesCount: trades?.length ?? 0 });
    if (!Array.isArray(trades)) {
      console.error("[calcPortfolio] trades is not an array");
      return { portfolio: [], cash: [] };
    }

    const txns: Txn[] = trades.map((r) => mapRow(r));
    console.log("[calcPortfolio] mapped txns sample", txns.slice(0, 3));

    const { portfolio, cash } = portfolioAndCashByCurrency(txns);
    console.log("[calcPortfolio] result sizes", { portfolio: portfolio.length, cash: cash.length });
    return { portfolio, cash };
  } catch (err) {
    console.error("[calcPortfolio] error", err);
    return { portfolio: [], cash: [] };
  }
}

export type { PortfolioRow, CashRow };

export type SimpleHolding = {
  symbol: string;
  shares: number;
  totalInvested: number;
  avgBuyPrice: number;
};

export function buildPortfolioFromTrades(trades: Array<Record<string, string | undefined>>): SimpleHolding[] {
  try {
    console.log("[buildPortfolioFromTrades] start", { tradesCount: trades?.length ?? 0 });
    const txns: Txn[] = Array.isArray(trades) ? trades.map((r) => mapRow(r)) : [];

    type Acc = { shares: number; totalInvested: number };
    const map = new Map<string, Acc>();

    for (const t of txns) {
      const symbol = (t.ticker || t.name || t.isin || "").trim();
      if (!symbol) continue;

      if (!map.has(symbol)) map.set(symbol, { shares: 0, totalInvested: 0 });
      const pos = map.get(symbol)!;

      // stock splits
      if (t.splitRatio && t.splitRatio > 0) {
        pos.shares = pos.shares * t.splitRatio;
        pos.totalInvested = pos.totalInvested; // cost basis unchanged
      }

      const action = (t.action || "").toLowerCase();
      const sh = Math.max(0, t.shares ?? 0);
      const price = t.price ?? null;
      const fees = t.fees ?? 0;

      if (action.includes("buy") && price != null) {
        const cost = sh * price + fees;
        pos.totalInvested += cost;
        pos.shares += sh;
      } else if (action.includes("sell") && sh > 0) {
        const currentShares = pos.shares;
        if (currentShares <= 0) continue;
        const avg = currentShares > 0 ? pos.totalInvested / currentShares : 0;
        const toReduce = Math.min(sh, currentShares);
        pos.shares = currentShares - toReduce;
        pos.totalInvested -= avg * toReduce;
      } else {
        // ignore dividends, interest, withdrawals for holdings count
      }
    }

    const result: SimpleHolding[] = [];
    for (const [symbol, p] of map.entries()) {
      if (p.shares > 0) {
        const avg = p.shares > 0 ? p.totalInvested / p.shares : 0;
        result.push({ symbol, shares: p.shares, totalInvested: p.totalInvested, avgBuyPrice: avg });
      }
    }

    result.sort((a, b) => a.symbol.localeCompare(b.symbol));
    console.log("[buildPortfolioFromTrades] result sample", result.slice(0, 5));
    return result;
  } catch (e) {
    console.error("[buildPortfolioFromTrades] error", e);
    return [];
  }
}
