import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Upload, RefreshCw } from 'lucide-react-native';
import { parseT212Csv, buildFifoFromT212Rows, type T212PortfolioItem } from '@/src/services/trading212/portfolioFromCsv';
import { fetchCurrentPrices } from '@/src/services/priceService';

export type TableRow = {
  ticker: string;
  shares: number;
  invested: number;
  currency: string | null;
  currentPrice: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
};

function formatNumber(n: number, digits: number = 2): string {
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default function T212PortfolioScreen() {
  const [items, setItems] = useState<T212PortfolioItem[]>([]);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const computeRows = useCallback(async (fifoItems: T212PortfolioItem[]) => {
    setLoading(true);
    setError(null);
    try {
      const tickers = fifoItems.map(i => i.ticker).filter((t) => t && t.length > 0);
      const prices = await fetchCurrentPrices(tickers);
      const out: TableRow[] = fifoItems.map((i) => {
        const sym = i.ticker.toUpperCase();
        const currentPrice = prices[sym] ?? 0;
        const currentValue = currentPrice * i.shares;
        const pnl = currentValue - i.invested;
        const pnlPct = i.invested > 0 ? (pnl / i.invested) * 100 : 0;
        return { ticker: sym, shares: i.shares, invested: i.invested, currency: i.currency, currentPrice, currentValue, pnl, pnlPct };
      }).sort((a, b) => b.currentValue - a.currentValue);
      setRows(out);
    } catch (e) {
      console.error('[T212] computeRows error', e);
      setError('Nepodařilo se stáhnout ceny. Zkuste to prosím znovu.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const onPickFile = useCallback(async () => {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/plain', 'text/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    try {
      setLoading(true);
      const text = await (await fetch(asset.uri)).text();
      const table = parseT212Csv(text);
      const fifo = buildFifoFromT212Rows(table);
      setItems(fifo);
      await computeRows(fifo);
    } catch (e) {
      console.error('[T212] onPickFile error', e);
      setError('Soubor se nepodařilo načíst nebo má neplatný formát.');
      setItems([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [computeRows]);

  const totalLine = useMemo(() => {
    const invested = rows.reduce((s, r) => s + r.invested, 0);
    const value = rows.reduce((s, r) => s + r.currentValue, 0);
    const pnl = value - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return { invested, value, pnl, pnlPct };
  }, [rows]);

  const renderHeader = useCallback(() => (
    <View style={styles.tableHeader} testID="t212-header">
      <Text style={[styles.hCell, { flex: 1.3 }]}>Ticker</Text>
      <Text style={[styles.hCell, { flex: 1 }]}>Shares</Text>
      <Text style={[styles.hCell, { flex: 1.2 }]}>Invested (€)</Text>
      <Text style={[styles.hCell, { flex: 1.2 }]}>Price (€)</Text>
      <Text style={[styles.hCell, { flex: 1.4 }]}>Value (€)</Text>
      <Text style={[styles.hCell, { flex: 1.4 }]}>P/L (€)</Text>
      <Text style={[styles.hCell, { flex: 1 }]}>P/L %</Text>
    </View>
  ), []);

  const renderItem = useCallback(({ item }: { item: TableRow }) => {
    const plColor = item.pnl >= 0 ? '#059669' : '#DC2626';
    return (
      <View style={styles.tableRow} testID={`trow-${item.ticker}`}>
        <Text style={[styles.tCell, styles.bold, { flex: 1.3 }]}>{item.ticker}</Text>
        <Text style={[styles.tCell, { flex: 1 }]}>{formatNumber(item.shares, 4)}</Text>
        <Text style={[styles.tCell, { flex: 1.2 }]}>{formatNumber(item.invested)}</Text>
        <Text style={[styles.tCell, { flex: 1.2 }]}>{formatNumber(item.currentPrice)}</Text>
        <Text style={[styles.tCell, { flex: 1.4 }]}>{formatNumber(item.currentValue)}</Text>
        <Text style={[styles.tCell, { flex: 1.4, color: plColor }]}>{formatNumber(item.pnl)}</Text>
        <Text style={[styles.tCell, { flex: 1, color: plColor }]}>{formatNumber(item.pnlPct)}%</Text>
      </View>
    );
  }, []);

  return (
    <View style={styles.container} testID="T212PortfolioScreen">
      <Stack.Screen options={{ title: 'Trading 212 Portfolio' }} />

      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.actionBtn} onPress={onPickFile} testID="pick-csv">
          <Upload size={16} color="#fff" />
          <Text style={styles.actionText}>Načíst CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#111827' }]} onPress={() => computeRows(items)} disabled={!items.length} testID="recompute">
          <RefreshCw size={16} color="#fff" />
          <Text style={styles.actionText}>Přepočítat</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <Text style={styles.error} testID="error">{error}</Text>
      ) : null}

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : null}

      {rows.length > 0 ? (
        <>
          <View style={styles.totals} testID="totals">
            <Text style={styles.totalText}>Invested: €{formatNumber(totalLine.invested)}</Text>
            <Text style={styles.totalText}>Value: €{formatNumber(totalLine.value)}</Text>
            <Text style={[styles.totalText, { color: totalLine.pnl >= 0 ? '#059669' : '#DC2626' }]}>P/L: €{formatNumber(totalLine.pnl)} ({formatNumber(totalLine.pnlPct)}%)</Text>
          </View>
          {renderHeader()}
          <FlatList
            data={rows}
            keyExtractor={(r) => r.ticker}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => computeRows(items)} />}
            contentContainerStyle={styles.listContent}
          />
        </>
      ) : (
        !loading && (
          <View style={styles.center}>
            <Text style={styles.muted}>Načti CSV z Trading 212 a uvidíš tabulku jako v aplikaci brokera.</Text>
          </View>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  toolbar: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  actionBtn: { flexDirection: 'row', gap: 8, backgroundColor: '#2563EB', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  actionText: { color: '#fff', fontWeight: '600' as const },
  error: { color: '#DC2626', paddingHorizontal: 16, paddingBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tableHeader: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#fff' },
  hCell: { fontSize: 12, fontWeight: '700' as const, color: '#374151' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderRadius: 8 },
  tCell: { fontSize: 12, color: '#111827' },
  bold: { fontWeight: '700' as const },
  sep: { height: 8 },
  listContent: { padding: 12 },
  totals: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  totalText: { fontSize: 12, color: '#374151' },
  muted: { color: '#6B7280', paddingHorizontal: 24, textAlign: 'center' as const },
});
