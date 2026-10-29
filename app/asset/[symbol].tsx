import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { TrendingUp, TrendingDown } from 'lucide-react-native';
import { useLanguageStore } from '@/store/language-store';
import { ScreenHeader } from '@/components/ScreenHeader';
import { fetchYahooQuote, toYahooSymbol } from '@/lib/yahoo-ticker';
import { fetchYahooDailySeries } from '@/lib/yahoo-historical';

type ChartRange = '1M' | '1Y';

type ChartPoint = { date: string; price: number };

export default function AssetDetailScreen() {
  const { t } = useLanguageStore();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const params = useLocalSearchParams() as Record<string, string | string[]>;
  const symbol = String(Array.isArray(params.symbol) ? params.symbol[0] : params.symbol ?? '').toUpperCase();
  const nameFromParams = String(Array.isArray(params.name) ? params.name[0] : params.name ?? symbol);
  const sharesNum = Number(String(Array.isArray(params.shares) ? params.shares[0] : params.shares ?? '0'));
  const avgPriceNum = Number(String(Array.isArray(params.avgPrice) ? params.avgPrice[0] : params.avgPrice ?? '0'));
  const investedNum = Number(String(Array.isArray(params.totalInvested) ? params.totalInvested[0] : params.totalInvested ?? '0'));
  const isinParam = String(Array.isArray(params.isin) ? params.isin[0] : params.isin ?? '') || null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [ccy, setCcy] = useState('');
  const [dayChangePct, setDayChangePct] = useState<number | null>(null);
  const [chartRange, setChartRange] = useState<ChartRange>('1M');
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  const fetchQuote = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const quote = await fetchYahooQuote(symbol, isinParam);
      if (!quote || quote.price == null || !Number.isFinite(quote.price)) {
        setPrice(null);
        setCcy('');
        setDayChangePct(null);
        setError(t('assetPriceUnavailable'));
        return;
      }
      setPrice(quote.price);
      setCcy(quote.currency || '');

      // Denní změna z krátké historie (včera → dnes), pokud Yahoo vrátí body.
      const yahooSym = quote.yahooSymbol || toYahooSymbol(symbol, isinParam);
      const now = Math.floor(Date.now() / 1000);
      const weekAgo = now - 10 * 86_400;
      const series = await fetchYahooDailySeries(yahooSym, weekAgo, now);
      if (series && series.byDate.size >= 2) {
        const sorted = [...series.byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const prev = sorted[sorted.length - 2]?.[1];
        const last = sorted[sorted.length - 1]?.[1];
        if (prev != null && last != null && prev > 0) {
          setDayChangePct(((last - prev) / prev) * 100);
        } else {
          setDayChangePct(null);
        }
      } else {
        setDayChangePct(null);
      }
    } catch (e) {
      console.warn('[AssetDetail] Yahoo quote error', e);
      setPrice(null);
      setDayChangePct(null);
      setError(t('assetPriceUnavailable'));
    } finally {
      setLoading(false);
    }
  }, [symbol, isinParam, t]);

  const fetchChart = useCallback(async () => {
    if (!symbol) return;
    setChartLoading(true);
    try {
      const yahooSym = toYahooSymbol(symbol, isinParam);
      const now = Math.floor(Date.now() / 1000);
      const span = chartRange === '1M' ? 35 * 86_400 : 380 * 86_400;
      const series = await fetchYahooDailySeries(yahooSym, now - span, now);
      if (!series || series.byDate.size < 2) {
        setChartPoints([]);
        return;
      }
      const pts = [...series.byDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, p]) => ({ date, price: p }));
      setChartPoints(pts);
    } catch (e) {
      console.warn('[AssetDetail] chart error', e);
      setChartPoints([]);
    } finally {
      setChartLoading(false);
    }
  }, [symbol, isinParam, chartRange]);

  useEffect(() => {
    void fetchQuote();
  }, [fetchQuote]);

  useEffect(() => {
    void fetchChart();
  }, [fetchChart]);

  const computed = useMemo(() => {
    const hasLive = price != null && Number.isFinite(price);
    const currentPrice = hasLive ? (price as number) : null;
    const currentValue =
      currentPrice != null && Number.isFinite(sharesNum) ? sharesNum * currentPrice : null;
    const unrealized =
      currentValue != null && Number.isFinite(investedNum) ? currentValue - investedNum : null;
    const changePct =
      unrealized != null && investedNum > 0 ? (unrealized / investedNum) * 100 : null;
    return { hasLive, currentPrice, currentValue, unrealized, changePct };
  }, [price, sharesNum, investedNum]);

  const chartPath = useMemo(() => {
    if (chartPoints.length < 2) return null;
    const w = Math.max(280, winW - 64);
    const h = 120;
    const pad = 8;
    const values = chartPoints.map((p) => p.price);
    let minV = Math.min(...values);
    let maxV = Math.max(...values);
    if (minV === maxV) {
      minV -= 1;
      maxV += 1;
    }
    const span = maxV - minV || 1;
    const pts = chartPoints.map((p, i) => {
      const x = pad + (i / (chartPoints.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (p.price - minV) / span) * (h - pad * 2);
      return { x, y };
    });
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const up = values[values.length - 1]! >= values[0]!;
    return { d, w, h, up, last: pts[pts.length - 1]! };
  }, [chartPoints, winW]);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]} testID="AssetDetailScreen">
      <Stack.Screen options={{ title: symbol, headerShown: false }} />
      <ScreenHeader title={nameFromParams} subtitle={symbol} variant="gradient" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error} testID="error">
          {error}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card} testID="headline">
          <View style={styles.rowTop}>
            <Text style={styles.big}>
              {computed.currentValue != null
                ? `${computed.currentValue.toFixed(2)}${ccy ? ` ${ccy}` : ''}`
                : '—'}
            </Text>
            {computed.changePct != null ? (
              <View style={styles.trend}>
                {computed.unrealized != null && computed.unrealized >= 0 ? (
                  <TrendingUp size={16} color="#10B981" />
                ) : (
                  <TrendingDown size={16} color="#EF4444" />
                )}
                <Text
                  style={[
                    styles.pnlPct,
                    {
                      color:
                        computed.unrealized != null && computed.unrealized >= 0
                          ? '#10B981'
                          : '#EF4444',
                    },
                  ]}
                >
                  {computed.changePct >= 0 ? '+' : ''}
                  {computed.changePct.toFixed(2)}%
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.muted}>
            {computed.currentPrice != null
              ? t('assetCurrentPrice', {
                  price: computed.currentPrice.toFixed(2),
                  currency: ccy ? ` ${ccy}` : '',
                })
              : t('assetPriceUnavailable')}
          </Text>
          {dayChangePct != null ? (
            <Text
              style={[
                styles.muted,
                { color: dayChangePct >= 0 ? '#10B981' : '#EF4444', fontWeight: '600' },
              ]}
            >
              {t('assetDayChange', {
                pct: `${dayChangePct >= 0 ? '+' : ''}${dayChangePct.toFixed(2)}%`,
              })}
            </Text>
          ) : null}
          <Text style={styles.muted}>
            {t('assetHoldingLine', {
              shares: sharesNum.toLocaleString('cs-CZ', { maximumFractionDigits: 4 }),
              avgPrice: avgPriceNum.toFixed(2),
              currency: ccy ? ` ${ccy}` : '',
            })}
          </Text>
          <Text style={styles.muted}>
            {t('invested')}: {investedNum.toFixed(2)}
            {ccy ? ` ${ccy}` : ''}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.rangeRow}>
            {(['1M', '1Y'] as ChartRange[]).map((r) => {
              const active = chartRange === r;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setChartRange(r)}
                  style={[styles.rangeChip, active && styles.rangeChipActive]}
                >
                  <Text style={[styles.rangeChipText, active && styles.rangeChipTextActive]}>{r}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {chartLoading ? (
            <ActivityIndicator style={{ marginVertical: 24 }} />
          ) : chartPath ? (
            <Svg width={chartPath.w} height={chartPath.h}>
              <Path
                d={chartPath.d}
                stroke={chartPath.up ? '#10B981' : '#EF4444'}
                strokeWidth={2}
                fill="none"
              />
              <Circle
                cx={chartPath.last.x}
                cy={chartPath.last.y}
                r={3.5}
                fill={chartPath.up ? '#10B981' : '#EF4444'}
              />
            </Svg>
          ) : (
            <Text style={[styles.muted, { marginVertical: 16 }]}>{t('assetChartUnavailable')}</Text>
          )}
        </View>

        <View style={styles.grid}>
          <View style={styles.stat} testID="pnlBox">
            <Text style={styles.label}>{t('assetUnrealizedPnl')}</Text>
            <Text
              style={[
                styles.value,
                {
                  color:
                    computed.unrealized == null
                      ? '#111'
                      : computed.unrealized >= 0
                        ? '#10B981'
                        : '#EF4444',
                },
              ]}
            >
              {computed.unrealized != null
                ? `${computed.unrealized.toFixed(2)}${ccy ? ` ${ccy}` : ''}`
                : '—'}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.label}>{t('assetShares')}</Text>
            <Text style={styles.value}>
              {sharesNum.toLocaleString('cs-CZ', { maximumFractionDigits: 4 })}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.label}>{t('assetAvgPrice')}</Text>
            <Text style={styles.value}>
              {avgPriceNum.toFixed(2)}
              {ccy ? ` ${ccy}` : ''}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.label}>{t('invested')}</Text>
            <Text style={styles.value}>
              {investedNum.toFixed(2)}
              {ccy ? ` ${ccy}` : ''}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  error: { color: '#c00', paddingHorizontal: 16, marginBottom: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  big: { fontSize: 22, fontWeight: '700' as const, color: '#111' },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pnlPct: { fontSize: 14, fontWeight: '600' as const },
  muted: { color: '#6B7280', fontSize: 13, marginTop: 4 },
  rangeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  rangeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  rangeChipActive: { backgroundColor: '#111827' },
  rangeChipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  rangeChipTextActive: { color: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8, marginBottom: 8 },
  stat: {
    flexGrow: 1,
    flexBasis: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  label: { color: '#6B7280', fontSize: 12 },
  value: { color: '#111', fontSize: 16, fontWeight: '700' as const, marginTop: 4 },
});
