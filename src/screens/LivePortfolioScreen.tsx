import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { calcPortfolioWithLivePrices, type PortfolioRow, type CashRow } from '@/src/services/portfolioCalc';
import { parseXlsxArrayBuffer, parseCsvText, type ParsedTable } from '@/src/utils/fileParser';
import { TrendingUp, Wallet } from 'lucide-react-native';

export default function LivePortfolioScreen() {
  const [rows, setRows] = useState<ParsedTable>([]);
  const [result, setResult] = useState<{ portfolio: PortfolioRow[]; cash: CashRow[] } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const pickFile = useCallback(async () => {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    try {
      setLoading(true);
      if (asset.name?.toLowerCase().endsWith('.csv')) {
        const txt = await (await fetch(asset.uri)).text();
        const table = parseCsvText(txt);
        setRows(table);
      } else {
        const buf = await (await fetch(asset.uri)).arrayBuffer();
        const table = await parseXlsxArrayBuffer(buf, 'Trades');
        setRows(table);
      }
    } catch (e) {
      console.error('[LivePortfolioScreen] pickFile error', e);
      setError('Nepodařilo se načíst soubor. Zkuste to znovu.');
    } finally {
      setLoading(false);
    }
  }, []);

  const compute = useCallback(async () => {
    if (!rows || rows.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await calcPortfolioWithLivePrices(rows);
      setResult(res);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      console.error('[LivePortfolioScreen] compute error', e);
      setError('Výpočet se nezdařil.');
    } finally {
      setLoading(false);
    }
  }, [rows]);

  useEffect(() => {
    if (rows.length) { void compute(); }
  }, [rows, compute]);

  useEffect(() => {
    if (!result) return;
    const id = setInterval(() => {
      console.log('[LivePortfolioScreen] auto refresh tick');
      void compute();
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [result, compute]);

  const totalByCcy = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of result?.portfolio ?? []) {
      map.set(p.ccy, (map.get(p.ccy) ?? 0) + p.positionValue);
    }
    for (const c of result?.cash ?? []) {
      map.set(c.ccy, (map.get(c.ccy) ?? 0) + c.cashValue);
    }
    return Array.from(map.entries()).map(([ccy, total]) => ({ ccy, total }));
  }, [result]);

  const renderHeader = useMemo(() => (
    <View style={styles.header} testID="header">
      <Text style={styles.title}>Live Portfolio</Text>
      <View style={styles.headerRight}>
        <TouchableOpacity onPress={pickFile} style={styles.btn} testID="pickFileBtn">
          <Text style={styles.btnText}>Import</Text>
        </TouchableOpacity>
      </View>
    </View>
  ), [pickFile]);

  const renderItem = useCallback(({ item }: { item: PortfolioRow }) => (
    <View style={styles.row} testID={`row-${item.symbol}`}>
      <View style={styles.rowLeft}>
        <TrendingUp size={18} color="#111" />
        <View style={styles.rowTextWrap}>
          <Text style={styles.rowTitle}>{item.symbol}</Text>
          <Text style={styles.rowSub}>{item.shares.toFixed(4)} ks · {item.ccy}</Text>
        </View>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowTitle}>{item.positionValue.toFixed(2)}</Text>
        <Text style={styles.rowSub}>{item.lastPrice.toFixed(4)}</Text>
      </View>
    </View>
  ), []);

  const keyExtractor = useCallback((i: PortfolioRow) => i.symbol, []);

  return (
    <View style={styles.container} testID="LivePortfolioScreen">
      <>{renderHeader}</>

      {error ? (
        <Text style={styles.error} testID="error">{error}</Text>
      ) : null}

      {loading && !result ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : null}

      {result ? (
        <>
          <View style={styles.summary} testID="summary">
            {totalByCcy.map((t) => (
              <View key={t.ccy} style={styles.summaryItem}>
                <Wallet size={16} color="#444" />
                <Text style={styles.summaryText}>{t.ccy}: {t.total.toFixed(2)}</Text>
              </View>
            ))}
            {lastUpdated ? (
              <Text style={styles.updated} testID="lastUpdated">Aktualizováno: {lastUpdated}</Text>
            ) : null}
          </View>

          <FlatList
            data={result.portfolio}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={compute} />}
            contentContainerStyle={styles.listContent}
          />
        </>
      ) : (
        <View style={styles.center}>
          <Text style={styles.muted}>Naimportujte CSV/XLSX s obchody (kolik vlastníš, ne cena akcie).</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa' },
  header: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '600' as const, color: '#111' },
  headerRight: { flexDirection: 'row', gap: 12 },
  btn: { backgroundColor: '#111', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '600' as const },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#c00', paddingHorizontal: 16, marginBottom: 8 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingBottom: 8, alignItems: 'center' },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#eee' },
  summaryText: { color: '#333' },
  listContent: { paddingHorizontal: 12, paddingVertical: 8 },
  row: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sep: { height: 10 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTextWrap: { },
  rowTitle: { fontSize: 16, fontWeight: '600' as const, color: '#111' },
  rowSub: { fontSize: 12, color: '#666', marginTop: 2 },
  rowRight: { alignItems: 'flex-end' as const },
  muted: { color: '#777', paddingHorizontal: 24, textAlign: 'center' as const },
  updated: { marginLeft: 8, color: '#666', fontSize: 12 },
});
