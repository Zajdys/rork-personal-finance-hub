import { calcPortfolio as calcCore, type CalcPortfolioResult } from '@/src/services/portfolio/portfolioCalc';
import type { PortfolioRow, CashRow } from '@/src/services/portfolio/allocation';
import { fetchLatestPrices } from '@/src/services/priceService';

export type { PortfolioRow, CashRow, CalcPortfolioResult };

export async function calcPortfolio(trades: Array<Record<string, string | undefined>>): Promise<CalcPortfolioResult> {
  return calcCore(trades);
}

export async function calcPortfolioWithLivePrices(trades: Array<Record<string, string | undefined>>): Promise<CalcPortfolioResult> {
  const base = calcCore(trades);
  try {
    const tickers = base.portfolio.map((p) => p.symbol).filter(Boolean);
    const priceMap = await fetchLatestPrices(tickers);
    const portfolio: PortfolioRow[] = base.portfolio.map((p) => {
      const key = (p.symbol || '').trim().toLowerCase();
      const live = priceMap[key];
      if (!live || !Number.isFinite(live.price)) return p;
      const lastPrice = live.price;
      const positionValue = lastPrice * p.shares;
      return { ...p, lastPrice, positionValue };
    });
    return { portfolio, cash: base.cash };
  } catch (e) {
    console.error('[calcPortfolioWithLivePrices] error', e);
    return base;
  }
}
