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

export type FifoLot = { shares: number; costPerShare: number };
export type HoldingFifo = {
  symbol: string;
  openLots: FifoLot[];
  realizedPL: number;
  shares: number;
  totalCost: number;
  avgBuyPrice: number;
};

export type SimpleTrade = {
  symbol: string | undefined;
  type: string | undefined;
  amount?: number | string | null;
  unitPrice?: number | string | null;
  fees?: number | string | null;
  [key: string]: unknown;
};

export function buildPortfolioFromTrades(trades: Array<SimpleTrade>): HoldingFifo[] {
  try {
    console.log("[buildPortfolioFromTrades:FIFO] start", { tradesCount: trades?.length ?? 0 });
    const portfolios: Record<string, { symbol: string; openLots: FifoLot[]; realizedPL: number }> = {};

    for (const t of trades ?? []) {
      const symbol = String(t?.symbol ?? "").trim();
      const type = String(t?.type ?? "").toLowerCase();
      const shares = Number(t?.amount ?? 0);
      const price = Number(t?.unitPrice ?? 0);
      const fees = Number(t?.fees ?? 0);

      if (!symbol) continue;
      if (!portfolios[symbol]) {
        portfolios[symbol] = { symbol, openLots: [], realizedPL: 0 };
      }
      const pos = portfolios[symbol];

      if (type.includes("buy")) {
        if (!(shares > 0)) continue;
        const costPerShare = shares > 0 ? (shares * price + fees) / shares : 0;
        pos.openLots.push({ shares, costPerShare });
      } else if (type.includes("sell")) {
        let remainingToSell = Math.max(0, shares);
        while (remainingToSell > 0 && pos.openLots.length > 0) {
          const lot = pos.openLots[0];
          const sellAmount = Math.min(remainingToSell, lot.shares);
          const pl = sellAmount * (price - lot.costPerShare);
          pos.realizedPL += pl;
          lot.shares -= sellAmount;
          remainingToSell -= sellAmount;
          if (lot.shares <= 0) pos.openLots.shift();
        }
      }
    }

    const result: HoldingFifo[] = Object.values(portfolios).map((p) => {
      const totalShares = p.openLots.reduce((sum, lot) => sum + lot.shares, 0);
      const totalCost = p.openLots.reduce((sum, lot) => sum + lot.shares * lot.costPerShare, 0);
      const avgBuyPrice = totalShares > 0 ? totalCost / totalShares : 0;
      return { symbol: p.symbol, openLots: p.openLots, realizedPL: p.realizedPL, shares: totalShares, totalCost, avgBuyPrice };
    });

    result.sort((a, b) => a.symbol.localeCompare(b.symbol));
    console.log("[buildPortfolioFromTrades:FIFO] result sample", result.slice(0, 5));
    return result;
  } catch (e) {
    console.error("[buildPortfolioFromTrades:FIFO] error", e);
    return [];
  }
}
