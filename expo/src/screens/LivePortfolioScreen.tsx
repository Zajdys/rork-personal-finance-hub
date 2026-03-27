import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { parseXlsxArrayBuffer, parseCsvText, type ParsedTable } from '@/src/utils/fileParser';
import { TrendingUp } from 'lucide-react-native';
import { buildPortfolioFromTrades, type HoldingFifo } from '@/src/services/portfolio/portfolioCalc';
import { fetchLatestPrices } from '@/src/services/priceService';

export default function LivePortfolioScreen() {
  const [rows, setRows] = useState<ParsedTable>([]);
  const [holdings, setHoldings] = useState<HoldingFifo[]>([]);
  const [prices, setPrices] = useState<Record<string, { price: number }>>({});
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

  const mapRowsToTrades = useCallback(() => {
    return rows.map((r) => {
      const symbol = (String(r['Ticker'] ?? r['ISIN'] ?? r['Name'] ?? r['symbol'] ?? '')).trim();
      const type = String(r['Action'] ?? r['Type'] ?? r['type'] ?? '').trim();
      const amountRaw = r['No. of shares'] ?? r['Shares'] ?? r['Quantity'] ?? r['amount'];
      const unitPriceRaw = r['Price / share'] ?? r['Price'] ?? r['unitPrice'];
      const feesRaw = r['Charge amount'] ?? r['Deposit fee'] ?? r['Currency conversion fee'] ?? r['French transaction tax'] ?? r['Withholding tax'] ?? r['fees'];
      const amount = amountRaw != null ? Number(String(amountRaw).replace(',', '.')) : 0;
      const unitPrice = unitPriceRaw != null ? Number(String(unitPriceRaw).replace(',', '.')) : 0;
      const fees = feesRaw != null ? Number(String(feesRaw).replace(',', '.')) : 0;
      return { symbol, type, amount, unitPrice, fees };
    });
  }, [rows]);

  const compute = useCallback(async () => {
    if (!rows || rows.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const trades = mapRowsToTrades();
      const fifo = buildPortfolioFromTrades(trades);
      setHoldings(fifo);
      const symbols = fifo.map((h) => h.symbol).filter(Boolean);
      if (symbols.length > 0) {
        const priceMap = await fetchLatestPrices(symbols);
        setPrices(priceMap);
      } else {
        setPrices({});
      }
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      console.error('[LivePortfolioScreen] compute error', e);
      setError('Výpočet se nezdařil.');
    } finally {
      setLoading(false);
    }
  }, [rows, mapRowsToTrades]);

  useEffect(() => {
    if (rows.length) { void compute(); }
  }, [rows, compute]);

  useEffect(() => {
    if (holdings.length === 0) return;
    const id = setInterval(() => {
      console.log('[LivePortfolioScreen] auto refresh tick');
      void compute();
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [holdings.length, compute]);

  const calculatePL = useCallback((h: HoldingFifo) => {
    const key = h.symbol.trim().toLowerCase();
    const currentPrice = prices[key]?.price ?? h.avgBuyPrice;
    const currentValue = h.shares * currentPrice;
    const unrealizedPL = currentValue - h.totalCost;
    const totalPL = unrealizedPL + h.realizedPL;
    const changePct = h.totalCost > 0 ? (unrealizedPL / h.totalCost) * 100 : 0;
    return { currentPrice, currentValue, unrealizedPL, totalPL, changePct };
  }, [prices]);

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

  const renderItem = useCallback(({ item }: { item: HoldingFifo }) => {
    const { currentPrice, currentValue, unrealizedPL, totalPL, changePct } = calculatePL(item);
    return (
      <View style={styles.row} testID={`row-${item.symbol}`}>
        <View style={styles.rowLeft}>
          <TrendingUp size={18} color="#111" />
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowTitle}>{item.symbol}</Text>
            <Text style={styles.rowSub}>{item.shares.toFixed(4)} ks</Text>
            <Text style={styles.rowSub}>Průměr: {item.avgBuyPrice.toFixed(4)}</Text>
          </View>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowTitle}>{currentValue.toFixed(2)}</Text>
          <Text style={styles.rowSub}>Cena: {currentPrice.toFixed(4)}</Text>
          <Text style={[styles.rowSub, { color: totalPL >= 0 ? '#0a0' : '#c00' }]}>PL: {totalPL.toFixed(2)} ({changePct.toFixed(2)}%)</Text>
        </View>
      </View>
    );
  }, [calculatePL]);

  const keyExtractor = useCallback((i: HoldingFifo) => i.symbol, []);

  return (
    <View style={styles.container} testID="LivePortfolioScreen">
      <>{renderHeader}</>

      {error ? (
        <Text style={styles.error} testID="error">{error}</Text>
      ) : null}

      {loading && holdings.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : null}

      {holdings.length > 0 ? (
        <>
          {lastUpdated ? (
            <View style={styles.summary} testID="summary">
              <Text style={styles.updated} testID="lastUpdated">Aktualizováno: {lastUpdated}</Text>
            </View>
          ) : null}

          <FlatList
            data={holdings}
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
