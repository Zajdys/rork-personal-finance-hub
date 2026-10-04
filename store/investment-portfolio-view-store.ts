import { create } from 'zustand';
import type { DisplayCurrency, PortfolioDataLayer } from '@/lib/investment-portfolio-calc';
import type { InvestmentBroker, InvestmentPortfolio, InvestmentPosition } from '@/lib/investment-portfolios';
import type { YahooNativeQuote } from '@/lib/yahoo-ticker';

/** Stejné TTL jako Yahoo price/FX cache. */
export const PORTFOLIO_VIEW_CACHE_TTL_MS = 15 * 60 * 1000;

export type InvestmentPortfolioViewSource = 'transactions' | 'positions';

export type PositionsDataLayer = {
  accountCurrency: DisplayCurrency;
  positions: InvestmentPosition[];
  nativePrices: Map<string, YahooNativeQuote | null>;
};

export type PortfolioLayerEntry = {
  portfolioId: string;
  broker: InvestmentBroker;
  name: string;
  accountCurrency: DisplayCurrency;
  source: InvestmentPortfolioViewSource;
  /** Má aspoň jednu buy transakci a žádné vynechané částky kvůli chybějícímu kurzu. */
  hasCompleteData: boolean;
  /** Vynechané transakce ze součtů kvůli chybějícímu ČNB kurzu. */
  incompleteFx?: { count: number; currencies: string[] };
};

export type MultiPortfolioViewData = {
  entries: PortfolioLayerEntry[];
  transactionLayers: Record<string, PortfolioDataLayer>;
  positionLayers: Record<string, PositionsDataLayer>;
};

export type PortfolioViewData =
  | { kind: 'multi'; data: MultiPortfolioViewData }
  | { kind: 'transactions'; data: PortfolioDataLayer }
  | { kind: 'positions'; data: PositionsDataLayer };

export type PortfolioViewCacheEntry = {
  cacheKey: string;
  fetchedAt: number;
  source: InvestmentPortfolioViewSource;
  viewData: PortfolioViewData;
  hasTransactions: boolean;
  quotesError: string | null;
};

export function buildPortfolioViewCacheKey(params: {
  userId: string;
  portfolioIdsKey: string;
  portfolioMetaKey: string;
  positionsKey: string;
}): string {
  return `multi-v3|${params.userId}|${params.portfolioIdsKey}|${params.portfolioMetaKey}|${params.positionsKey}`;
}

export function isPortfolioViewCacheFresh(
  entry: PortfolioViewCacheEntry,
  ttlMs = PORTFOLIO_VIEW_CACHE_TTL_MS,
): boolean {
  return Date.now() - entry.fetchedAt <= ttlMs;
}

type PortfolioViewStore = {
  entry: PortfolioViewCacheEntry | null;
  refreshNonce: number;
  setEntry: (entry: PortfolioViewCacheEntry) => void;
  /** Bez argumentu smaže celý entry; s cacheKey jen pokud sedí (ne cizí klíč). */
  clearEntry: (cacheKey?: string) => void;
  bumpRefresh: () => number;
  getEntryForKey: (cacheKey: string) => PortfolioViewCacheEntry | null;
};

export const useInvestmentPortfolioViewStore = create<PortfolioViewStore>((set, get) => ({
  entry: null,
  refreshNonce: 0,

  setEntry: (entry) => set({ entry }),

  clearEntry: (cacheKey) => {
    if (cacheKey == null || cacheKey === '') {
      set({ entry: null });
      return;
    }
    const { entry } = get();
    if (entry && entry.cacheKey === cacheKey) set({ entry: null });
  },

  bumpRefresh: () => {
    const next = get().refreshNonce + 1;
    set({ refreshNonce: next });
    return next;
  },

  getEntryForKey: (cacheKey) => {
    const { entry } = get();
    if (!entry || entry.cacheKey !== cacheKey) return null;
    return entry;
  },
}));
