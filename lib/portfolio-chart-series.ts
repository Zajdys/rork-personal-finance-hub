/**
 * Série pro graf portfolia: Hodnota vs Zisk (NW − kumulativní netDeposits).
 * Snapshoty a vklady v USD; display měna až na konci.
 */

import type { DisplayCurrency } from '@/lib/investment-portfolio-calc';
import {
  convertUsdToDisplay,
  type PortfolioSnapshotRow,
  type PortfolioValuePoint,
} from '@/lib/portfolio-snapshots';
import { fxRateOnDay } from '@/lib/yahoo-historical';
import { normalizeTransactionMoney } from '@/lib/yahoo-ticker';

export type ChartSeriesMode = 'value' | 'profit';

export type ChartDepositTx = {
  portfolio_id: string;
  date: string;
  type: string;
  amount: number;
  original_currency: string;
};

/**
 * Kumulativní netDeposits (deposit − withdrawal) v USD k danému dni.
 * Promo a transfer_out se nepočítají (stejně jako „Vloženo“).
 */
export function buildCumulativeNetDepositsUsdByPortfolio(
  transactions: ChartDepositTx[],
  fxByCcy: Map<string, Map<string, number>>,
): Map<string, { dates: string[]; cumulatives: number[] }> {
  type Ev = { date: string; deltaUsd: number };
  const byPf = new Map<string, Ev[]>();

  for (const tx of transactions) {
    if (tx.type !== 'deposit' && tx.type !== 'withdrawal') continue;
    const date = tx.date.slice(0, 10);
    if (!date) continue;
    const { amount, currency } = normalizeTransactionMoney(
      Math.abs(tx.amount),
      tx.original_currency || 'USD',
    );
    if (!(amount > 0)) continue;
    const fx = fxRateOnDay(fxByCcy, currency, date);
    if (fx == null || !(fx > 0)) continue;
    const delta = tx.type === 'deposit' ? amount * fx : -(amount * fx);
    const list = byPf.get(tx.portfolio_id) ?? [];
    list.push({ date, deltaUsd: delta });
    byPf.set(tx.portfolio_id, list);
  }

  const out = new Map<string, { dates: string[]; cumulatives: number[] }>();
  for (const [pfId, events] of byPf) {
    events.sort((a, b) => a.date.localeCompare(b.date));
    const dates: string[] = [];
    const cumulatives: number[] = [];
    let run = 0;
    let i = 0;
    while (i < events.length) {
      const d = events[i]!.date;
      while (i < events.length && events[i]!.date === d) {
        run += events[i]!.deltaUsd;
        i += 1;
      }
      dates.push(d);
      cumulatives.push(run);
    }
    out.set(pfId, { dates, cumulatives });
  }
  return out;
}

/** netDeposits k datu D (včetně) — step funkce z event dnů. */
export function cumulativeNetDepositsOnDate(
  series: { dates: string[]; cumulatives: number[] } | undefined,
  date: string,
): number {
  if (!series || series.dates.length === 0) return 0;
  const { dates, cumulatives } = series;
  let lo = 0;
  let hi = dates.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid]! <= date) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best >= 0 ? cumulatives[best]! : 0;
}

/**
 * Zisk(D) = Σ_p (total_value_p(D) − netDeposits_p_do(D)) pro portfolia se snapshotem v D.
 * „Vše“ = součet zisků po portfoliích; jedno portfolio = jedna křivka.
 */
export function aggregateProfitSeries(
  rows: PortfolioSnapshotRow[],
  transactions: ChartDepositTx[],
  displayCurrency: DisplayCurrency,
  fxByCcy: Map<string, Map<string, number>>,
  portfolioIds: string[],
): PortfolioValuePoint[] {
  const netByPf = buildCumulativeNetDepositsUsdByPortfolio(transactions, fxByCcy);
  const idSet = new Set(portfolioIds);

  const valueByPfDate = new Map<string, Map<string, number>>();
  const allDates = new Set<string>();
  for (const row of rows) {
    if (!idSet.has(row.portfolio_id)) continue;
    let m = valueByPfDate.get(row.portfolio_id);
    if (!m) {
      m = new Map();
      valueByPfDate.set(row.portfolio_id, m);
    }
    m.set(row.date, row.total_value_usd);
    allDates.add(row.date);
  }

  return [...allDates]
    .sort((a, b) => a.localeCompare(b))
    .map((date) => {
      let profitUsd = 0;
      for (const pfId of portfolioIds) {
        const v = valueByPfDate.get(pfId)?.get(date);
        if (v == null) continue;
        profitUsd += v - cumulativeNetDepositsOnDate(netByPf.get(pfId), date);
      }
      return {
        date,
        value: convertUsdToDisplay(profitUsd, displayCurrency),
      };
    })
    .filter((p) => Number.isFinite(p.value));
}
