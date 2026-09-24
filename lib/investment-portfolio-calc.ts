import type { InvestmentPortfolio, InvestmentPosition } from '@/lib/investment-portfolios';
import {
  convertAmountBetweenCurrencies,
  fetchYahooNativePricesInBatches,
  fetchYahooPricesInBatches,
  getCachedFxRate,
  normalizeTransactionMoney,
  prefetchDisplayFxRates,
  prefetchFxRatesFromQuoteCurrencies,
  toYahooSymbol,
  type YahooNativeQuote,
  YAHOO_PRICE_BATCH_SIZE,
} from '@/lib/yahoo-ticker';
import { resolveLiveQuotesWithHistoryFallback } from '@/lib/portfolio-price-lookup';
import {
  fetchCoingeckoLivePriceCached,
  isCryptoTicker,
  type CoingeckoVsCurrency,
} from '@/lib/coingecko-prices';
import type { MultiPortfolioViewData } from '@/store/investment-portfolio-view-store';

export type DisplayCurrency = 'CZK' | 'EUR' | 'USD';

export type InvestmentTransactionForCalc = {
  type:
    | 'buy'
    | 'sell'
    | 'dividend'
    | 'deposit'
    | 'withdrawal'
    | 'fee'
    | 'promo'
    | 'transfer_out'
    | 'gift';
  ticker: string | null;
  isin: string | null;
  units: number | null;
  amount: number;
  fee?: number;
  original_currency: string;
  date: string;
  /** eToro „Změna realizovaného kapitálu“ — pokud je k dispozici, použije se pro realized P/L. */
  realized_capital_change?: number | null;
  external_id?: string;
};

export type PortfolioPositionCalc = {
  ticker: string;
  isin: string | null;
  held_units: number;
  invested: number;
  realized_pnl: number;
  dividends: number;
  current_price: number | null;
  current_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
  display_currency: DisplayCurrency;
};

export type PortfolioSummaryCalc = {
  /** Gross deposits − withdrawals (UI „Vložené vlastní peníze“). */
  total_deposits: number;
  /** Σ výběrů — patří do cashflow / diagnostiky. */
  total_withdrawals: number;
  /**
   * deposits − withdrawals − fees (diagnostika).
   * total_return % bere total_deposits (net, bez fees).
   */
  net_contributed: number;
  /** Volná hotovost na brokerském účtu (mimo otevřené pozice). */
  cash_balance: number;
  /** Součet tržních hodnot otevřených pozic (bez hotovosti). */
  market_value_positions: number;
  total_invested: number;
  /** Čistá hodnota = cash_balance + market_value_positions. */
  total_current_value: number;
  total_dividends: number;
  total_realized_pnl: number;
  total_unrealized_pnl: number;
  total_return: number;
  total_return_pct: number | null;
  display_currency: DisplayCurrency;
};

export type PortfolioCalcResult = {
  positions: PortfolioPositionCalc[];
  summary: PortfolioSummaryCalc;
};

export const DEFAULT_PRICE_BATCH_SIZE = YAHOO_PRICE_BATCH_SIZE;

export type PortfolioCalcOptions = {
  displayCurrency: DisplayCurrency;
  /**
   * Měna částek v exportu (eToro USD účet: Částka je v USD i když Podrobnosti = Ticker/EUR).
   * Když chybí, použije se original_currency z každé transakce.
   */
  accountCurrency?: DisplayCurrency;
  /** Načíst živé ceny z Yahoo (default true). */
  fetchLivePrices?: boolean;
  /** Počet paralelních Yahoo requestů v jedné dávce. */
  batchSize?: number;
  /** Volá se po každé dávce cen (progresivní UI). */
  onProgress?: (result: PortfolioCalcResult) => void;
};

const HELD_UNITS_EPS = 0.0001;

type TickerState = {
  ticker: string;
  isin: string | null;
  heldUnits: number;
  costBasis: number;
  realizedPnl: number;
  dividends: number;
};

type PortfolioCore = {
  baseCurrency: DisplayCurrency;
  /** Σ deposits (hrubé, bez promo) — pro return absolutní: NW + wd − gross. */
  grossDeposits: number;
  totalWithdrawals: number;
  /** deposits − withdrawals (UI „Vloženo“ / return % jmenovatel). */
  totalDeposits: number;
  /** Σ promo / free-share bonusů (v cash, ne ve Vloženo). */
  totalPromo: number;
  /** deposits − withdrawals − fees (diagnostika). */
  netContributed: number;
  sumBuys: number;
  sumSells: number;
  sumFees: number;
  totalDividendsPortfolio: number;
  cashBalance: number;
  tickerStates: Map<string, TickerState>;
  openStates: TickerState[];
};

export type PortfolioDataLayer = {
  accountCurrency: DisplayCurrency;
  core: PortfolioCore;
  nativePrices: Map<string, YahooNativeQuote | null>;
  /**
   * Tickery bez Yahoo ceny ani 7denního fillu — dnešní snapshot se nesmí uložit.
   * Soft fallback (starší last-known) může být v nativePrices kvůli hlavičce.
   */
  incompleteSnapshotTickers?: string[];
};

export type FxRateLookup = (from: string, to: string) => number | null;

function convertMoneyAmount(
  amount: number,
  from: string,
  to: DisplayCurrency,
  fx: FxRateLookup,
): number | null {
  const f = from.trim().toUpperCase();
  const t = to.trim().toUpperCase();
  if (f === t) return amount;
  const rate = fx(f, t);
  if (rate == null || !(rate > 0)) {
    console.warn(`[invest-calc FX] missing rate ${f}→${t} for amount ${amount}`);
    return null;
  }
  return roundMoney(amount * rate);
}

function convertCoreToDisplay(
  core: PortfolioCore,
  displayCurrency: DisplayCurrency,
  fx: FxRateLookup,
): PortfolioCore {
  const base = core.baseCurrency;
  const cv = (n: number) => {
    const out = convertMoneyAmount(n, base, displayCurrency, fx);
    // Fallback jen když kurz chybí — prefetch by měl běžet dřív; 0 by zničilo vklady.
    return out ?? n;
  };

  const tickerStates = new Map<string, TickerState>();
  for (const [key, state] of core.tickerStates) {
    tickerStates.set(key, {
      ...state,
      costBasis: cv(state.costBasis),
      realizedPnl: cv(state.realizedPnl),
      dividends: cv(state.dividends),
    });
  }

  const openStates = [...tickerStates.values()].filter((s) => s.heldUnits > HELD_UNITS_EPS);

  return {
    baseCurrency: displayCurrency,
    grossDeposits: cv(core.grossDeposits),
    totalWithdrawals: cv(core.totalWithdrawals),
    totalDeposits: cv(core.totalDeposits),
    totalPromo: cv(core.totalPromo),
    netContributed: cv(core.netContributed),
    sumBuys: cv(core.sumBuys),
    sumSells: cv(core.sumSells),
    sumFees: cv(core.sumFees),
    totalDividendsPortfolio: cv(core.totalDividendsPortfolio),
    cashBalance: cv(core.cashBalance),
    tickerStates,
    openStates,
  };
}

function nativePricesToDisplay(
  nativePrices: Map<string, YahooNativeQuote | null>,
  displayCurrency: DisplayCurrency,
  fx: FxRateLookup,
): Map<string, number | null> {
  const priceByTicker = new Map<string, number | null>();
  for (const [ticker, quote] of nativePrices) {
    if (!quote) {
      priceByTicker.set(ticker, null);
      continue;
    }
    // Chybí-li FX, cena = null (ne raw USD jako EUR) — UI počká / neukáže falešný zisk.
    priceByTicker.set(
      ticker,
      convertMoneyAmount(quote.price, quote.currency, displayCurrency, fx),
    );
  }
  return priceByTicker;
}

/** Display layer: přepočet na zvolenou měnu z již načtených dat (bez Yahoo fetch). */
export function buildPortfolioResultForDisplay(
  data: PortfolioDataLayer,
  displayCurrency: DisplayCurrency,
  fx: FxRateLookup = getCachedFxRate,
): PortfolioCalcResult {
  const convertedCore = convertCoreToDisplay(data.core, displayCurrency, fx);
  const priceByTicker = nativePricesToDisplay(data.nativePrices, displayCurrency, fx);
  return buildPortfolioResult(convertedCore, priceByTicker);
}

function tickerKey(ticker: string | null | undefined): string | null {
  const t = (ticker ?? '').trim().toUpperCase();
  return t || null;
}

function sortTransactions(txs: InvestmentTransactionForCalc[]): InvestmentTransactionForCalc[] {
  return [...txs].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return (a.external_id ?? '').localeCompare(b.external_id ?? '');
  });
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

async function buildFxConverter(
  transactions: InvestmentTransactionForCalc[],
  displayCurrency: DisplayCurrency,
): Promise<(amount: number, fromCurrency: string) => Promise<number | null>> {
  const currencies = new Set<string>();
  for (const tx of transactions) {
    const { currency } = normalizeTransactionMoney(tx.amount, tx.original_currency);
    currencies.add(currency);
    if (tx.realized_capital_change != null) {
      currencies.add(normalizeTransactionMoney(tx.realized_capital_change, tx.original_currency).currency);
    }
  }
  currencies.add(displayCurrency);

  const cache = new Map<string, number>();
  cache.set(`${displayCurrency}->${displayCurrency}`, 1);

  await Promise.all(
    [...currencies].map(async (from) => {
      if (from === displayCurrency) return;
      const converted = await convertAmountBetweenCurrencies(1, from, displayCurrency);
      if (converted != null && converted > 0) {
        cache.set(`${from}->${displayCurrency}`, converted);
      }
    }),
  );

  return async (amount: number, fromCurrency: string) => {
    const { amount: major, currency: from } = normalizeTransactionMoney(amount, fromCurrency);
    if (from === displayCurrency) return major;
    const rate = cache.get(`${from}->${displayCurrency}`);
    if (rate == null) {
      return convertAmountBetweenCurrencies(major, from, displayCurrency);
    }
    return Math.round(major * rate * 1e6) / 1e6;
  };
}

async function processTickerStates(
  transactions: InvestmentTransactionForCalc[],
  convert: (amount: number, fromCurrency: string) => Promise<number | null>,
  amountCurrencyFor: (tx: InvestmentTransactionForCalc) => string,
): Promise<Map<string, TickerState>> {
  const states = new Map<string, TickerState>();
  const sorted = sortTransactions(transactions);

  for (const tx of sorted) {
    // Cashflow-only / evidence: neovlivní holdings.
    if (
      tx.type === 'deposit' ||
      tx.type === 'withdrawal' ||
      tx.type === 'fee' ||
      tx.type === 'promo' ||
      tx.type === 'transfer_out'
    ) {
      continue;
    }

    const key = tickerKey(tx.ticker);
    if (!key) continue;

    let state = states.get(key);
    if (!state) {
      state = {
        ticker: key,
        isin: tx.isin ?? null,
        heldUnits: 0,
        costBasis: 0,
        realizedPnl: 0,
        dividends: 0,
      };
      states.set(key, state);
    }
    if (!state.isin && tx.isin) state.isin = tx.isin;

    if (tx.type === 'buy') {
      const units = tx.units ?? 0;
      if (units <= 0) continue;
      const cost = await convert(tx.amount, amountCurrencyFor(tx));
      if (cost == null) continue;
      state.heldUnits += units;
      state.costBasis += cost;
      continue;
    }

    if (tx.type === 'gift') {
      // Příjem/dar: units ↑, costBasis beze změny → NE „Vloženo“, průměrná cena klesá.
      const units = tx.units ?? 0;
      if (units <= 0) continue;
      state.heldUnits += units;
      continue;
    }

    if (tx.type === 'sell') {
      const soldUnits = tx.units ?? 0;
      if (soldUnits <= 0 || state.heldUnits <= 0) continue;

      const unitsToSell = Math.min(soldUnits, state.heldUnits);
      const avgCost = state.costBasis / state.heldUnits;
      const costRemoved = unitsToSell * avgCost;

      if (tx.realized_capital_change != null) {
        const pl = await convert(tx.realized_capital_change, amountCurrencyFor(tx));
        if (pl != null) state.realizedPnl += pl;
      } else {
        const proceeds = await convert(tx.amount, amountCurrencyFor(tx));
        if (proceeds != null) state.realizedPnl += proceeds - costRemoved;
      }

      state.heldUnits -= unitsToSell;
      state.costBasis -= costRemoved;
      if (state.heldUnits <= HELD_UNITS_EPS) {
        state.heldUnits = 0;
        state.costBasis = 0;
      }
      continue;
    }

    if (tx.type === 'dividend') {
      const div = await convert(tx.amount, amountCurrencyFor(tx));
      if (div != null) state.dividends += div;
    }
  }

  return states;
}

export function resolvePortfolioAccountCurrency(
  portfolio: Pick<InvestmentPortfolio, 'broker' | 'currency'>,
): DisplayCurrency {
  if (portfolio.broker === 'etoro') return 'USD';
  if (portfolio.broker === 'anycoin') return 'CZK';
  const code = portfolio.currency?.trim().toUpperCase();
  if (code === 'CZK' || code === 'EUR' || code === 'USD') return code;
  return 'EUR';
}

export async function loadMultiPortfolioDataLayer(
  portfolios: InvestmentPortfolio[],
  transactionsByPortfolioId: Map<string, InvestmentTransactionForCalc[]>,
  positionsByPortfolioId: Map<string, InvestmentPosition[]>,
  options?: {
    fetchLivePrices?: boolean;
    batchSize?: number;
    onProgress?: (data: MultiPortfolioViewData) => void;
  },
): Promise<MultiPortfolioViewData> {
  type LayerEntry = MultiPortfolioViewData['entries'][number];

  const entries: LayerEntry[] = [];
  const transactionLayers: Record<string, PortfolioDataLayer> = {};
  type PositionsDataLayerLocal = {
    accountCurrency: DisplayCurrency;
    positions: InvestmentPosition[];
    nativePrices: Map<string, YahooNativeQuote | null>;
  };
  const positionLayers: Record<string, PositionsDataLayerLocal> = {};

  type CoreHolder = {
    portfolioId: string;
    accountCurrency: DisplayCurrency;
    core: PortfolioCore;
  };
  const cores: CoreHolder[] = [];

  for (const pf of portfolios) {
    const txs = transactionsByPortfolioId.get(pf.id) ?? [];
    const accountCurrency = resolvePortfolioAccountCurrency(pf);

    if (txs.length > 0) {
      const core = await computePortfolioCore(txs, accountCurrency, accountCurrency);
      cores.push({ portfolioId: pf.id, accountCurrency, core });
      transactionLayers[pf.id] = { accountCurrency, core, nativePrices: new Map() };
      entries.push({
        portfolioId: pf.id,
        broker: pf.broker,
        name: pf.name,
        accountCurrency,
        source: 'transactions',
        hasCompleteData: txs.some((tx) => tx.type === 'buy'),
      });
      continue;
    }

    const pfPositions = positionsByPortfolioId.get(pf.id) ?? [];
    if (pfPositions.length > 0) {
      positionLayers[pf.id] = {
        accountCurrency,
        positions: pfPositions,
        nativePrices: new Map(),
      };
      entries.push({
        portfolioId: pf.id,
        broker: pf.broker,
        name: pf.name,
        accountCurrency,
        source: 'positions',
        hasCompleteData: true,
      });
    }
  }

  const priceKey = (ticker: string, isin: string | null) =>
    `${ticker.trim().toUpperCase()}|${(isin ?? '').trim().toUpperCase()}`;
  const uniquePriceItems = new Map<string, { ticker: string; isin: string | null }>();

  for (const { core } of cores) {
    for (const s of core.openStates) {
      uniquePriceItems.set(priceKey(s.ticker, s.isin), { ticker: s.ticker, isin: s.isin });
    }
  }
  for (const layer of Object.values(positionLayers)) {
    for (const p of layer.positions) {
      uniquePriceItems.set(priceKey(p.ticker, null), { ticker: p.ticker, isin: null });
    }
  }

  const fetchLivePrices = options?.fetchLivePrices !== false;
  const globalQuotes = new Map<string, YahooNativeQuote | null>();

  if (fetchLivePrices && uniquePriceItems.size > 0) {
    const stockItems = [...uniquePriceItems.values()].filter((i) => !isCryptoTicker(i.ticker));
    const cryptoItems = [...uniquePriceItems.values()].filter((i) => isCryptoTicker(i.ticker));

    if (stockItems.length > 0) {
      const { quotesByTicker } = await fetchNativePricesInBatches(stockItems, {
        batchSize: options?.batchSize ?? DEFAULT_PRICE_BATCH_SIZE,
        onBatch: (partial) => {
          for (const [k, v] of partial) globalQuotes.set(k, v);
          for (const layer of Object.values(transactionLayers)) {
            for (const s of layer.core.openStates) {
              layer.nativePrices.set(s.ticker, globalQuotes.get(s.ticker) ?? null);
            }
          }
          for (const layer of Object.values(positionLayers)) {
            for (const p of layer.positions) {
              layer.nativePrices.set(p.ticker, globalQuotes.get(p.ticker) ?? null);
            }
          }
          options?.onProgress?.({
            entries,
            transactionLayers,
            positionLayers,
          });
        },
      });
      for (const [k, v] of quotesByTicker) globalQuotes.set(k, v);
    }

    for (const item of cryptoItems) {
      // Prefer account currency of first portfolio holding this ticker; default CZK for BTC.
      let vs: CoingeckoVsCurrency = 'czk';
      for (const { accountCurrency, core } of cores) {
        if (core.openStates.some((s) => s.ticker === item.ticker)) {
          vs = accountCurrency.toLowerCase() as CoingeckoVsCurrency;
          break;
        }
      }
      const px = await fetchCoingeckoLivePriceCached(item.ticker, vs);
      globalQuotes.set(
        item.ticker,
        px != null && px > 0 ? { price: px, currency: vs.toUpperCase() } : null,
      );
    }
  }

  // Sdílený fallback: chybějící LIVE → getPriceForDate (historie, max 7 dní + soft last-known).
  let incompleteByTicker = new Set<string>();
  if (fetchLivePrices && uniquePriceItems.size > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const stockOnly = [...uniquePriceItems.values()].filter((i) => !isCryptoTicker(i.ticker));
    const resolved = await resolveLiveQuotesWithHistoryFallback(
      stockOnly,
      globalQuotes,
      today,
    );
    for (const [k, v] of resolved.quotes) globalQuotes.set(k, v);
    incompleteByTicker = new Set(resolved.incompleteForSnapshot);
    resolved.diagnostics.logSummary('live');
    await prefetchFxRatesFromQuoteCurrencies(
      [...globalQuotes.values()].map((q) => q?.currency).filter((c): c is string => Boolean(c)),
    );
  }

  for (const { core, portfolioId } of cores) {
    const layer = transactionLayers[portfolioId]!;
    const incomplete: string[] = [];
    for (const s of core.openStates) {
      layer.nativePrices.set(s.ticker, globalQuotes.get(s.ticker) ?? null);
      if (incompleteByTicker.has(s.ticker)) incomplete.push(s.ticker);
    }
    layer.incompleteSnapshotTickers = incomplete;
  }
  for (const layer of Object.values(positionLayers)) {
    const incomplete: string[] = [];
    for (const p of layer.positions) {
      layer.nativePrices.set(p.ticker, globalQuotes.get(p.ticker) ?? null);
      if (incompleteByTicker.has(p.ticker)) incomplete.push(p.ticker);
    }
    (layer as { incompleteSnapshotTickers?: string[] }).incompleteSnapshotTickers = incomplete;
  }

  const data: MultiPortfolioViewData = { entries, transactionLayers, positionLayers };
  options?.onProgress?.(data);
  return data;
}

async function computePortfolioCore(
  transactions: InvestmentTransactionForCalc[],
  baseCurrency: DisplayCurrency,
  accountCurrency?: DisplayCurrency,
): Promise<PortfolioCore> {
  const amountCurrency = (currency: string) => accountCurrency ?? currency;

  const convert = await buildFxConverter(
    transactions.map((tx) => ({
      ...tx,
      original_currency: amountCurrency(tx.original_currency),
    })),
    baseCurrency,
  );

  const convertTxAmount = (amount: number, tx: InvestmentTransactionForCalc) =>
    convert(amount, amountCurrency(tx.original_currency));

  let totalDeposits = 0;
  let totalPromo = 0;
  let totalWithdrawals = 0;
  let totalDividendsPortfolio = 0;
  let sumFees = 0;
  let sumBuys = 0;
  let sumSells = 0;

  for (const tx of sortTransactions(transactions)) {
    const amt = await convertTxAmount(Math.abs(tx.amount), tx);
    if (amt == null) continue;

    if (tx.fee != null && tx.fee !== 0 && tx.type !== 'fee') {
      const feeAmt = await convertTxAmount(Math.abs(tx.fee), tx);
      if (feeAmt != null) sumFees += feeAmt;
    }

    switch (tx.type) {
      case 'deposit':
        totalDeposits += amt;
        break;
      case 'promo':
        // Bonus / free shares: cashflow ANO, „Vloženo“ NE.
        totalPromo += amt;
        break;
      case 'transfer_out':
        // Výběr na vlastní wallet — NEmění cash ani Vloženo ani holdings.
        break;
      case 'gift':
        // Dar řeší processTickerStates (units); cash/Vloženo beze změny.
        break;
      case 'withdrawal':
        totalWithdrawals += amt;
        break;
      case 'fee':
        sumFees += amt;
        break;
      case 'dividend':
        totalDividendsPortfolio += amt;
        break;
      case 'buy':
        sumBuys += amt;
        break;
      case 'sell':
        sumSells += amt;
        break;
      default:
        break;
    }
  }

  /** Gross deposits for cash; UI „Vloženo“ = deposits − withdrawals (bez promo). */
  const grossDeposits = roundMoney(totalDeposits);
  const grossWithdrawals = roundMoney(totalWithdrawals);
  const netDeposits = roundMoney(totalDeposits - totalWithdrawals);
  const netContributed = roundMoney(totalDeposits - totalWithdrawals - sumFees);
  const cashBalance = roundMoney(
    totalDeposits +
      totalPromo -
      totalWithdrawals -
      sumFees +
      totalDividendsPortfolio +
      sumSells -
      sumBuys,
  );

  const tickerStates = await processTickerStates(
    transactions,
    convert,
    (tx) => amountCurrency(tx.original_currency),
  );

  const openStates = [...tickerStates.values()].filter((s) => s.heldUnits > HELD_UNITS_EPS);

  return {
    baseCurrency,
    grossDeposits,
    totalWithdrawals: grossWithdrawals,
    totalDeposits: netDeposits,
    totalPromo: roundMoney(totalPromo),
    netContributed,
    sumBuys: roundMoney(sumBuys),
    sumSells: roundMoney(sumSells),
    sumFees: roundMoney(sumFees),
    totalDividendsPortfolio,
    cashBalance,
    tickerStates,
    openStates,
  };
}

export function buildPortfolioResult(
  core: PortfolioCore,
  priceByTicker: Map<string, number | null>,
): PortfolioCalcResult {
  const {
    baseCurrency: displayCurrency,
    grossDeposits,
    totalDeposits,
    totalPromo,
    totalWithdrawals,
    netContributed,
    sumBuys,
    sumSells,
    sumFees,
    totalDividendsPortfolio,
    cashBalance,
    tickerStates,
    openStates,
  } = core;

  const positions: PortfolioPositionCalc[] = openStates
    .map((state) => {
      const invested = roundMoney(state.costBasis);
      let currentPrice = priceByTicker.get(state.ticker) ?? null;
      let currentValue =
        currentPrice != null ? roundMoney(state.heldUnits * currentPrice) : null;

      // Neznámý ticker / výpadek Yahoo → drž pořizovací cenu (ne 0).
      if (currentValue == null && state.heldUnits > HELD_UNITS_EPS && invested > 0) {
        console.warn(`[manual] neznámý ticker ${state.ticker} — fallback na pořizovací cenu`);
        currentPrice = invested / state.heldUnits;
        currentValue = invested;
      }

      const unrealizedPnl =
        currentValue != null ? roundMoney(currentValue - invested) : null;
      const unrealizedPnlPct =
        invested > 0 && unrealizedPnl != null
          ? roundMoney((unrealizedPnl / invested) * 100)
          : null;

      return {
        ticker: state.ticker,
        isin: state.isin,
        held_units: roundMoney(state.heldUnits),
        invested,
        realized_pnl: roundMoney(state.realizedPnl),
        dividends: roundMoney(state.dividends),
        current_price: currentPrice != null ? roundMoney(currentPrice) : null,
        current_value: currentValue,
        unrealized_pnl: unrealizedPnl,
        unrealized_pnl_pct: unrealizedPnlPct,
        display_currency: displayCurrency,
      };
    })
    .sort((a, b) => (b.current_value ?? b.invested) - (a.current_value ?? a.invested));

  const totalInvested = roundMoney(positions.reduce((s, p) => s + p.invested, 0));
  // Nikdy nepočítat chybějící cenu jako 0 — jen známé current_value.
  const marketValuePositions = roundMoney(
    positions.reduce((s, p) => (p.current_value != null ? s + p.current_value : s), 0),
  );
  const netWorth = roundMoney(cashBalance + marketValuePositions);
  const totalRealizedPnl = roundMoney(
    [...tickerStates.values()].reduce((s, st) => s + st.realizedPnl, 0),
  );
  const totalUnrealizedPnl = roundMoney(
    positions.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0),
  );
  const totalDividends = roundMoney(totalDividendsPortfolio);

  /**
   * Investor return (všechny brokery):
   *   total_value_ever = net_worth + Σ withdrawals
   *   total_return = total_value_ever − Σ real deposits (bez promo)
   *                = net_worth − (deposits − withdrawals)  [= NW − netDeposits]
   *   pct = total_return / netDeposits
   * Promo (free shares) zvyšuje NW, ale ne „Vloženo“ → projeví se jako zisk.
   * Realizovaný P/L a dividendy jsou už v cash_balance — nepřipočítávat zvlášť.
   */
  const totalValueEver = roundMoney(netWorth + totalWithdrawals);
  const totalReturn = roundMoney(totalValueEver - grossDeposits);
  const totalReturnPct =
    totalDeposits > 0 ? roundMoney((totalReturn / totalDeposits) * 100) : null;

  console.log('[invest-calc return]', {
    deposits_gross: grossDeposits,
    deposits_net: totalDeposits,
    promo: totalPromo,
    withdrawals: totalWithdrawals,
    buys: sumBuys,
    sells: sumSells,
    dividends: totalDividends,
    fees: sumFees,
    cash_balance: cashBalance,
    current_value: marketValuePositions,
    net_worth: netWorth,
    total_value_ever: totalValueEver,
    total_return: totalReturn,
    pct: totalReturnPct,
    currency: displayCurrency,
  });

  return {
    positions,
    summary: {
      total_deposits: roundMoney(totalDeposits),
      total_withdrawals: roundMoney(totalWithdrawals),
      net_contributed: roundMoney(netContributed),
      cash_balance: cashBalance,
      market_value_positions: marketValuePositions,
      total_invested: totalInvested,
      total_current_value: netWorth,
      total_dividends: totalDividends,
      total_realized_pnl: totalRealizedPnl,
      total_unrealized_pnl: totalUnrealizedPnl,
      total_return: totalReturn,
      total_return_pct: totalReturnPct,
      display_currency: displayCurrency,
    },
  };
}

export async function fetchNativePricesInBatches(
  items: { ticker: string; isin: string | null }[],
  options?: {
    batchSize?: number;
    batchDelayMs?: number;
    onBatch?: (quotes: Map<string, YahooNativeQuote | null>) => void;
  },
): Promise<{ quotesByTicker: Map<string, YahooNativeQuote | null>; hadErrors: boolean }> {
  return fetchYahooNativePricesInBatches(items, options);
}

export async function loadPortfolioDataLayer(
  transactions: InvestmentTransactionForCalc[],
  options: {
    accountCurrency: DisplayCurrency;
    fetchLivePrices?: boolean;
    batchSize?: number;
    onProgress?: (data: PortfolioDataLayer) => void;
  },
): Promise<PortfolioDataLayer> {
  const accountCurrency = options.accountCurrency;
  const core = await computePortfolioCore(transactions, accountCurrency, accountCurrency);

  const priceItems = core.openStates.map((s) => ({ ticker: s.ticker, isin: s.isin }));
  const fetchLivePrices = options.fetchLivePrices !== false;
  const nativePrices = new Map<string, YahooNativeQuote | null>();

  const fxPrefetch = prefetchDisplayFxRates();

  if (!fetchLivePrices || priceItems.length === 0) {
    await fxPrefetch;
    const data: PortfolioDataLayer = { accountCurrency, core, nativePrices };
    options.onProgress?.(data);
    return data;
  }

  let quotesHadErrors = false;
  const stockItems = priceItems.filter((i) => !isCryptoTicker(i.ticker));
  const cryptoItems = priceItems.filter((i) => isCryptoTicker(i.ticker));

  if (stockItems.length > 0) {
    const { quotesByTicker, hadErrors } = await fetchNativePricesInBatches(stockItems, {
      batchSize: options.batchSize ?? DEFAULT_PRICE_BATCH_SIZE,
      onBatch: (partial) => {
        for (const [k, v] of partial) nativePrices.set(k, v);
        options.onProgress?.({ accountCurrency, core, nativePrices: new Map(nativePrices) });
      },
    });
    if (hadErrors) quotesHadErrors = true;
    for (const [k, v] of quotesByTicker) nativePrices.set(k, v);
  }

  const vs = accountCurrency.toLowerCase() as CoingeckoVsCurrency;
  for (const item of cryptoItems) {
    const px = await fetchCoingeckoLivePriceCached(item.ticker, vs);
    nativePrices.set(
      item.ticker,
      px != null && px > 0 ? { price: px, currency: vs.toUpperCase() } : null,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const resolved = await resolveLiveQuotesWithHistoryFallback(
    stockItems,
    nativePrices,
    today,
  );
  for (const [k, v] of resolved.quotes) nativePrices.set(k, v);
  resolved.diagnostics.logSummary('live-single');

  await fxPrefetch;
  await prefetchFxRatesFromQuoteCurrencies(
    [...nativePrices.values()].map((q) => q?.currency).filter((c): c is string => Boolean(c)),
  );

  const data: PortfolioDataLayer = {
    accountCurrency,
    core,
    nativePrices,
    incompleteSnapshotTickers: resolved.incompleteForSnapshot,
  };
  options.onProgress?.(data);
  if (quotesHadErrors) {
    // caller checks missing prices
  }
  return data;
}

export function dividendsByTickerFromResult(
  result: PortfolioCalcResult,
): { ticker: string; amount: number }[] {
  return result.positions
    .filter((p) => p.dividends > 0)
    .map((p) => ({ ticker: p.ticker, amount: p.dividends }))
    .sort((a, b) => b.amount - a.amount);
}

export async function fetchPricesInBatches(
  items: { ticker: string; isin: string | null }[],
  displayCurrency: DisplayCurrency,
  options?: {
    batchSize?: number;
    batchDelayMs?: number;
    onBatch?: (priceByTicker: Map<string, number | null>) => void;
  },
): Promise<{ priceByTicker: Map<string, number | null>; hadErrors: boolean }> {
  return fetchYahooPricesInBatches(items, displayCurrency, options);
}

export async function calculatePortfolioFromTransactions(
  transactions: InvestmentTransactionForCalc[],
  options: PortfolioCalcOptions,
): Promise<PortfolioCalcResult> {
  const displayCurrency = options.displayCurrency;
  const accountCurrency = options.accountCurrency ?? displayCurrency;

  const dataLayer = await loadPortfolioDataLayer(transactions, {
    accountCurrency,
    fetchLivePrices: options.fetchLivePrices,
    batchSize: options.batchSize,
    onProgress: options.onProgress
      ? (data) => {
          options.onProgress?.(buildPortfolioResultForDisplay(data, displayCurrency));
        }
      : undefined,
  });

  const result = buildPortfolioResultForDisplay(dataLayer, displayCurrency);
  const priceByTicker = nativePricesToDisplay(dataLayer.nativePrices, displayCurrency, getCachedFxRate);
  logPositionValueDebug(result.positions, priceByTicker);
  return result;
}

/** Dočasný debug pro ověření ceny vs. jednotek (SMSN.L GDR). */
export function logPositionValueDebug(
  positions: PortfolioPositionCalc[],
  priceByTicker: Map<string, number | null>,
): void {
  for (const p of positions) {
    if (p.ticker !== 'SMSN.L') continue;
    const price = priceByTicker.get(p.ticker) ?? p.current_price;
    const computed = price != null ? p.held_units * price : null;
    console.log('[invest-calc SMSN.L debug]', {
      ticker: p.ticker,
      yahooSymbol: toYahooSymbol(p.ticker, p.isin),
      unitsFromCalc: p.held_units,
      invested: p.invested,
      priceUsed: price,
      computed_value: computed != null ? Math.round(computed * 100) / 100 : null,
      current_value: p.current_value,
    });
  }
}
