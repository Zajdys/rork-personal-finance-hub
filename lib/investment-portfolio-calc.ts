import type { InvestmentPortfolio, InvestmentPosition } from '@/lib/investment-portfolios';
import {
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
import {
  convertBetweenCurrenciesOnDate,
  ensureExchangeRatesSoft,
  type FxPair,
  type ResolvedFxRate,
} from '@/lib/cnb-exchange-rates';
import { resolveLiveQuotesWithHistoryFallback } from '@/lib/portfolio-price-lookup';
import {
  fetchCoingeckoLivePriceCached,
  isCryptoTicker,
  type CoingeckoVsCurrency,
} from '@/lib/coingecko-prices';
import type { MultiPortfolioViewData } from '@/store/investment-portfolio-view-store';
import { investPerfMark, investPerfSpan } from '@/lib/invest-perf';

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
    | 'gift'
    | 'interest'
    | 'tax';
  ticker: string | null;
  isin: string | null;
  units: number | null;
  amount: number;
  fee?: number;
  /**
   * Pozor eToro: sloupec v exportu = měna burzy / instrumentu (GBX, DKK, HKD, …),
   * NIKOLI měna částky `amount` (ta je vždy měna účtu, typicky USD).
   * Návrh přejmenování (schéma zatím neměnit):
   *   - `instrument_currency` — měna kotace / burzy
   *   - částky vždy v `account_currency` (nebo explicitní `amount_currency`)
   */
  original_currency: string;
  date: string;
  /** eToro „Změna realizovaného kapitálu“ — pokud je k dispozici, použije se pro realized P/L. */
  realized_capital_change?: number | null;
  external_id?: string;
  /**
   * Broker lot / Position ID (XTB / eToro) — náklad po lotu místo průměru přes ticker.
   * Preferuj `lot_id` (DB sloupec); `position_id` je alias (note / legacy).
   */
  lot_id?: string | null;
  /** @deprecated Preferuj lot_id — zůstává kvůli parserům / note tagu. */
  position_id?: string | null;
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
  /** Gross deposits − withdrawals (UI „Vložené vlastní peníze“ když net ≥ 0). */
  total_deposits: number;
  /** Σ vkladů (hrubé, bez promo) — UI „Vloženo“ když net < 0. */
  total_deposits_gross: number;
  /** Σ výběrů — patří do cashflow / diagnostiky; UI „Vybráno“ když net < 0. */
  total_withdrawals: number;
  /**
   * deposits − withdrawals − fees (diagnostika).
   * total_return % bere total_deposits (net, bez fees) jen pokud net > 0.
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
   * Měna účtu portfolia (pro crypto vs currency apod.).
   * Samo o sobě NEvynucuje měnu částek — viz forceAmountCurrency.
   */
  accountCurrency?: DisplayCurrency;
  /**
   * eToro: částky v exportu jsou v měně účtu i když original_currency říká jinak.
   * Revolut/T212: nechat undefined → ber original_currency z každé tx.
   */
  forceAmountCurrency?: DisplayCurrency;
  /** Načíst živé ceny z Yahoo (default true). */
  fetchLivePrices?: boolean;
  /** Počet paralelních Yahoo requestů v jedné dávce. */
  batchSize?: number;
  /** Volá se po každé dávce cen (progresivní UI). */
  onProgress?: (result: PortfolioCalcResult) => void;
};

const HELD_UNITS_EPS = 1e-9;

type LotState = { units: number; costBasis: number };

type TickerState = {
  ticker: string;
  isin: string | null;
  heldUnits: number;
  costBasis: number;
  realizedPnl: number;
  dividends: number;
  /** Per Position ID lots (XTB / eToro). Prázdné → průměr přes ticker. */
  lots: Map<string, LotState>;
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
  /** Transakce vynechané ze součtů kvůli chybějícímu ČNB kurzu. */
  incompleteFxCount: number;
  incompleteFxCurrencies: string[];
};

export type PortfolioDataLayer = {
  accountCurrency: DisplayCurrency;
  core: PortfolioCore;
  nativePrices: Map<string, YahooNativeQuote | null>;
  /** Raw txs — pro přepočet core při změně měny zobrazení. */
  transactions?: InvestmentTransactionForCalc[];
  /**
   * eToro: částky v exportu jsou v měně účtu i když original_currency říká jinak.
   * Revolut/T212: undefined → ber original_currency z každé tx.
   */
  forceAmountCurrency?: DisplayCurrency;
  /**
   * Tickery bez Yahoo ceny ani 7denního fillu — dnešní snapshot se nesmí uložit.
   * Soft fallback (starší last-known) může být v nativePrices kvůli hlavičce.
   */
  incompleteSnapshotTickers?: string[];
};

export type FxRateLookup = (from: string, to: string) => number | null;

type FxSkipStats = { count: number; currencies: Set<string> };

function convertMoneyAmount(
  amount: number,
  from: string,
  to: DisplayCurrency,
  fx: FxRateLookup,
  skips?: FxSkipStats,
): number | null {
  const f = from.trim().toUpperCase();
  const t = to.trim().toUpperCase();
  if (f === t) return amount;
  const rate = fx(f, t);
  if (rate == null || !(rate > 0)) {
    if (__DEV__) console.warn(`[invest-calc FX] missing rate ${f}→${t} for amount ${amount}`);
    if (skips) {
      skips.count += 1;
      skips.currencies.add(f);
    }
    return null;
  }
  return roundMoney(amount * rate);
}

function convertCoreToDisplay(
  core: PortfolioCore,
  displayCurrency: DisplayCurrency,
  fx: FxRateLookup,
  skips?: FxSkipStats,
): PortfolioCore {
  const base = core.baseCurrency;
  const rate = fx(base, displayCurrency);
  // Chybí-li kurz: NIKDY neber native částku jako display měnu — nech core v base.
  if (base !== displayCurrency && (rate == null || !(rate > 0))) {
    if (__DEV__) {
      console.warn(
        `[invest-calc FX] convertCore skipped ${base}→${displayCurrency} (missing rate) — hodnoty zůstanou v ${base}`,
      );
    }
    if (skips) {
      skips.count += 1;
      skips.currencies.add(base);
    }
    return core;
  }

  const cv = (n: number) => {
    const out = convertMoneyAmount(n, base, displayCurrency, fx, skips);
    if (out == null) return n;
    return out;
  };

  const tickerStates = new Map<string, TickerState>();
  for (const [key, state] of core.tickerStates) {
    tickerStates.set(key, {
      ...state,
      costBasis: cv(state.costBasis),
      realizedPnl: cv(state.realizedPnl),
      dividends: cv(state.dividends),
      lots: new Map(), // lots jen při processTickerStates; po FX stačí agregát
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
    incompleteFxCount: core.incompleteFxCount,
    incompleteFxCurrencies: core.incompleteFxCurrencies,
  };
}

function nativePricesToDisplay(
  nativePrices: Map<string, YahooNativeQuote | null>,
  displayCurrency: DisplayCurrency,
  fx: FxRateLookup,
  skips?: FxSkipStats,
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
      convertMoneyAmount(quote.price, quote.currency, displayCurrency, fx, skips),
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
  const skips: FxSkipStats = { count: 0, currencies: new Set() };
  // Core už je v měně zobrazení (historické částky přes ČNB k datu tx) → nepřepočítávej live FX.
  const convertedCore =
    data.core.baseCurrency === displayCurrency
      ? data.core
      : convertCoreToDisplay(data.core, displayCurrency, fx, skips);
  const priceByTicker = nativePricesToDisplay(
    data.nativePrices,
    displayCurrency,
    fx,
    skips,
  );
  // Propaguj display-time FX mezery do vrstvy (banner Neúplná data).
  if (skips.count > 0) {
    data.core = {
      ...data.core,
      incompleteFxCount: data.core.incompleteFxCount + skips.count,
      incompleteFxCurrencies: [
        ...new Set([...data.core.incompleteFxCurrencies, ...skips.currencies]),
      ].sort(),
    };
  }
  return buildPortfolioResult(convertedCore, priceByTicker);
}

/** Přepočítá historický core do displayCurrency (ČNB k datu tx); ceny nechá. */
export async function recomputePortfolioCoreForDisplay(
  data: PortfolioDataLayer,
  displayCurrency: DisplayCurrency,
): Promise<PortfolioDataLayer> {
  if (data.core.baseCurrency === displayCurrency) return data;
  const txs = data.transactions ?? [];
  if (!txs.length) return data;
  const core = await computePortfolioCore(txs, displayCurrency, {
    forceAmountCurrency: data.forceAmountCurrency,
  });
  return { ...data, core };
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

/**
 * Cost / market value otevřených pozic — víc desetin než cash (2).
 * Jinak frakční ETF (0.0009 × 50.06 = 0.045) spadne na 0.05 a % / nákupní cena sedí mimo brokera.
 */
function roundPositionMoney(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Kusy: až 8 desetinných míst (Revolut frakční akcie). */
function roundUnits(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

type HistoricalFxConvert = (
  amount: number,
  fromCurrency: string,
  date: string,
) => number | null;

/** Páry (datum × měna) potřebné pro historický ČNB převod částek do targetCurrency. */
function collectHistoricalFxPairs(
  transactions: InvestmentTransactionForCalc[],
  targetCurrency: DisplayCurrency,
  amountCurrencyFor: (tx: InvestmentTransactionForCalc) => string,
  options?: {
    /**
     * eToro: amount je vždy v měně účtu — original_currency je instrument/listing,
     * neber ji do amount FX párů.
     */
    amountCurrencyForced?: boolean;
  },
): FxPair[] {
  const pairs: FxPair[] = [];
  const target = targetCurrency.trim().toUpperCase();
  const amountForced = options?.amountCurrencyForced === true;

  for (const tx of transactions) {
    const date = String(tx.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const fromForced = normalizeTransactionMoney(0, amountCurrencyFor(tx)).currency;
    const currencies = new Set<string>();
    if (fromForced) currencies.add(fromForced);

    // Bez force: original_currency = měna částky (Revolut/T212).
    // S force (eToro): original_currency = instrument_currency — NEpřevádět amount.
    if (!amountForced) {
      const fromOriginal = normalizeTransactionMoney(0, tx.original_currency).currency;
      if (fromOriginal) currencies.add(fromOriginal);
    }

    for (const from of currencies) {
      if (from && from !== 'CZK' && from !== target) {
        pairs.push({ date, currency: from });
      }
    }
    if (target !== 'CZK' && target) {
      pairs.push({ date, currency: target });
    }
  }
  return pairs;
}

/** Dnešní páry pro měny kotací (GBP/HKD/…) → display. */
function collectQuoteCurrencyPairs(
  currencies: Iterable<string>,
  displayCurrency: DisplayCurrency,
  date = new Date().toISOString().slice(0, 10),
): FxPair[] {
  const pairs: FxPair[] = [];
  const target = displayCurrency.trim().toUpperCase();
  const seen = new Set<string>();
  for (const raw of currencies) {
    const ccy = raw.trim().toUpperCase();
    if (!ccy || ccy === 'CZK' || ccy === 'BTC' || ccy === 'ETH') continue;
    const key = `${date}|${ccy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (ccy !== target) pairs.push({ date, currency: ccy });
  }
  if (target && target !== 'CZK') {
    const key = `${date}|${target}`;
    if (!seen.has(key)) pairs.push({ date, currency: target });
  }
  return pairs;
}

/**
 * Sync převod historických částek přes ČNB k datu.
 * Chybí-li kurz → null (částka se do součtů nepočítá, UI „hodnota nedostupná“).
 * Žádný Yahoo live fallback — HKD/DKK/… jen ČNB; nikdy cizí částka jako CZK/EUR.
 */
function buildHistoricalFxConverterSync(
  targetCurrency: DisplayCurrency,
  rates: Map<string, ResolvedFxRate>,
): HistoricalFxConvert {
  const target = targetCurrency.trim().toUpperCase();

  return (amount: number, fromCurrency: string, date: string) => {
    const { amount: major, currency: from } = normalizeTransactionMoney(amount, fromCurrency);
    if (from === target) return major;

    // Krypto částky se historicky nepřepočítávají ČNB/Yahoo FX.
    if (from === 'BTC' || from === 'ETH' || from === 'USDT' || from === 'USDC') {
      return null;
    }

    const dateKey = String(date ?? '').slice(0, 10);
    const viaCnb = convertBetweenCurrenciesOnDate(major, from, target, dateKey, rates);
    if (viaCnb != null) return viaCnb;

    if (__DEV__) {
      console.warn(
        `[invest-calc FX] missing rate ${from}→${target} @ ${dateKey} — amount skipped (not treated as ${target})`,
      );
    }
    return null;
  };
}

async function buildHistoricalFxConverter(
  transactions: InvestmentTransactionForCalc[],
  targetCurrency: DisplayCurrency,
  amountCurrencyFor: (tx: InvestmentTransactionForCalc) => string,
  prefetchedRates?: Map<string, ResolvedFxRate>,
  cnbDbOnly?: boolean,
  amountCurrencyForced?: boolean,
): Promise<HistoricalFxConvert> {
  const rates =
    prefetchedRates ??
    (await investPerfSpan(
      '3b1_cnb_ensure',
      () =>
        ensureExchangeRatesSoft(
          collectHistoricalFxPairs(transactions, targetCurrency, amountCurrencyFor, {
            amountCurrencyForced,
          }),
          { dbOnly: cnbDbOnly === true },
        ),
      { pairs: 'per-core', dbOnly: cnbDbOnly === true },
    ));
  return buildHistoricalFxConverterSync(targetCurrency, rates);
}

function processTickerStates(
  transactions: InvestmentTransactionForCalc[],
  convert: HistoricalFxConvert,
  amountCurrencyFor: (tx: InvestmentTransactionForCalc) => string,
): {
  states: Map<string, TickerState>;
  skippedFx: number;
  skippedCurrencies: Set<string>;
} {
  const states = new Map<string, TickerState>();
  const skippedCurrencies = new Set<string>();
  let skippedFx = 0;
  const sorted = sortTransactions(transactions);

  for (const tx of sorted) {
    // Cashflow-only / evidence: neovlivní holdings.
    // transfer_out (Anycoin → Trezor) záměrně NEODEČÍTÁ units — viz anycoin-parser.
    if (
      tx.type === 'deposit' ||
      tx.type === 'withdrawal' ||
      tx.type === 'fee' ||
      tx.type === 'promo' ||
      tx.type === 'transfer_out' ||
      tx.type === 'interest' ||
      tx.type === 'tax'
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
        lots: new Map(),
      };
      states.set(key, state);
    }
    if (!state.isin && tx.isin) state.isin = tx.isin;

    // lot_id (DB) má přednost; position_id = parser / note fallback
    const positionId = String(tx.lot_id ?? tx.position_id ?? '').trim();

    if (tx.type === 'buy') {
      const units = tx.units ?? 0;
      if (units <= 0) continue;
      const cost = convert(tx.amount, amountCurrencyFor(tx), tx.date);
      if (cost == null) {
        skippedFx += 1;
        skippedCurrencies.add(amountCurrencyFor(tx));
        continue;
      }
      if (positionId) {
        const lot = state.lots.get(positionId) ?? { units: 0, costBasis: 0 };
        lot.units += units;
        lot.costBasis += cost;
        state.lots.set(positionId, lot);
      }
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

      const lot = positionId ? state.lots.get(positionId) : undefined;
      const lotUnitsAvailable = lot && lot.units > 0 ? lot.units : 0;
      const useLot = lot != null && lotUnitsAvailable > 0;

      const unitsToSell = Math.min(
        soldUnits,
        useLot ? lotUnitsAvailable : state.heldUnits,
        state.heldUnits,
      );
      const basisUnits = useLot ? lot!.units : state.heldUnits;
      const basisCost = useLot ? lot!.costBasis : state.costBasis;
      const avgCost = basisUnits > 0 ? basisCost / basisUnits : 0;
      const costRemoved = unitsToSell * avgCost;

      if (tx.realized_capital_change != null) {
        const pl = convert(tx.realized_capital_change, amountCurrencyFor(tx), tx.date);
        if (pl == null) {
          skippedFx += 1;
          skippedCurrencies.add(amountCurrencyFor(tx));
        } else {
          state.realizedPnl += pl;
        }
      } else {
        const proceeds = convert(tx.amount, amountCurrencyFor(tx), tx.date);
        if (proceeds == null) {
          skippedFx += 1;
          skippedCurrencies.add(amountCurrencyFor(tx));
        } else {
          state.realizedPnl += proceeds - costRemoved;
        }
      }

      // Odečet units vždy (i při chybějícím FX u proceeds) — pozice musí sedět.
      state.heldUnits -= unitsToSell;
      state.costBasis -= costRemoved;
      if (useLot && lot) {
        lot.units -= unitsToSell;
        lot.costBasis -= costRemoved;
        if (lot.units <= HELD_UNITS_EPS) {
          state.lots.delete(positionId);
        } else {
          state.lots.set(positionId, lot);
        }
      }
      if (state.heldUnits <= HELD_UNITS_EPS) {
        state.heldUnits = 0;
        state.costBasis = 0;
        state.lots.clear();
      }
      continue;
    }

    if (tx.type === 'dividend') {
      const div = convert(tx.amount, amountCurrencyFor(tx), tx.date);
      if (div == null) {
        skippedFx += 1;
        skippedCurrencies.add(amountCurrencyFor(tx));
      } else {
        state.dividends += div;
      }
    }
  }

  return { states, skippedFx, skippedCurrencies };
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
    /** Měna zobrazení — historické částky se do ní převádí ČNB k datu tx. */
    displayCurrency?: DisplayCurrency;
    fetchLivePrices?: boolean;
    /** Jen cache cen (první paint) — bez síťových Yahoo requestů. */
    pricesCacheOnly?: boolean;
    /**
     * `db-only` = ČNB jen z DB (první paint); Edge ensure na pozadí.
     * `ensure` = doplň chybějící přes Edge (default).
     */
    cnbMode?: 'db-only' | 'ensure';
    batchSize?: number;
    onProgress?: (data: MultiPortfolioViewData) => void;
  },
): Promise<MultiPortfolioViewData> {
  type LayerEntry = MultiPortfolioViewData['entries'][number];

  const displayCurrency = options?.displayCurrency;
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

  type TxPlan = {
    portfolio: InvestmentPortfolio;
    txs: InvestmentTransactionForCalc[];
    accountCurrency: DisplayCurrency;
    forceAmountCurrency: DisplayCurrency | undefined;
    targetCurrency: DisplayCurrency;
  };
  const txPlans: TxPlan[] = [];

  for (const pf of portfolios) {
    const txs = transactionsByPortfolioId.get(pf.id) ?? [];
    const accountCurrency = resolvePortfolioAccountCurrency(pf);
    const forceAmountCurrency: DisplayCurrency | undefined =
      pf.broker === 'etoro' ? accountCurrency : undefined;
    const targetCurrency = displayCurrency ?? accountCurrency;

    if (txs.length > 0) {
      txPlans.push({ portfolio: pf, txs, accountCurrency, forceAmountCurrency, targetCurrency });
      continue;
    }

    const pfPositions = positionsByPortfolioId.get(pf.id) ?? [];
    if (pfPositions.length > 0) {
      const openPos = pfPositions.filter((p) => (Number(p.units) || 0) > HELD_UNITS_EPS);
      const zeroPos = pfPositions.length - openPos.length;
      investPerfMark(`3b_positions_${pf.broker}`, {
        portfolioId: pf.id.slice(0, 8),
        positions: pfPositions.length,
        openUnits: openPos.length,
        zeroUnits: zeroPos,
      });
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

  // Jednou pro všechna portfolia — dedupe (měna, den) uvnitř ensureExchangeRatesSoft.
  const allFxPairs: FxPair[] = [];
  for (const plan of txPlans) {
    const amountCurrencyFor = (tx: InvestmentTransactionForCalc) =>
      plan.forceAmountCurrency ??
      normalizeTransactionMoney(tx.amount, tx.original_currency).currency;
    allFxPairs.push(
      ...collectHistoricalFxPairs(plan.txs, plan.targetCurrency, amountCurrencyFor, {
        amountCurrencyForced: plan.forceAmountCurrency != null,
      }),
    );
  }
  const cnbDbOnly = options?.cnbMode === 'db-only';
  const sharedRates = await investPerfSpan(
    cnbDbOnly ? '3b1_cnb_db_only' : '3b1_cnb_ensure_all',
    () => ensureExchangeRatesSoft(allFxPairs, { dbOnly: cnbDbOnly }),
    { pairs: allFxPairs.length, portfolios: txPlans.length, dbOnly: cnbDbOnly },
  );

  // Portfolia paralelně (sdílené ČNB rates — žádný ensure uvnitř core).
  const computed = await investPerfSpan(
    '3b_cores_parallel',
    () =>
      Promise.all(
        txPlans.map(async (plan) => {
          const core = await investPerfSpan(
            `3b_core_${plan.portfolio.broker}`,
            () =>
              computePortfolioCore(plan.txs, plan.targetCurrency, {
                forceAmountCurrency: plan.forceAmountCurrency,
                prefetchedRates: sharedRates,
                cnbDbOnly,
                perfLabel: plan.portfolio.broker,
              }),
            {
              portfolioId: plan.portfolio.id.slice(0, 8),
              txCount: plan.txs.length,
              targetCurrency: plan.targetCurrency,
            },
          );
          return { plan, core };
        }),
      ),
    { count: txPlans.length },
  );

  const computedById = new Map(computed.map((c) => [c.plan.portfolio.id, c]));
  // entries v pořadí vstupních portfolií (pozice už jsou v entries — tx doplníme na správné místo).
  const positionEntries = [...entries];
  entries.length = 0;
  for (const pf of portfolios) {
    const hit = computedById.get(pf.id);
    if (hit) {
      const { plan, core } = hit;
      cores.push({ portfolioId: pf.id, accountCurrency: plan.accountCurrency, core });
      transactionLayers[pf.id] = {
        accountCurrency: plan.accountCurrency,
        core,
        nativePrices: new Map(),
        transactions: plan.txs,
        forceAmountCurrency: plan.forceAmountCurrency,
      };
      entries.push({
        portfolioId: pf.id,
        broker: pf.broker,
        name: pf.name,
        accountCurrency: plan.accountCurrency,
        source: 'transactions',
        hasCompleteData:
          plan.txs.some((tx) => tx.type === 'buy') && core.incompleteFxCount === 0,
        incompleteFx:
          core.incompleteFxCount > 0
            ? {
                count: core.incompleteFxCount,
                currencies: core.incompleteFxCurrencies,
              }
            : undefined,
      });
      continue;
    }
    const posEntry = positionEntries.find((e) => e.portfolioId === pf.id);
    if (posEntry) entries.push(posEntry);
  }

  const priceKey = (ticker: string, isin: string | null) =>
    `${ticker.trim().toUpperCase()}|${(isin ?? '').trim().toUpperCase()}`;
  const uniquePriceItems = new Map<string, { ticker: string; isin: string | null }>();

  for (const { core } of cores) {
    for (const s of core.openStates) {
      uniquePriceItems.set(priceKey(s.ticker, s.isin), { ticker: s.ticker, isin: s.isin });
    }
  }
  let positionTickersTotal = 0;
  let positionTickersZeroUnits = 0;
  for (const layer of Object.values(positionLayers)) {
    for (const p of layer.positions) {
      positionTickersTotal += 1;
      const units = Number(p.units) || 0;
      // Stejný práh jako openStates z transakcí — nefetchuj closed/dust.
      if (units <= HELD_UNITS_EPS) {
        positionTickersZeroUnits += 1;
        continue;
      }
      uniquePriceItems.set(priceKey(p.ticker, null), { ticker: p.ticker, isin: null });
    }
  }

  investPerfMark('3c_price_tickers_planned', {
    uniqueTickers: uniquePriceItems.size,
    fromOpenStates: cores.reduce((n, c) => n + c.core.openStates.length, 0),
    fromPositionsRows: positionTickersTotal,
    fromPositionsZeroUnits: positionTickersZeroUnits,
    batchSize: options?.batchSize ?? DEFAULT_PRICE_BATCH_SIZE,
  });

  const fetchLivePrices = options?.fetchLivePrices !== false;
  const globalQuotes = new Map<string, YahooNativeQuote | null>();

  if (fetchLivePrices && uniquePriceItems.size > 0) {
    const stockItems = [...uniquePriceItems.values()].filter((i) => !isCryptoTicker(i.ticker));
    const cryptoItems = [...uniquePriceItems.values()].filter((i) => isCryptoTicker(i.ticker));
    const pricesCacheOnly = options?.pricesCacheOnly === true;

    if (stockItems.length > 0) {
      const batchSize = options?.batchSize ?? DEFAULT_PRICE_BATCH_SIZE;
      const { quotesByTicker } = await investPerfSpan(
        pricesCacheOnly ? '3d_yahoo_cache_only' : '3d_yahoo_live_batches',
        () =>
          fetchNativePricesInBatches(stockItems, {
            batchSize,
            cacheOnly: pricesCacheOnly,
            // Cache-only: žádná síť → žádná pauza mezi dávkami.
            batchDelayMs: pricesCacheOnly ? 0 : undefined,
          }),
        {
          tickers: stockItems.length,
          batchSize,
          parallelWithinBatch: true,
          delayBetweenBatchesMs: pricesCacheOnly ? 0 : 100,
          estimatedBatches: Math.ceil(stockItems.length / batchSize),
          cacheOnly: pricesCacheOnly,
        },
      );
      for (const [k, v] of quotesByTicker) globalQuotes.set(k, v);
    }

    if (cryptoItems.length > 0 && !pricesCacheOnly) {
      await investPerfSpan(
        '3e_crypto_live_sequential',
        async () => {
          for (const item of cryptoItems) {
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
        },
        { tickers: cryptoItems.length },
      );
    }
  }

  // Sdílený fallback: chybějící LIVE → getPriceForDate (historie, max 7 dní + soft last-known).
  let incompleteByTicker = new Set<string>();
  if (fetchLivePrices && uniquePriceItems.size > 0 && options?.pricesCacheOnly !== true) {
    const today = new Date().toISOString().slice(0, 10);
    const stockOnly = [...uniquePriceItems.values()].filter((i) => !isCryptoTicker(i.ticker));
    const missingBefore = stockOnly.filter((i) => !globalQuotes.get(i.ticker)).length;
    const resolved = await investPerfSpan(
      '3f_history_price_fallback',
      () => resolveLiveQuotesWithHistoryFallback(stockOnly, globalQuotes, today),
      { stockTickers: stockOnly.length, missingBefore },
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
      if ((Number(p.units) || 0) <= HELD_UNITS_EPS) continue;
      layer.nativePrices.set(p.ticker, globalQuotes.get(p.ticker) ?? null);
      if (incompleteByTicker.has(p.ticker)) incomplete.push(p.ticker);
    }
    (layer as { incompleteSnapshotTickers?: string[] }).incompleteSnapshotTickers = incomplete;
  }

  // Aktuální hodnota: Yahoo live FX (GBPEUR=X, …), pak ČNB (HKD bez Yahoo páru).
  // GBX/GBp už je v native quote jako GBP (/100 v normalizeYahooPrice).
  const quoteCurrencies = new Set<string>();
  for (const q of globalQuotes.values()) {
    if (!q?.currency) continue;
    const ccy = q.currency.trim().toUpperCase();
    quoteCurrencies.add(ccy === 'GBX' || ccy === 'GBP' ? 'GBP' : ccy);
  }
  const targetDisplay = (displayCurrency ?? 'CZK') as DisplayCurrency;
  quoteCurrencies.add(targetDisplay);
  quoteCurrencies.add('USD');

  const quoteList = [...quoteCurrencies];
  if (quoteList.length > 0) {
    // 1) Yahoo live FX nejdřív (i ve fázi cache-only cen — FX je levný a nutný).
    await investPerfSpan(
      '3g_yahoo_live_quote_fx',
      () =>
        prefetchFxRatesFromQuoteCurrencies(quoteList, [
          targetDisplay,
          'USD',
          'EUR',
          'CZK',
        ]),
      { currencies: quoteList.join(',') },
    );

    // 2) Co Yahoo neumí (HKD→CZK 404) → ČNB.
    const stillMissing = quoteList.filter(
      (c) => c !== targetDisplay && getCachedFxRate(c, targetDisplay) == null,
    );
    if (stillMissing.length > 0) {
      const quotePairs = collectQuoteCurrencyPairs(stillMissing, targetDisplay);
      await investPerfSpan(
        cnbDbOnly ? '3g_cnb_quote_fx_db' : '3g_cnb_quote_fx_ensure',
        () => ensureExchangeRatesSoft(quotePairs, { dbOnly: cnbDbOnly }),
        {
          pairs: quotePairs.length,
          currencies: stillMissing.join(','),
        },
      );
    }
  }

  // Diagnostika eToro: USD hodnota před/po FX pro cizí kotace.
  for (const entry of entries) {
    if (entry.broker !== 'etoro') continue;
    const layer = transactionLayers[entry.portfolioId];
    if (!layer) continue;
    logEtoroForeignQuoteDiag(layer, getCachedFxRate);
  }

  // Display-time FX mezery → incompleteFx (banner) + „hodnota nedostupná“.
  for (const entry of entries) {
    const layer =
      entry.source === 'transactions'
        ? transactionLayers[entry.portfolioId]
        : null;
    const posLayer =
      entry.source === 'positions' ? positionLayers[entry.portfolioId] : null;
    const nativePrices = layer?.nativePrices ?? posLayer?.nativePrices;
    if (!nativePrices) continue;

    const skips: FxSkipStats = { count: 0, currencies: new Set() };
    nativePricesToDisplay(nativePrices, targetDisplay, getCachedFxRate, skips);
    if (layer && layer.core.baseCurrency !== targetDisplay) {
      const rate = getCachedFxRate(layer.core.baseCurrency, targetDisplay);
      if (rate == null || !(rate > 0)) {
        skips.count += 1;
        skips.currencies.add(layer.core.baseCurrency);
      }
    }

    if (skips.count === 0) continue;

    if (layer) {
      layer.core = {
        ...layer.core,
        incompleteFxCount: layer.core.incompleteFxCount + skips.count,
        incompleteFxCurrencies: [
          ...new Set([...layer.core.incompleteFxCurrencies, ...skips.currencies]),
        ].sort(),
      };
    }
    entry.incompleteFx = {
      count: (entry.incompleteFx?.count ?? 0) + skips.count,
      currencies: [
        ...new Set([...(entry.incompleteFx?.currencies ?? []), ...skips.currencies]),
      ].sort(),
    };
    entry.hasCompleteData = false;
  }

  const data: MultiPortfolioViewData = { entries, transactionLayers, positionLayers };
  options?.onProgress?.(data);
  return data;
}

/** Log: eToro pozice v cizí kotaci — hodnota USD před opravou (0) vs po FX. */
function logEtoroForeignQuoteDiag(
  layer: PortfolioDataLayer,
  fx: FxRateLookup,
): void {
  const FOREIGN = new Set(['GBP', 'GBX', 'DKK', 'SEK', 'NOK', 'HKD', 'JPY', 'EUR']);
  type Row = {
    ticker: string;
    units: number;
    price: number;
    ccy: string;
    valueUsd: number | null;
  };
  const affected: Row[] = [];
  let usdQuoted = 0;
  let foreignAfter = 0;
  let foreignBefore = 0; // před opravou = cizí kotace bez FX → 0 do součtu

  for (const s of layer.core.openStates) {
    const quote = layer.nativePrices.get(s.ticker);
    if (!quote || !(quote.price > 0)) continue;
    const ccy = quote.currency.trim().toUpperCase();
    const units = s.heldUnits;
    const nativeValue = units * quote.price;

    if (ccy === 'USD') {
      usdQuoted += nativeValue;
      continue;
    }
    if (!FOREIGN.has(ccy) && ccy !== layer.core.baseCurrency) {
      // jiné kotace taky přes FX
    }

    const toUsd = fx(ccy, 'USD');
    const valueUsd =
      ccy === 'USD'
        ? nativeValue
        : toUsd != null && toUsd > 0
          ? nativeValue * toUsd
          : null;

    if (ccy !== 'USD') {
      foreignBefore += 0; // dřív missing rate → vynecháno
      if (valueUsd != null) foreignAfter += valueUsd;
      affected.push({
        ticker: s.ticker,
        units: roundUnits(units),
        price: roundMoney(quote.price),
        ccy,
        valueUsd: valueUsd != null ? roundMoney(valueUsd) : null,
      });
    }
  }

  const beforeUsd = roundMoney(usdQuoted + foreignBefore);
  const afterUsd = roundMoney(usdQuoted + foreignAfter);
  if (!__DEV__) return;
  console.log('[invest-fx-diag] eToro portfolio USD (open positions)', {
    beforeUsd,
    afterUsd,
    usdQuotedOnly: roundMoney(usdQuoted),
    foreignQuotedAfter: roundMoney(foreignAfter),
    affectedCount: affected.length,
  });
  if (affected.length > 0) {
    console.log(
      '[invest-fx-diag] eToro foreign-quote positions (ticker, units, price, ccy, valueUsd):',
    );
    for (const r of affected) {
      console.log(
        `  ${r.ticker}\t${r.units}\t${r.price}\t${r.ccy}\t${r.valueUsd ?? 'n/a'}`,
      );
    }
  }
}

export async function computePortfolioCore(
  transactions: InvestmentTransactionForCalc[],
  targetCurrency: DisplayCurrency,
  options?: {
    forceAmountCurrency?: DisplayCurrency;
    /** Sdílené ČNB kurzy z loadMultiPortfolioDataLayer — bez vnitřního ensure. */
    prefetchedRates?: Map<string, ResolvedFxRate>;
    cnbDbOnly?: boolean;
    /** Pro [invest-perf] diagnostiku (např. anycoin). */
    perfLabel?: string;
    /**
     * Selftest / sync: vlastní převodník (např. identity když vše EUR).
     * Přeskočí ČNB ensure.
     */
    convertOverride?: HistoricalFxConvert;
  },
): Promise<PortfolioCore> {
  const forceCcy = options?.forceAmountCurrency;
  // eToro: NIKDY neber original_currency (instrument) jako měnu částky — jen force / account.
  const amountCurrencyFor = (tx: InvestmentTransactionForCalc) => {
    if (forceCcy) return forceCcy;
    return normalizeTransactionMoney(tx.amount, tx.original_currency).currency;
  };

  const t0 = globalThis.performance?.now?.() ?? Date.now();
  const convert =
    options?.convertOverride ??
    (await buildHistoricalFxConverter(
      transactions,
      targetCurrency,
      amountCurrencyFor,
      options?.prefetchedRates,
      options?.cnbDbOnly,
      forceCcy != null,
    ));
  const tFx = globalThis.performance?.now?.() ?? Date.now();

  const convertTxAmount = (amount: number, tx: InvestmentTransactionForCalc) =>
    convert(amount, amountCurrencyFor(tx), tx.date);

  let totalDeposits = 0;
  let totalPromo = 0;
  let totalWithdrawals = 0;
  let totalDividendsPortfolio = 0;
  let totalInterest = 0;
  let sumFees = 0;
  let sumBuys = 0;
  let sumSells = 0;
  let skippedFx = 0;
  const skippedCurrencies = new Set<string>();

  const sorted = sortTransactions(transactions);
  for (const tx of sorted) {
    // Jen cash loop: transfer_out/gift neovlivní cash totals.
    // Holdings řeší processTickerStates — transfer_out tam units NEodečítá (Anycoin Trezor).
    if (tx.type === 'transfer_out' || tx.type === 'gift') continue;

    const amt = convertTxAmount(Math.abs(tx.amount), tx);
    if (amt == null) {
      // buy/sell/dividend počítá processTickerStates — ať N = počet transakcí, ne 2×.
      if (
        tx.type === 'deposit' ||
        tx.type === 'withdrawal' ||
        tx.type === 'fee' ||
        tx.type === 'promo' ||
        tx.type === 'interest' ||
        tx.type === 'tax'
      ) {
        skippedFx += 1;
        skippedCurrencies.add(amountCurrencyFor(tx));
      }
      continue;
    }

    if (tx.fee != null && tx.fee !== 0 && tx.type !== 'fee') {
      const feeAmt = convertTxAmount(Math.abs(tx.fee), tx);
      if (feeAmt != null) sumFees += feeAmt;
      else {
        skippedFx += 1;
        skippedCurrencies.add(amountCurrencyFor(tx));
      }
    }

    switch (tx.type) {
      case 'deposit':
        totalDeposits += amt;
        break;
      case 'promo':
        totalPromo += amt;
        break;
      case 'withdrawal':
        totalWithdrawals += amt;
        break;
      case 'fee':
      case 'tax':
        sumFees += amt;
        break;
      case 'interest':
        totalInterest += amt;
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
  const tCash = globalThis.performance?.now?.() ?? Date.now();

  /** Gross deposits for cash; UI „Vloženo“ = deposits − withdrawals (bez promo). */
  const grossDeposits = roundMoney(totalDeposits);
  const grossWithdrawals = roundMoney(totalWithdrawals);
  const netDeposits = roundMoney(totalDeposits - totalWithdrawals);
  const netContributed = roundMoney(totalDeposits - totalWithdrawals - sumFees);
  const cashBalance = roundMoney(
    totalDeposits +
      totalPromo +
      totalInterest -
      totalWithdrawals -
      sumFees +
      totalDividendsPortfolio +
      sumSells -
      sumBuys,
  );

  const tickerResult = processTickerStates(transactions, convert, amountCurrencyFor);
  const tickerStates = tickerResult.states;
  skippedFx += tickerResult.skippedFx;
  for (const c of tickerResult.skippedCurrencies) skippedCurrencies.add(c);
  const tTickers = globalThis.performance?.now?.() ?? Date.now();

  const openStates = [...tickerStates.values()].filter((s) => s.heldUnits > HELD_UNITS_EPS);
  const btcHeld = openStates.find((s) => s.ticker === 'BTC')?.heldUnits ?? 0;

  if (options?.perfLabel) {
    if (__DEV__) {
      console.log(`[invest-perf] core_detail_${options.perfLabel}`, {
        txs: transactions.length,
        skippedFx,
        skippedCurrencies: [...skippedCurrencies],
        openTickers: openStates.length,
        btcHeld,
        fxMs: Math.round((tFx - t0) * 10) / 10,
        cashLoopMs: Math.round((tCash - tFx) * 10) / 10,
        tickerLoopMs: Math.round((tTickers - tCash) * 10) / 10,
        totalMs: Math.round((tTickers - t0) * 10) / 10,
      });
    }
  }

  return {
    baseCurrency: targetCurrency,
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
    incompleteFxCount: skippedFx,
    incompleteFxCurrencies: [...skippedCurrencies].sort(),
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
      const invested = roundPositionMoney(state.costBasis);
      const currentPrice = priceByTicker.get(state.ticker) ?? null;
      const currentValue =
        currentPrice != null ? roundPositionMoney(state.heldUnits * currentPrice) : null;

      // Bez ceny → null (UI „cena nedostupná“), ne fallback na cost (= falešné +0 %).
      const unrealizedPnl =
        currentValue != null ? roundPositionMoney(currentValue - invested) : null;
      const unrealizedPnlPct =
        invested > 0 && unrealizedPnl != null
          ? roundMoney((unrealizedPnl / invested) * 100)
          : null;

      return {
        ticker: state.ticker,
        isin: state.isin,
        held_units: roundUnits(state.heldUnits),
        invested,
        realized_pnl: roundMoney(state.realizedPnl),
        dividends: roundMoney(state.dividends),
        current_price: currentPrice != null ? roundPositionMoney(currentPrice) : null,
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

  if (__DEV__) {
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
  }

  return {
    positions,
    summary: {
      total_deposits: roundMoney(totalDeposits),
      total_deposits_gross: roundMoney(grossDeposits),
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
    cacheOnly?: boolean;
    onBatch?: (quotes: Map<string, YahooNativeQuote | null>) => void;
  },
): Promise<{ quotesByTicker: Map<string, YahooNativeQuote | null>; hadErrors: boolean }> {
  return fetchYahooNativePricesInBatches(items, options);
}

export async function loadPortfolioDataLayer(
  transactions: InvestmentTransactionForCalc[],
  options: {
    accountCurrency: DisplayCurrency;
    /** Měna zobrazení (default = accountCurrency). Historické částky → ČNB k datu. */
    displayCurrency?: DisplayCurrency;
    /** eToro: vynutit měnu částek = accountCurrency. */
    forceAmountCurrency?: DisplayCurrency;
    fetchLivePrices?: boolean;
    batchSize?: number;
    onProgress?: (data: PortfolioDataLayer) => void;
  },
): Promise<PortfolioDataLayer> {
  const accountCurrency = options.accountCurrency;
  const targetCurrency = options.displayCurrency ?? accountCurrency;
  const forceAmountCurrency = options.forceAmountCurrency;
  const core = await computePortfolioCore(transactions, targetCurrency, { forceAmountCurrency });

  const priceItems = core.openStates.map((s) => ({ ticker: s.ticker, isin: s.isin }));
  const fetchLivePrices = options.fetchLivePrices !== false;
  const nativePrices = new Map<string, YahooNativeQuote | null>();

  const fxPrefetch = prefetchDisplayFxRates();

  if (!fetchLivePrices || priceItems.length === 0) {
    await fxPrefetch;
    const data: PortfolioDataLayer = {
      accountCurrency,
      core,
      nativePrices,
      transactions,
      forceAmountCurrency,
    };
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
        options.onProgress?.({
          accountCurrency,
          core,
          nativePrices: new Map(nativePrices),
          transactions,
          forceAmountCurrency,
        });
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
    transactions,
    forceAmountCurrency,
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
  const forceAmountCurrency = options.forceAmountCurrency;

  const dataLayer = await loadPortfolioDataLayer(transactions, {
    accountCurrency,
    displayCurrency,
    forceAmountCurrency,
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
    if (__DEV__) {
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
}
