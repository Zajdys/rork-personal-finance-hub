import type { InvestmentBroker } from '@/lib/investment-portfolios';
import type {
  DisplayCurrency,
  PortfolioCalcResult,
  PortfolioPositionCalc,
  PortfolioSummaryCalc,
} from '@/lib/investment-portfolio-calc';

export type BrokerFilter = 'all' | InvestmentBroker;

export const INVEST_BROKER_TAB_ORDER: InvestmentBroker[] = [
  'etoro',
  'trading212',
  'xtb',
  'anycoin',
  'manual',
];

const EXCHANGE_SUFFIXES = new Set([
  'US',
  'UK',
  'DE',
  'PA',
  'L',
  'AS',
  'BR',
  'MI',
  'SW',
  'ST',
  'HE',
  'CO',
  'OL',
  'IR',
  'LS',
  'MC',
  'SA',
  'TW',
  'T',
  'IL',
]);

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function brokerTabLabel(broker: InvestmentBroker): string {
  switch (broker) {
    case 'etoro':
      return 'eToro';
    case 'trading212':
      return 'Trading212';
    case 'xtb':
      return 'XTB';
    case 'anycoin':
      return 'Anycoin';
    case 'manual':
      return 'Manual';
    default:
      return broker;
  }
}

/** Normalizace tickeru pro sloučení napříč brokery (AAPL.US → AAPL). */
export function normalizeTickerForMerge(ticker: string): string {
  const upper = ticker.trim().toUpperCase();
  const dot = upper.lastIndexOf('.');
  if (dot <= 0) return upper;
  const suffix = upper.slice(dot + 1);
  if (EXCHANGE_SUFFIXES.has(suffix)) return upper.slice(0, dot);
  return upper;
}

/** Slučovací klíč pozice: ISIN má prioritu, jinak normalizovaný ticker. */
export function positionMergeKey(isin: string | null | undefined, ticker: string): string {
  const isinNorm = (isin ?? '').trim().toUpperCase();
  if (isinNorm.length >= 10) return `isin:${isinNorm}`;
  return `ticker:${normalizeTickerForMerge(ticker)}`;
}

function pickDisplayTicker(a: string, b: string): string {
  const na = normalizeTickerForMerge(a);
  const nb = normalizeTickerForMerge(b);
  if (na === nb) {
    if (!a.includes('.') && b.includes('.')) return a;
    if (a.includes('.') && !b.includes('.')) return b;
    return a.length <= b.length ? a : b;
  }
  return a;
}

function emptySummary(displayCurrency: DisplayCurrency): PortfolioSummaryCalc {
  return {
    total_deposits: 0,
    total_withdrawals: 0,
    net_contributed: 0,
    cash_balance: 0,
    market_value_positions: 0,
    total_invested: 0,
    total_current_value: 0,
    total_dividends: 0,
    total_realized_pnl: 0,
    total_unrealized_pnl: 0,
    total_return: 0,
    total_return_pct: null,
    display_currency: displayCurrency,
  };
}

function buildSummaryFromParts(
  summaries: PortfolioSummaryCalc[],
  positions: PortfolioPositionCalc[],
  displayCurrency: DisplayCurrency,
  options?: {
    /** Jen tyto souhrny přispívají do deposits/cash/return základu. */
    depositSummaries?: PortfolioSummaryCalc[];
  },
): PortfolioSummaryCalc {
  if (summaries.length === 0 && (options?.depositSummaries?.length ?? 0) === 0) {
    return emptySummary(displayCurrency);
  }

  const depositSource = options?.depositSummaries ?? summaries;
  const totalDeposits = roundMoney(depositSource.reduce((s, x) => s + x.total_deposits, 0));
  const totalWithdrawals = roundMoney(
    depositSource.reduce((s, x) => s + x.total_withdrawals, 0),
  );
  const netContributed = roundMoney(depositSource.reduce((s, x) => s + x.net_contributed, 0));
  const cashBalance = roundMoney(depositSource.reduce((s, x) => s + x.cash_balance, 0));
  const totalDividends = roundMoney(summaries.reduce((s, x) => s + x.total_dividends, 0));
  const totalRealizedPnl = roundMoney(
    depositSource.reduce((s, x) => s + x.total_realized_pnl, 0),
  );
  const totalInvested = roundMoney(positions.reduce((s, p) => s + p.invested, 0));
  const marketValuePositions = roundMoney(
    positions.reduce((s, p) => (p.current_value != null ? s + p.current_value : s), 0),
  );
  const totalUnrealizedPnl = roundMoney(
    positions.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0),
  );
  const totalCurrentValue = roundMoney(cashBalance + marketValuePositions);
  /**
   * total_deposits v summary je už net (dep − wd).
   * return = NW − netDeposits (= NW + wd − gross).
   */
  const totalReturn = roundMoney(totalCurrentValue - totalDeposits);
  const totalReturnPct =
    totalDeposits > 0 ? roundMoney((totalReturn / totalDeposits) * 100) : null;

  return {
    total_deposits: totalDeposits,
    total_withdrawals: totalWithdrawals,
    net_contributed: netContributed,
    cash_balance: cashBalance,
    market_value_positions: marketValuePositions,
    total_invested: totalInvested,
    total_current_value: totalCurrentValue,
    total_dividends: totalDividends,
    total_realized_pnl: totalRealizedPnl,
    total_unrealized_pnl: totalUnrealizedPnl,
    total_return: totalReturn,
    total_return_pct: totalReturnPct,
    display_currency: displayCurrency,
  };
}

export type TaggedPortfolioResult = {
  result: PortfolioCalcResult;
  hasCompleteData: boolean;
};

/** Sloučí pozice; neúplní brokeři přispívají jen dividendami (ne vklady/cash/pozicemi). */
export function mergeTaggedPortfolioResults(
  tagged: TaggedPortfolioResult[],
  displayCurrency: DisplayCurrency,
): PortfolioCalcResult {
  if (tagged.length === 0) {
    return { positions: [], summary: emptySummary(displayCurrency) };
  }

  const complete = tagged.filter((t) => t.hasCompleteData);
  const incomplete = tagged.filter((t) => !t.hasCompleteData);

  if (complete.length === 0 && incomplete.length > 0) {
    // Jen neúplní — žádné pozice/vklady, jen dividendy.
    const dividends = roundMoney(
      incomplete.reduce((s, t) => s + t.result.summary.total_dividends, 0),
    );
    return {
      positions: [],
      summary: {
        ...emptySummary(displayCurrency),
        total_dividends: dividends,
      },
    };
  }

  const resultsToMerge = complete.map((t) => t.result);
  const mergedMap = new Map<string, PortfolioPositionCalc>();

  for (const result of resultsToMerge) {
    for (const pos of result.positions) {
      if (pos.held_units <= 1e-9) continue;
      const key = positionMergeKey(pos.isin, pos.ticker);
      const existing = mergedMap.get(key);
      if (!existing) {
        mergedMap.set(key, { ...pos, display_currency: displayCurrency });
        continue;
      }

      const heldUnits = roundMoney(existing.held_units + pos.held_units);
      const invested = roundMoney(existing.invested + pos.invested);
      const dividends = roundMoney(existing.dividends + pos.dividends);
      const realizedPnl = roundMoney(existing.realized_pnl + pos.realized_pnl);

      // Sčítej už přepočtené display hodnoty — NE units × jednu cenu
      // (různé brokery / FX by nafoukly current_value).
      const hasAnyValue = existing.current_value != null || pos.current_value != null;
      const currentValue = hasAnyValue
        ? roundMoney((existing.current_value ?? 0) + (pos.current_value ?? 0))
        : null;
      const currentPrice =
        currentValue != null && heldUnits > 0
          ? roundMoney(currentValue / heldUnits)
          : (existing.current_price ?? pos.current_price);

      const unrealizedPnl =
        currentValue != null ? roundMoney(currentValue - invested) : null;
      const unrealizedPnlPct =
        invested > 0 && unrealizedPnl != null
          ? roundMoney((unrealizedPnl / invested) * 100)
          : null;

      mergedMap.set(key, {
        ticker: pickDisplayTicker(existing.ticker, pos.ticker),
        isin: existing.isin ?? pos.isin,
        held_units: heldUnits,
        invested,
        realized_pnl: realizedPnl,
        dividends,
        current_price: currentPrice,
        current_value: currentValue,
        unrealized_pnl: unrealizedPnl,
        unrealized_pnl_pct: unrealizedPnlPct,
        display_currency: displayCurrency,
      });
    }
  }

  const positions = [...mergedMap.values()].sort(
    (a, b) => (b.current_value ?? b.invested) - (a.current_value ?? a.invested),
  );

  const allSummaries = [
    ...complete.map((t) => t.result.summary),
    ...incomplete.map((t) => ({
      ...emptySummary(displayCurrency),
      total_dividends: t.result.summary.total_dividends,
    })),
  ];

  return {
    positions,
    summary: buildSummaryFromParts(allSummaries, positions, displayCurrency, {
      depositSummaries: complete.map((t) => t.result.summary),
    }),
  };
}

/** Sloučí pozice se stejným ISIN/tickerem; souhrn = součet přes portfolia. */
export function mergePortfolioResults(
  results: PortfolioCalcResult[],
  displayCurrency: DisplayCurrency,
): PortfolioCalcResult {
  return mergeTaggedPortfolioResults(
    results.map((result) => ({ result, hasCompleteData: true })),
    displayCurrency,
  );
}

/** Součet souhrnů bez slučování pozic (pohled jednoho brokera). */
export function combinePortfolioResults(
  results: PortfolioCalcResult[],
  displayCurrency: DisplayCurrency,
): PortfolioCalcResult {
  if (results.length === 0) {
    return { positions: [], summary: emptySummary(displayCurrency) };
  }
  if (results.length === 1) return results[0]!;

  const positions = results
    .flatMap((r) => r.positions)
    .sort((a, b) => (b.current_value ?? b.invested) - (a.current_value ?? a.invested));

  return {
    positions,
    summary: buildSummaryFromParts(
      results.map((r) => r.summary),
      positions,
      displayCurrency,
    ),
  };
}

export function applyBrokerFilterToResults(
  results: PortfolioCalcResult[],
  brokerFilter: BrokerFilter,
  displayCurrency: DisplayCurrency,
): PortfolioCalcResult {
  return applyTaggedBrokerFilterToResults(
    results.map((result) => ({ result, hasCompleteData: true })),
    brokerFilter,
    displayCurrency,
  );
}

export function applyTaggedBrokerFilterToResults(
  tagged: TaggedPortfolioResult[],
  brokerFilter: BrokerFilter,
  displayCurrency: DisplayCurrency,
): PortfolioCalcResult {
  if (tagged.length === 0) {
    return { positions: [], summary: emptySummary(displayCurrency) };
  }
  if (brokerFilter === 'all') {
    return mergeTaggedPortfolioResults(tagged, displayCurrency);
  }

  // Jednotlivý broker — sloučíme jeho portfolia; UI rozhodne podle hasCompleteData.
  const combined = combinePortfolioResults(
    tagged.map((t) => t.result),
    displayCurrency,
  );
  const complete = tagged.every((t) => t.hasCompleteData);
  if (complete) return combined;

  // Neúplný broker: žádné matoucí vklady/pozice, jen dividendy.
  return {
    positions: combined.positions.filter((p) => p.held_units > 1e-9),
    summary: {
      ...emptySummary(displayCurrency),
      total_dividends: combined.summary.total_dividends,
      display_currency: displayCurrency,
    },
  };
}

/** Je historie portfolia dostatečná pro vklady/pozice? (aspoň 1 buy). */
export function portfolioHasCompleteData(result: PortfolioCalcResult, hasBuyTx: boolean): boolean {
  return hasBuyTx;
}
