import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TrendingUp, TrendingDown, ArrowLeft, Info } from 'lucide-react-native';

interface AssetProfile {
  sector?: string;
  industry?: string;
  website?: string;
}

export default function AssetDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams() as Record<string, string | string[]>;
  const symbol = String(Array.isArray(params.symbol) ? params.symbol[0] : params.symbol ?? '').toUpperCase();
  const nameFromParams = String(Array.isArray(params.name) ? params.name[0] : params.name ?? symbol);
  const sharesNum = Number(String(Array.isArray(params.shares) ? params.shares[0] : params.shares ?? '0'));
  const avgPriceNum = Number(String(Array.isArray(params.avgPrice) ? params.avgPrice[0] : params.avgPrice ?? '0'));
  const investedNum = Number(String(Array.isArray(params.totalInvested) ? params.totalInvested[0] : params.totalInvested ?? '0'));

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [ccy, setCcy] = useState<string>('');
  const [dividendYield, setDividendYield] = useState<number | null>(null);
  const [dividendRate, setDividendRate] = useState<number | null>(null);
  const [marketCap, setMarketCap] = useState<number | null>(null);
  const [profile, setProfile] = useState<AssetProfile | null>(null);
  const [pe, setPe] = useState<number | null>(null);
  const [fpe, setFpe] = useState<number | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const base = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;
      if (!base) throw new Error('Missing EXPO_PUBLIC_RORK_API_BASE_URL');
      const url = `${base}/api/finance/summary?symbol=${encodeURIComponent(symbol)}`;
      console.log('[AssetDetail] fetching', url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as any;
      const p = json?.price ?? null;
      const curr = json?.currency ?? '';
      const dy = json?.dividendYield ?? null;
      const dr = json?.dividendRate ?? null;
      const mc = json?.marketCap ?? null;
      const profileObj = json?.assetProfile ?? null;
      const peV = json?.pe ?? null;
      const fpeV = json?.forwardPE ?? null;

      setPrice(typeof p === 'number' && Number.isFinite(p) ? p : null);
      setCcy(curr || '');
      setDividendYield(typeof dy === 'number' ? dy : null);
      setDividendRate(typeof dr === 'number' ? dr : null);
      setMarketCap(typeof mc === 'number' ? mc : null);
      setProfile(profileObj ?? null);
      setPe(typeof peV === 'number' ? peV : null);
      setFpe(typeof fpeV === 'number' ? fpeV : null);
    } catch (e) {
      console.error('[AssetDetail] fetch error', e);
      setError('Nepodařilo se načíst detail akcie.');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => { void fetchDetails(); }, [fetchDetails]);

  const computed = useMemo(() => {
    const currentPrice = price ?? avgPriceNum;
    const currentValue = sharesNum * currentPrice;
    const unrealized = currentValue - investedNum;
    const changePct = investedNum > 0 ? (unrealized / investedNum) * 100 : 0;
    return { currentPrice, currentValue, unrealized, changePct };
  }, [price, avgPriceNum, sharesNum, investedNum]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]} testID="AssetDetailScreen">
      <Stack.Screen options={{ title: symbol }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="backBtn">
          <ArrowLeft size={20} color="#111" />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>{nameFromParams}</Text>
          <Text style={styles.sub}>{symbol}</Text>
        </View>
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      )}

      {error ? (
        <Text style={styles.error} testID="error">{error}</Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card} testID="headline">
          <View style={styles.rowTop}>
            <Text style={styles.big}>{computed.currentValue.toFixed(2)}{ccy ? ` ${ccy}` : ''}</Text>
            <View style={styles.trend}>
              {computed.unrealized >= 0 ? (
                <TrendingUp size={16} color="#10B981" />
              ) : (
                <TrendingDown size={16} color="#EF4444" />
              )}
              <Text style={[styles.pnlPct, { color: computed.unrealized >= 0 ? '#10B981' : '#EF4444' }]}>
                {computed.changePct >= 0 ? '+' : ''}{computed.changePct.toFixed(2)}%
              </Text>
            </View>
          </View>
          <Text style={styles.muted}>Aktuální cena: {computed.currentPrice.toFixed(2)}{ccy ? ` ${ccy}` : ''}</Text>
          <Text style={styles.muted}>Držíš: {sharesNum.toLocaleString('cs-CZ', { maximumFractionDigits: 4 })} ks, Průměr: {avgPriceNum.toFixed(2)}{ccy ? ` ${ccy}` : ''}</Text>
          <Text style={styles.muted}>Investováno: {investedNum.toFixed(2)}{ccy ? ` ${ccy}` : ''}</Text>
        </View>

        <View style={styles.grid}>
          <View style={styles.stat} testID="pnlBox">
            <Text style={styles.label}>Nezrealizované P/L</Text>
            <Text style={[styles.value, { color: computed.unrealized >= 0 ? '#10B981' : '#EF4444' }]}>
              {computed.unrealized.toFixed(2)}{ccy ? ` ${ccy}` : ''}
            </Text>
          </View>
          <View style={styles.stat} testID="dividendBox">
            <Text style={styles.label}>Dividenda (yld)</Text>
            <Text style={styles.value}>{dividendYield != null ? `${(dividendYield * 100).toFixed(2)}%` : '—'}</Text>
            <Text style={styles.smallMuted}>{dividendRate != null ? `${dividendRate.toFixed(2)} ${ccy}` : ''}</Text>
          </View>
          <View style={styles.stat} testID="mcapBox">
            <Text style={styles.label}>Market Cap</Text>
            <Text style={styles.value}>{marketCap != null ? formatBillions(marketCap, ccy) : '—'}</Text>
          </View>
          <View style={styles.stat} testID="peBox">
            <Text style={styles.label}>P/E</Text>
            <Text style={styles.value}>{pe != null ? pe.toFixed(2) : '—'}</Text>
            <Text style={styles.smallMuted}>{fpe != null ? `Forward ${fpe.toFixed(2)}` : ''}</Text>
          </View>
        </View>

        <View style={styles.card} testID="about">
          <View style={styles.aboutHeader}>
            <Info size={16} color="#111" />
            <Text style={styles.aboutTitle}>Základní informace</Text>
          </View>
          <Text style={styles.muted}>Sektor: {profile?.sector ?? '—'}</Text>
          <Text style={styles.muted}>Odvětví: {profile?.industry ?? '—'}</Text>
          <Text style={styles.muted}>Web: {profile?.website ?? '—'}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function formatBillions(n: number, ccy?: string): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)} T${ccy ? ' ' + ccy : ''}`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)} B${ccy ? ' ' + ccy : ''}`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)} M${ccy ? ' ' + ccy : ''}`;
  return `${sign}${abs.toFixed(0)}${ccy ? ' ' + ccy : ''}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  headerTextWrap: { marginLeft: 12 },
  title: { fontSize: 18, fontWeight: '700' as const, color: '#111' },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  error: { color: '#c00', paddingHorizontal: 16, marginBottom: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  big: { fontSize: 22, fontWeight: '700' as const, color: '#111' },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pnlPct: { fontSize: 14, fontWeight: '600' as const },
  muted: { color: '#6B7280', fontSize: 13, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8, marginBottom: 8 },
  stat: { flexGrow: 1, flexBasis: '48%', backgroundColor: '#fff', borderRadius: 12, padding: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  label: { color: '#6B7280', fontSize: 12 },
  value: { color: '#111', fontSize: 16, fontWeight: '700' as const, marginTop: 4 },
  smallMuted: { color: '#9CA3AF', fontSize: 11, marginTop: 2 },
  aboutHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  aboutTitle: { fontSize: 14, fontWeight: '700' as const, color: '#111' },
});