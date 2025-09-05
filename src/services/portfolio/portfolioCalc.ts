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
