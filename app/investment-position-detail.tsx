/**
 * Detail pozice: hlavička z existujícího cost basis (invested / held_units)
 * + historie transakcí (filtr ticker/ISIN, bez auto-depositů).
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import { StackHeaderBackButton } from '@/components/BackButton';
import { EmptyState } from '@/components/EmptyState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { useAuth } from '@/store/auth-store';
import { useInvestmentStore } from '@/store/investment-store';
import { CURRENCIES, useSettingsStore, type Currency } from '@/store/settings-store';
import { appLocale } from '@/lib/app-locale';
import {
  AUTO_PAIRED_DEPOSIT_NOTE,
  fetchInvestmentTransactionsRemote,
  type InvestmentTransactionRow,
} from '@/lib/investment-transactions';
import {
  brokerTabLabel,
  positionMergeKey,
} from '@/lib/investment-portfolio-display';
import type { DisplayCurrency } from '@/lib/investment-portfolio-calc';
import type { InvestmentBroker } from '@/lib/investment-portfolios';

const GREEN = '#10B981';
const RED = '#EF4444';
const DISPLAY_CURRENCIES: DisplayCurrency[] = ['CZK', 'EUR', 'USD'];

const POSITION_TX_TYPES = new Set<InvestmentTransactionRow['type']>([
  'buy',
  'sell',
  'dividend',
  'gift',
  'transfer_out',
]);

function formatMoney(
  value: number | null | undefined,
  currency: DisplayCurrency,
  locale: string,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const info = CURRENCIES[currency as Currency];
  return `${value.toLocaleString(locale, { maximumFractionDigits: 2 })} ${info?.symbol ?? currency}`;
}

function formatQty(units: number | null | undefined, locale: string): string {
  if (units == null || !Number.isFinite(units)) return '—';
  if (!Number.isInteger(units)) {
    return units.toLocaleString(locale, { maximumFractionDigits: 8 });
  }
  return String(units);
}

function parseOptionalNumber(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function isAutoPairedDeposit(tx: InvestmentTransactionRow): boolean {
  const note = (tx.note ?? '').trim();
  return note.startsWith('[auto-deposit]') || note === AUTO_PAIRED_DEPOSIT_NOTE;
}

function txMatchesPosition(
  tx: InvestmentTransactionRow,
  ticker: string,
  isin: string | null,
): boolean {
  if (!POSITION_TX_TYPES.has(tx.type)) return false;
  if (isAutoPairedDeposit(tx)) return false;
  if (tx.type === 'deposit' || tx.type === 'withdrawal' || tx.type === 'fee' || tx.type === 'promo') {
    return false;
  }
  const txTicker = (tx.ticker ?? '').trim();
  if (!txTicker && !(tx.isin ?? '').trim()) return false;
  return positionMergeKey(tx.isin, txTicker || ticker) === positionMergeKey(isin, ticker);
}

function pricePerUnitForDisplay(tx: InvestmentTransactionRow): number | null {
  if (tx.price_per_unit != null && Number.isFinite(tx.price_per_unit) && tx.price_per_unit > 0) {
    return tx.price_per_unit;
  }
  if (tx.units != null && Math.abs(tx.units) > 1e-12 && Number.isFinite(tx.amount)) {
    return Math.abs(tx.amount / tx.units);
  }
  return null;
}

export default function InvestmentPositionDetailScreen() {
  const params = useLocalSearchParams<{
    ticker?: string;
    portfolioId?: string;
    isin?: string;
    heldUnits?: string;
    invested?: string;
    currentPrice?: string;
    currentValue?: string;
    unrealizedPnl?: string;
    unrealizedPnlPct?: string;
    currency?: string;
  }>();

  const ticker = (Array.isArray(params.ticker) ? params.ticker[0] : params.ticker)?.trim() ?? '';
  const portfolioIdRaw = Array.isArray(params.portfolioId)
    ? params.portfolioId[0]
    : params.portfolioId;
  /** Jedno id, nebo CSV idček (záložka brokera s více portfolii). Prázdné = Vše. */
  const portfolioIdsKey = (portfolioIdRaw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .sort()
    .join(',');
  const portfolioIds = useMemo(
    () => (portfolioIdsKey ? portfolioIdsKey.split(',') : []),
    [portfolioIdsKey],
  );
  const isinRaw = Array.isArray(params.isin) ? params.isin[0] : params.isin;
  const isin = isinRaw?.trim() || null;

  const heldUnits = parseOptionalNumber(
    Array.isArray(params.heldUnits) ? params.heldUnits[0] : params.heldUnits,
  );
  const invested = parseOptionalNumber(
    Array.isArray(params.invested) ? params.invested[0] : params.invested,
  );
  const currentPrice = parseOptionalNumber(
    Array.isArray(params.currentPrice) ? params.currentPrice[0] : params.currentPrice,
  );
  const currentValue = parseOptionalNumber(
    Array.isArray(params.currentValue) ? params.currentValue[0] : params.currentValue,
  );
  const unrealizedPnl = parseOptionalNumber(
    Array.isArray(params.unrealizedPnl) ? params.unrealizedPnl[0] : params.unrealizedPnl,
  );
  const unrealizedPnlPct = parseOptionalNumber(
    Array.isArray(params.unrealizedPnlPct) ? params.unrealizedPnlPct[0] : params.unrealizedPnlPct,
  );

  const { colors, isDark } = useTheme();
  const { t, language } = useLanguageStore();
  const { user } = useAuth();
  const numberLocale = appLocale(language);
  const { investmentCurrency } = useSettingsStore();
  const portfolios = useInvestmentStore((s) => s.portfolios);
  const fetchPortfolios = useInvestmentStore((s) => s.fetchPortfolios);

  const displayCurrency = (
    DISPLAY_CURRENCIES.includes(
      (Array.isArray(params.currency) ? params.currency[0] : params.currency) as DisplayCurrency,
    )
      ? ((Array.isArray(params.currency) ? params.currency[0] : params.currency) as DisplayCurrency)
      : DISPLAY_CURRENCIES.includes(investmentCurrency as DisplayCurrency)
        ? (investmentCurrency as DisplayCurrency)
        : 'EUR'
  ) as DisplayCurrency;

  const showBroker = portfolioIds.length === 0;

  /** Průměrná nákupní = cost basis / ks z přehledu (ne vlastní průměr z tx). */
  const avgBuyPrice =
    heldUnits != null && heldUnits > 1e-12 && invested != null
      ? invested / heldUnits
      : null;

  const [txs, setTxs] = useState<InvestmentTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const portfolioById = useMemo(() => {
    const map = new Map<string, { broker: InvestmentBroker; name: string }>();
    for (const p of portfolios) {
      map.set(p.id, { broker: p.broker, name: p.name });
    }
    return map;
  }, [portfolios]);

  const loadTxs = useCallback(async () => {
    if (!ticker) {
      setTxs([]);
      setLoading(false);
      return;
    }
    setLoadError(null);
    try {
      if (user?.id && portfolios.length === 0) {
        await fetchPortfolios(user.id);
      }
      const ids = portfolioIds.length > 0 ? portfolioIds : portfolios.map((p) => p.id);
      const { transactions, error } = await fetchInvestmentTransactionsRemote(
        ids.length > 0 ? ids : undefined,
      );
      if (error) {
        setLoadError(error.message);
        setTxs([]);
        return;
      }
      const filtered = transactions
        .filter((tx) => txMatchesPosition(tx, ticker, isin))
        .sort((a, b) => {
          const d = b.date.localeCompare(a.date);
          if (d !== 0) return d;
          return b.id.localeCompare(a.id);
        });
      setTxs(filtered);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ticker, isin, portfolioIds, portfolios, user?.id, fetchPortfolios]);

  const { refresh: refreshPosition } = useFocusRefresh(
    useCallback(async () => {
      setLoading(true);
      await loadTxs();
    }, [loadTxs]),
    { focusKey: `${ticker ?? ''}|${isin ?? ''}|${portfolioIds.join(',')}` },
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refreshPosition({ force: true });
  }, [refreshPosition]);

  const typeLabel = (type: InvestmentTransactionRow['type']): string => {
    switch (type) {
      case 'buy':
        return t('investPositionTxBuy');
      case 'sell':
        return t('investPositionTxSell');
      case 'dividend':
        return t('investPositionTxDividend');
      case 'gift':
        return t('investPositionTxGift');
      case 'transfer_out':
        return t('investPositionTxTransferOut');
      default:
        return type;
    }
  };

  const typeColor = (type: InvestmentTransactionRow['type']): string => {
    if (type === 'buy' || type === 'gift') return GREEN;
    if (type === 'sell' || type === 'transfer_out') return RED;
    return colors.text;
  };

  const qtyLabel =
    heldUnits != null
      ? !Number.isInteger(heldUnits)
        ? heldUnits.toLocaleString(numberLocale, { maximumFractionDigits: 4 })
        : String(heldUnits)
      : '—';

  const pnlColor =
    unrealizedPnl == null ? colors.textSecondary : unrealizedPnl >= 0 ? GREEN : RED;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: ticker || t('screenInvestmentPosition'),
          headerShown: true,
          headerStyle: { backgroundColor: isDark ? '#1F2937' : '#8B5CF6' },
          headerTintColor: 'white',
          headerTitleStyle: { fontWeight: '700', color: 'white' },
          headerLeft: ({ tintColor }) => (
            <StackHeaderBackButton tintColor={tintColor ?? 'white'} />
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Hlavička */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.ticker, { color: colors.text }]}>{ticker || '—'}</Text>
          {isin ? (
            <Text style={[styles.subName, { color: colors.textSecondary }]}>{isin}</Text>
          ) : null}

          <View style={styles.headerGrid}>
            <View style={styles.headerCell}>
              <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
                {t('investPositionUnits')}
              </Text>
              <Text style={[styles.metaValue, { color: colors.text }]}>
                {qtyLabel} {t('pieces')}
              </Text>
            </View>
            <View style={styles.headerCell}>
              <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
                {t('investPositionAvgBuy')}
              </Text>
              <Text style={[styles.metaValue, { color: colors.text }]}>
                {formatMoney(avgBuyPrice, displayCurrency, numberLocale)}
              </Text>
            </View>
            <View style={styles.headerCell}>
              <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
                {t('investPositionCurrentPrice')}
              </Text>
              <Text style={[styles.metaValue, { color: colors.text }]}>
                {formatMoney(currentPrice, displayCurrency, numberLocale)}
              </Text>
            </View>
            <View style={styles.headerCell}>
              <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
                {t('investPositionValue')}
              </Text>
              <Text style={[styles.metaValue, { color: colors.text }]}>
                {formatMoney(currentValue, displayCurrency, numberLocale)}
              </Text>
            </View>
          </View>

          <View style={styles.pnlBlock}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
              {t('investPositionPnl')}
            </Text>
            <Text style={[styles.pnlValue, { color: pnlColor }]}>
              {unrealizedPnl != null
                ? `${unrealizedPnl >= 0 ? '+' : ''}${formatMoney(unrealizedPnl, displayCurrency, numberLocale)}`
                : '—'}
              {unrealizedPnlPct != null
                ? ` (${unrealizedPnlPct >= 0 ? '+' : ''}${unrealizedPnlPct.toLocaleString(numberLocale, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}%)`
                : ''}
            </Text>
          </View>
        </View>

        {/* Transakce */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('investPositionTxHistory')}
        </Text>

        <LoadingSkeleton loading={loading && txs.length === 0} variant="list" />

        {!loading && loadError ? (
          <Text style={[styles.errorText, { color: RED }]}>{loadError}</Text>
        ) : null}

        {!loading && !loadError && txs.length === 0 ? (
          <EmptyState title={t('investPositionEmptyTx')} />
        ) : null}

        {!loading && txs.length > 0
          ? txs.map((tx, idx) => {
              const ppu = pricePerUnitForDisplay(tx);
              const broker = portfolioById.get(tx.portfolio_id)?.broker;
              const amountCurrency = (
                DISPLAY_CURRENCIES.includes(tx.original_currency as DisplayCurrency)
                  ? (tx.original_currency as DisplayCurrency)
                  : displayCurrency
              ) as DisplayCurrency;
              return (
                <View
                  key={tx.id}
                  style={[
                    styles.txRow,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      marginBottom: idx < txs.length - 1 ? 8 : 0,
                    },
                  ]}
                >
                  <View style={styles.txTop}>
                    <Text style={[styles.txDate, { color: colors.textSecondary }]}>
                      {tx.date}
                    </Text>
                    <Text style={[styles.txType, { color: typeColor(tx.type) }]}>
                      {typeLabel(tx.type)}
                    </Text>
                  </View>
                  {showBroker && broker ? (
                    <Text style={[styles.txBroker, { color: colors.textSecondary }]}>
                      {brokerTabLabel(broker)}
                    </Text>
                  ) : null}
                  <View style={styles.txBottom}>
                    <Text style={[styles.txMeta, { color: colors.text }]}>
                      {formatQty(tx.units, numberLocale)} {t('pieces')}
                      {' · '}
                      {formatMoney(ppu, amountCurrency, numberLocale)}
                    </Text>
                    <Text style={[styles.txAmount, { color: colors.text }]}>
                      {formatMoney(tx.amount, amountCurrency, numberLocale)}
                    </Text>
                  </View>
                </View>
              );
            })
          : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 20,
  },
  ticker: {
    fontSize: 24,
    fontWeight: '800',
  },
  subName: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
  },
  headerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    gap: 12,
  },
  headerCell: {
    width: '47%',
    gap: 4,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  pnlBlock: {
    marginTop: 16,
    gap: 4,
  },
  pnlValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 14,
    marginBottom: 12,
  },
  txRow: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  txTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txDate: {
    fontSize: 13,
    fontWeight: '500',
  },
  txType: {
    fontSize: 13,
    fontWeight: '700',
  },
  txBroker: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
  },
  txBottom: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 8,
  },
  txMeta: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
});
