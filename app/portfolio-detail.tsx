import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Plus,
  X,
  Upload,
  ShoppingCart,
  Minus,
  Trash2,
  FileText,
  PieChart,
  DollarSign,
  Percent,
  AlertCircle,
  ArrowRightLeft,
  ZoomIn,
} from 'lucide-react-native';
import Svg, { Circle, G, Text as SvgText } from 'react-native-svg';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { usePortfolioStore, Trade } from '@/store/portfolio-store';
import { useSettingsStore, CURRENCIES, Currency } from '@/store/settings-store';
import { read, utils } from 'xlsx';
import { mapRow, Txn } from '@/src/services/portfolio/importCsv';
import { fetchCurrentPrices } from '@/src/services/priceService';
import { calculatePortfolioMetrics } from '@/services/financial-calculations';

const { width } = Dimensions.get('window');

const SUGGESTED_INVESTMENTS = [
  {
    name: 'S&P 500 ETF',
    symbol: 'SPY',
    description: 'Široký americký akciový index',
    color: '#10B981',
  },
  {
    name: 'Bitcoin',
    symbol: 'BTC',
    description: 'Kryptoměna',
    color: '#F59E0B',
  },
  {
    name: 'Evropské akcie',
    symbol: 'VEA',
    description: 'Evropský akciový trh',
    color: '#8B5CF6',
  },
  {
    name: 'Zlato ETF',
    symbol: 'GLD',
    description: 'Investice do zlata',
    color: '#EF4444',
  },
  {
    name: 'Apple Inc.',
    symbol: 'AAPL',
    description: 'Technologická společnost',
    color: '#3B82F6',
  },
  {
    name: 'Microsoft Corp.',
    symbol: 'MSFT',
    description: 'Softwarová společnost',
    color: '#06B6D4',
  },
];

export default function PortfolioDetailScreen() {
  const router = useRouter();
  const { portfolioId } = useLocalSearchParams<{ portfolioId: string }>();
  const { portfolios, getPortfolio, addTradeToPortfolio, removeTradeFromPortfolio } = usePortfolioStore();
  const { currency, currencyScope, investmentCurrency } = useSettingsStore();
  
  const portfolio = useMemo(() => getPortfolio(portfolioId || ''), [portfolios, portfolioId]);
  
  const [selectedTab, setSelectedTab] = useState<'portfolio' | 'trades' | 'performance'>('portfolio');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showTradeModal, setShowTradeModal] = useState<boolean>(false);
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [tradeSymbol, setTradeSymbol] = useState<string>('');
  const [tradeName, setTradeName] = useState<string>('');
  const [tradeAmount, setTradeAmount] = useState<string>('');
  const [tradePrice, setTradePrice] = useState<string>('');
  const [showSuggestedModal, setShowSuggestedModal] = useState<boolean>(false);
  const [showFileImportModal, setShowFileImportModal] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});

  const trades = useMemo(() => portfolio?.trades || [], [portfolio]);

  const symbolsKey = useMemo(() => {
    const symbols = Array.from(new Set(trades.map((t) => t.symbol.toUpperCase())));
    return symbols.sort().join(',');
  }, [trades]);

  useEffect(() => {
    if (!symbolsKey) {
      setPriceMap({});
      return;
    }
    const symbols = symbolsKey.split(',');
    let cancelled = false;
    (async () => {
      try {
        console.log('🟢 Fetching current prices for', symbols);
        const prices = await fetchCurrentPrices(symbols);
        if (!cancelled) setPriceMap(prices);
      } catch (e) {
        console.warn('Price fetch failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbolsKey]);

  const portfolioData = useMemo(() => {
    console.log('🔄 Recalculating portfolio from trades:', trades.length);

    let totalRealizedPnL = 0;

    const positions = trades
      .reduce((acc, trade) => {
        console.log(
          `Processing trade: ${trade.type} ${trade.amount} ${trade.symbol} @ ${trade.price} = ${trade.total}`
        );

        const existing = acc.find((item) => item.symbol === trade.symbol);
        if (existing) {
          if (trade.type === 'buy') {
            const newTotalShares = existing.shares + trade.amount;
            const newTotalInvested = existing.totalInvested + trade.total;
            existing.totalInvested = newTotalInvested;
            existing.shares = newTotalShares;
            existing.avgPrice = newTotalInvested / newTotalShares;
            console.log(
              `Updated ${trade.symbol}: ${newTotalShares} shares, avg price ${existing.avgPrice.toFixed(
                2
              )}, invested ${newTotalInvested}`
            );
          } else {
            const soldShares = Math.min(trade.amount, existing.shares);
            const soldInvestment = soldShares * existing.avgPrice;
            const realizedProfit = trade.total - soldInvestment;
            existing.shares -= soldShares;
            existing.totalInvested -= soldInvestment;
            existing.realizedPnL += realizedProfit;
            totalRealizedPnL += realizedProfit;
            console.log(
              `Sold ${soldShares} ${trade.symbol}: remaining ${existing.shares} shares, realized P&L ${existing.realizedPnL}`
            );
          }
        } else {
          if (trade.type === 'buy') {
            const newPosition = {
              symbol: trade.symbol,
              name: trade.name,
              totalInvested: trade.total,
              shares: trade.amount,
              avgPrice: trade.price,
              realizedPnL: 0,
              color:
                SUGGESTED_INVESTMENTS.find((s) => s.symbol === trade.symbol)?.color ||
                '#6B7280',
            };
            acc.push(newPosition);
            console.log(`New position ${trade.symbol}: ${trade.amount} shares @ ${trade.price}`);
          }
        }
        return acc;
      }, [] as any[])
      .filter((item) => {
        const hasShares = item.shares > 0;
        if (!hasShares) {
          console.log(`Filtering out ${item.symbol}: no shares remaining`);
        }
        return hasShares;
      })
      .map((item) => {
        const sym = String(item.symbol ?? '').toUpperCase();
        const price = priceMap[sym] ?? item.avgPrice;
        const currentPrice = price;
        const currentValue = item.shares * currentPrice;
        const unrealizedPnL = currentValue - (item.totalInvested ?? 0);
        const unrealizedPnLPercent =
          (item.totalInvested ?? 0) > 0 ? (unrealizedPnL / (item.totalInvested ?? 1)) * 100 : 0;
        console.log(
          `${item.symbol}: ${item.shares} shares @ ${currentPrice.toFixed(2)} = ${currentValue.toFixed(
            2
          )}`
        );
        return {
          ...item,
          currentPrice: Math.round(currentPrice * 100) / 100,
          amount: Math.round(currentValue * 100) / 100,
          unrealizedPnL: Math.round(unrealizedPnL * 100) / 100,
          change: Math.round(unrealizedPnLPercent * 100) / 100,
        };
      });

    console.log('📊 Final portfolio positions:', positions.length);
    console.log('💰 Total realized P&L:', totalRealizedPnL);
    return { positions, totalRealizedPnL };
  }, [trades, priceMap]);

  const portfolioMetrics = useMemo(() => {
    if (portfolioData.positions.length === 0) {
      return {
        totalValue: 0,
        totalInvested: 0,
        totalReturns: 0,
        totalRealizedPnL: 0,
        totalDividends: 0,
        twr: 0,
        xirr: 0,
      };
    }

    const totalValue = portfolioData.positions.reduce((sum, item) => sum + item.amount, 0);
    const totalInvested = portfolioData.positions.reduce((sum, item) => sum + item.totalInvested, 0);
    const totalReturns = totalValue - totalInvested;

    const metrics = calculatePortfolioMetrics(trades);

    // Simulace dividend na základě hodnoty portfolia (2% ročně)
    const estimatedAnnualDividends = totalValue * 0.02;

    return {
      totalValue,
      totalInvested,
      totalReturns,
      totalRealizedPnL: portfolioData.totalRealizedPnL,
      totalDividends: estimatedAnnualDividends,
      twr: metrics.twr,
      xirr: metrics.xirr,
    };
  }, [portfolioData, trades]);

  const totalValue = portfolioMetrics.totalValue;
  const totalChange = portfolioMetrics.totalReturns;
  const totalChangePercent =
    portfolioMetrics.totalInvested > 0
      ? (totalChange / portfolioMetrics.totalInvested) * 100
      : 0;

  const portfolioDataWithPercentages = useMemo(() => {
    if (portfolioData.positions.length === 0) return [];

    const totalCurrentValue = portfolioData.positions.reduce((sum, item) => sum + (item.amount || 0), 0);

    console.log('📊 Portfolio percentage calculation:');
    console.log('Total current value:', totalCurrentValue);

    return portfolioData.positions.map((item) => {
      const itemValue = item.amount || 0;
      const percentage = totalCurrentValue > 0 ? (itemValue / totalCurrentValue) * 100 : 0;
      const roundedPercentage = Math.round(percentage * 10) / 10;

      console.log(
        `${item.symbol}: ${itemValue} / ${totalCurrentValue} = ${percentage.toFixed(
          2
        )}% (rounded: ${roundedPercentage}%)`
      );

      return {
        ...item,
        percentage: roundedPercentage,
      };
    });
  }, [portfolioData]);

  const convertCurrency = (
    amount: number,
    fromCurrency: Currency = 'EUR',
    toCurrency: Currency = currencyScope === 'investmentsOnly' ? investmentCurrency : currency
  ): number => {
    if (fromCurrency === toCurrency) return amount;

    const exchangeRates: Record<string, number> = {
      CZK_EUR: 0.041,
      CZK_USD: 0.044,
      EUR_CZK: 24.5,
      EUR_USD: 1.08,
      USD_CZK: 22.8,
      USD_EUR: 0.93,
      GBP_EUR: 1.17,
      GBP_USD: 1.26,
      GBP_CZK: 28.7,
      EUR_GBP: 0.85,
      USD_GBP: 0.79,
      CZK_GBP: 0.035,
    };

    const rateKey = `${fromCurrency}_${toCurrency}`;
    const rate = exchangeRates[rateKey] || 1;
    return amount * rate;
  };

  const formatCurrency = (
    amount: number,
    sourceCurrency: Currency = 'EUR',
    targetCurrency: Currency = currencyScope === 'investmentsOnly' ? investmentCurrency : currency
  ): string => {
    const convertedAmount = convertCurrency(amount, sourceCurrency, targetCurrency);
    const currencyInfo = CURRENCIES[targetCurrency];

    if (targetCurrency === 'CZK') {
      return `${convertedAmount.toLocaleString('cs-CZ')} ${currencyInfo.symbol}`;
    } else {
      return `${currencyInfo.symbol}${convertedAmount.toLocaleString('en-US', {
        maximumFractionDigits: 2,
      })}`;
    }
  };

  const handleAddTrade = () => {
    if (!tradeSymbol || !tradeName || !tradeAmount || !tradePrice) {
      Alert.alert('Chyba', 'Vyplň všechna pole');
      return;
    }

    if (!portfolio) {
      Alert.alert('Chyba', 'Portfolio nebylo nalezeno');
      return;
    }

    const amount = parseFloat(tradeAmount);
    const price = parseFloat(tradePrice);
    const total = amount * price;

    const newTrade: Trade = {
      id: Date.now().toString(),
      type: tradeType,
      symbol: tradeSymbol.toUpperCase(),
      name: tradeName,
      amount,
      price,
      date: new Date(),
      total,
    };

    addTradeToPortfolio(portfolio.id, newTrade);
    setTradeSymbol('');
    setTradeName('');
    setTradeAmount('');
    setTradePrice('');
    setShowTradeModal(false);

    Alert.alert(
      'Úspěch! 🎉',
      `${tradeType === 'buy' ? 'Nákup' : 'Prodej'} ${tradeSymbol.toUpperCase()} byl přidán do portfolia.`
    );
  };

  const handleFileImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/plain',
          'text/*',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setSelectedFile(file);
        setShowFileImportModal(true);
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Chyba', 'Nepodařilo se vybrat soubor.');
    }
  };

  const parseCSVLine = (line: string, delimiter: string = ','): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];

      if (inQuotes) {
        if (char === '"' && next === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }

    result.push(current.trim());
    return result.map((field) => {
      let cleaned = field.replace(/^"|"$/g, '').trim();
      cleaned = cleaned.replace(/^\uFEFF/, '');
      return cleaned;
    });
  };

  const processImportedFile = async () => {
    if (!selectedFile || !portfolio) return;

    setIsProcessingFile(true);

    try {
      console.log('Processing file:', selectedFile.name, selectedFile.mimeType);

      const fileName = selectedFile.name.toLowerCase();
      const isExcelFile =
        fileName.endsWith('.xlsx') ||
        fileName.endsWith('.xls') ||
        selectedFile.mimeType?.includes('spreadsheet') ||
        selectedFile.mimeType?.includes('excel');
      
      const isCsvFile =
        fileName.endsWith('.csv') ||
        selectedFile.mimeType?.includes('csv') ||
        selectedFile.mimeType?.includes('text/plain') ||
        selectedFile.mimeType?.includes('text/comma-separated-values');

      if (isCsvFile) {
        try {
          const response = await fetch(selectedFile.uri);
          const text = await response.text();
          
          const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
          if (!lines.length) {
            throw new Error('CSV soubor je prázdný.');
          }
          
          let delimiter = ',';
          const firstLine = lines[0];
          if (firstLine.split(';').length > firstLine.split(',').length) {
            delimiter = ';';
          } else if (firstLine.split('\t').length > firstLine.split(',').length) {
            delimiter = '\t';
          }
          
          const headers = parseCSVLine(lines[0], delimiter).map(h => h.replace(/\uFEFF/g, '').trim());
          const sheetRows: Record<string, any>[] = [];
          
          for (let i = 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i], delimiter);
            const rec: Record<string, string> = {};
            for (let ci = 0; ci < headers.length; ci++) {
              rec[headers[ci]] = (cols[ci] ?? '').trim();
            }
            sheetRows.push(rec);
          }

          if (!sheetRows || sheetRows.length === 0) {
            throw new Error('CSV soubor neobsahuje žádná data.');
          }

          const importedTrades: Trade[] = [];
          const skippedRows: string[] = [];
          
          console.log('Processing', sheetRows.length, 'rows from CSV');
          console.log('Sample row:', JSON.stringify(sheetRows[0], null, 2));
          
          for (let i = 0; i < sheetRows.length; i++) {
            const raw = sheetRows[i] as Record<string, any>;
            const normalized: Record<string, string> = {};
            for (const k of Object.keys(raw)) normalized[String(k).trim()] = String(raw[k] ?? '');
            try {
              const txn: Txn = mapRow(normalized);
              const action = (txn.action || '').toLowerCase();

              const isCashflow = /withdrawal|deposit|interest|dividend|fee|tax/.test(action);
              if (isCashflow) {
                skippedRows.push(`Řádek ${i + 1}: Přeskočen cashflow (${action})`);
                continue;
              }

              const shares = txn.shares ?? null;
              const price = txn.price ?? null;
              const ticker = txn.ticker ?? txn.name ?? '';

              if (!ticker) {
                skippedRows.push(`Řádek ${i + 1}: Chybí ticker/název`);
                continue;
              }
              
              if (shares == null || shares === 0) {
                skippedRows.push(`Řádek ${i + 1}: Chybí nebo nulový počet akcií (${ticker})`);
                continue;
              }
              
              if (price == null || price === 0) {
                skippedRows.push(`Řádek ${i + 1}: Chybí nebo nulová cena (${ticker})`);
                continue;
              }

              const tradeType: 'buy' | 'sell' = action.includes('sell') ? 'sell' : 'buy';
              const total = Math.abs(shares * price);

              importedTrades.push({
                id: `${Date.now()}_${i}`,
                type: tradeType,
                symbol: (txn.ticker || ticker).toUpperCase(),
                name: txn.name || ticker,
                amount: Math.abs(shares),
                price: Math.abs(price),
                date: txn.time ? new Date(txn.time) : new Date(),
                total,
              });
            } catch (err) {
              skippedRows.push(`Řádek ${i + 1}: Chyba při zpracování (${err instanceof Error ? err.message : 'neznámá chyba'})`);
              continue;
            }
          }

          console.log('Imported trades:', importedTrades.length);
          console.log('Skipped rows:', skippedRows.length);
          if (skippedRows.length > 0) {
            console.log('Skipped details:', skippedRows.slice(0, 10).join('\n'));
          }

          if (!importedTrades.length) {
            const errorDetails = skippedRows.length > 0 
              ? `\n\nPřeskočeno ${skippedRows.length} řádků:\n${skippedRows.slice(0, 5).join('\n')}${skippedRows.length > 5 ? '\n...' : ''}`
              : '';
            throw new Error(
              `Nepodařilo se najít žádné platné obchody v CSV souboru.${errorDetails}\n\n` +
              `Ujistěte se, že soubor obsahuje sloupce:\n` +
              `- Action (Market buy/Market sell)\n` +
              `- Ticker nebo Name\n` +
              `- No. of shares (počet akcií)\n` +
              `- Price / share (cena za akcii)`
            );
          }

          importedTrades.forEach((trade) => addTradeToPortfolio(portfolio.id, trade));
          setShowFileImportModal(false);
          setSelectedFile(null);

          Alert.alert(
            'Import dokončen! 📊',
            `CSV soubor byl úspěšně zpracován.\n\n` +
              `✅ Přidáno ${importedTrades.length} obchodů\n` +
              `📈 Nákupy: ${importedTrades.filter((t) => t.type === 'buy').length}\n` +
              `📉 Prodeje: ${importedTrades.filter((t) => t.type === 'sell').length}`
          );
          return;
        } catch (e) {
          throw e instanceof Error ? e : new Error('Chyba při čtení CSV souboru');
        }
      } else if (isExcelFile) {
        try {
          const response = await fetch(selectedFile.uri);
          const buffer = await response.arrayBuffer();
          const workbook = read(buffer);
          const sheetName = workbook.SheetNames.includes('Trades')
            ? 'Trades'
            : workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const sheetRows = utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

          if (!sheetRows || sheetRows.length === 0) {
            throw new Error('Excel soubor neobsahuje žádná data nebo list je prázdný.');
          }

          const headers = Object.keys(sheetRows[0] ?? {}).map((h) => String(h));

          const importedTrades: Trade[] = [];
          const skippedRows: string[] = [];
          
          console.log('Processing', sheetRows.length, 'rows from Excel');
          console.log('Sample row:', JSON.stringify(sheetRows[0], null, 2));
          
          for (let i = 0; i < sheetRows.length; i++) {
            const raw = sheetRows[i] as Record<string, any>;
            const normalized: Record<string, string> = {};
            for (const k of Object.keys(raw)) normalized[String(k).trim()] = String(raw[k] ?? '');
            try {
              const txn: Txn = mapRow(normalized);
              const action = (txn.action || '').toLowerCase();

              const isCashflow = /withdrawal|deposit|interest|dividend|fee|tax/.test(action);
              if (isCashflow) {
                skippedRows.push(`Řádek ${i + 1}: Přeskočen cashflow (${action})`);
                continue;
              }

              const shares = txn.shares ?? null;
              const price = txn.price ?? null;
              const ticker = txn.ticker ?? txn.name ?? '';

              if (!ticker) {
                skippedRows.push(`Řádek ${i + 1}: Chybí ticker/název`);
                continue;
              }
              
              if (shares == null || shares === 0) {
                skippedRows.push(`Řádek ${i + 1}: Chybí nebo nulový počet akcií (${ticker})`);
                continue;
              }
              
              if (price == null || price === 0) {
                skippedRows.push(`Řádek ${i + 1}: Chybí nebo nulová cena (${ticker})`);
                continue;
              }

              const tradeType: 'buy' | 'sell' = action.includes('sell') ? 'sell' : 'buy';
              const total = Math.abs(shares * price);

              importedTrades.push({
                id: `${Date.now()}_${i}`,
                type: tradeType,
                symbol: (txn.ticker || ticker).toUpperCase(),
                name: txn.name || ticker,
                amount: Math.abs(shares),
                price: Math.abs(price),
                date: txn.time ? new Date(txn.time) : new Date(),
                total,
              });
            } catch (err) {
              skippedRows.push(`Řádek ${i + 1}: Chyba při zpracování (${err instanceof Error ? err.message : 'neznámá chyba'})`);
              continue;
            }
          }

          console.log('Imported trades:', importedTrades.length);
          console.log('Skipped rows:', skippedRows.length);
          if (skippedRows.length > 0) {
            console.log('Skipped details:', skippedRows.slice(0, 10).join('\n'));
          }

          if (!importedTrades.length) {
            const errorDetails = skippedRows.length > 0 
              ? `\n\nPřeskočeno ${skippedRows.length} řádků:\n${skippedRows.slice(0, 5).join('\n')}${skippedRows.length > 5 ? '\n...' : ''}`
              : '';
            throw new Error(
              `Nepodařilo se najít žádné platné obchody v Excel souboru.${errorDetails}\n\n` +
              `Ujistěte se, že soubor obsahuje sloupce:\n` +
              `- Action (Market buy/Market sell)\n` +
              `- Ticker nebo Name\n` +
              `- No. of shares (počet akcií)\n` +
              `- Price / share (cena za akcii)`
            );
          }

          importedTrades.forEach((trade) => addTradeToPortfolio(portfolio.id, trade));
          setShowFileImportModal(false);
          setSelectedFile(null);

          Alert.alert(
            'Import dokončen! 📊',
            `Výpis (${sheetName}) byl úspěšně zpracován.\n\n` +
              `✅ Přidáno ${importedTrades.length} obchodů\n` +
              `📈 Nákupy: ${importedTrades.filter((t) => t.type === 'buy').length}\n` +
              `📉 Prodeje: ${importedTrades.filter((t) => t.type === 'sell').length}`
          );
          return;
        } catch (e) {
          throw e instanceof Error ? e : new Error('Chyba při čtení Excel souboru');
        }
      }

      Alert.alert('Chyba', 'Podporovány jsou pouze CSV a Excel soubory (.csv, .xlsx, .xls)');
    } catch (error) {
      console.error('Error processing file:', error);
      Alert.alert(
        'Chyba při zpracování souboru',
        `Nepodařilo se zpracovat soubor: ${
          error instanceof Error ? error.message : 'Neznámá chyba'
        }`
      );
    } finally {
      setIsProcessingFile(false);
    }
  };

  if (!portfolio) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Portfolio nebylo nalezeno</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Zpět</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const PortfolioItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => {
        router.push({
          pathname: '/asset/[symbol]',
          params: {
            symbol: String(item.symbol ?? '').toUpperCase(),
            name: String(item.name ?? item.symbol ?? ''),
            shares: String(item.shares ?? 0),
            avgPrice: String(item.avgPrice ?? 0),
            totalInvested: String(item.totalInvested ?? 0),
          },
        });
      }}
      style={styles.portfolioItem}
      testID={`portfolioItem-${String(item.symbol ?? '').toUpperCase()}`}
    >
      <View style={styles.portfolioHeader}>
        <View style={styles.portfolioInfo}>
          <View style={[styles.colorIndicator, { backgroundColor: item.color }]} />
          <View>
            <Text style={styles.portfolioName}>{item.name}</Text>
            <Text style={styles.portfolioSymbol}>{item.symbol}</Text>
          </View>
        </View>
        <View style={styles.portfolioValues}>
          <Text style={styles.portfolioAmount}>{formatCurrency(item.amount, 'EUR')}</Text>
          <View style={styles.changeContainer}>
            {item.change >= 0 ? (
              <TrendingUp color="#10B981" size={14} />
            ) : (
              <TrendingDown color="#EF4444" size={14} />
            )}
            <Text
              style={[styles.changeText, { color: item.change >= 0 ? '#10B981' : '#EF4444' }]}
            >
              {item.change >= 0 ? '+' : ''}
              {item.change.toFixed(2)}%
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            { width: `${item.percentage}%`, backgroundColor: item.color },
          ]}
        />
      </View>
      <View style={styles.portfolioFooter}>
        <Text style={styles.percentageText}>{item.percentage}% portfolia</Text>
        <Text style={styles.sharesText}>
          {item.shares.toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} ks
        </Text>
      </View>
    </TouchableOpacity>
  );

  const DonutChart = ({ data, totalValue }: { data: any[]; totalValue: number }) => {
    const size = 200;
    const strokeWidth = 40;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const centerX = size / 2;
    const centerY = size / 2;

    let currentAngle = -90;
    const slices = data.slice(0, 5).map((item) => {
      const percentage = item.percentage;
      const angle = (percentage / 100) * 360;
      const slice = {
        color: item.color,
        percentage,
        startAngle: currentAngle,
        angle,
      };
      currentAngle += angle;
      return slice;
    });

    if (data.length > 5) {
      const othersPercentage = data
        .slice(5)
        .reduce((sum, item) => sum + item.percentage, 0);
      slices.push({
        color: '#9CA3AF',
        percentage: othersPercentage,
        startAngle: currentAngle,
        angle: (othersPercentage / 100) * 360,
      });
    }

    return (
      <View style={styles.donutChartContainer}>
        <Svg width={size} height={size}>
          <G rotation="0" origin={`${centerX}, ${centerY}`}>
            {slices.map((slice, index) => {
              const strokeDashoffset =
                circumference - (slice.angle / 360) * circumference;
              const rotation = slice.startAngle + 90;

              return (
                <Circle
                  key={index}
                  cx={centerX}
                  cy={centerY}
                  r={radius}
                  stroke={slice.color}
                  strokeWidth={strokeWidth}
                  fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  rotation={rotation}
                  origin={`${centerX}, ${centerY}`}
                  strokeLinecap="round"
                />
              );
            })}
          </G>
        </Svg>
        <View style={styles.donutChartCenter}>
          <Text style={styles.donutChartValue}>{formatCurrency(totalValue, 'EUR')}</Text>
          <Text style={styles.donutChartLabel}>Celková hodnota</Text>
        </View>
      </View>
    );
  };

  const TradeCard = ({ trade }: { trade: Trade }) => (
    <View style={styles.tradeCard}>
      <View style={styles.tradeHeader}>
        <View style={styles.tradeInfo}>
          <View
            style={[
              styles.tradeTypeIndicator,
              { backgroundColor: trade.type === 'buy' ? '#10B981' : '#EF4444' },
            ]}
          />
          <View style={styles.tradeMainInfo}>
            <Text style={styles.tradeSymbol}>{trade.symbol}</Text>
            <Text style={styles.tradeName}>{trade.name}</Text>
          </View>
        </View>
        <View style={styles.tradeActions}>
          <TouchableOpacity
            style={styles.tradeActionButton}
            onPress={() => {
              console.log('Attempting to delete trade:', trade.id, trade.symbol);
              Alert.alert(
                'Smazat obchod',
                `Opravdu chceš smazat ${
                  trade.type === 'buy' ? 'nákup' : 'prodej'
                } ${trade.symbol}?`,
                [
                  { text: 'Zrušit', style: 'cancel' },
                  {
                    text: 'Smazat',
                    style: 'destructive',
                    onPress: () => {
                      console.log('Deleting trade:', trade.id);
                      if (portfolio) {
                        removeTradeFromPortfolio(portfolio.id, trade.id);
                      }
                    },
                  },
                ]
              );
            }}
          >
            <Trash2 color="#EF4444" size={16} />
          </TouchableOpacity>
          <View style={styles.tradeValues}>
            <Text style={styles.tradeTotal}>
              {trade.type === 'buy' ? '-' : '+'}
              {formatCurrency(trade.total, 'EUR')}
            </Text>
            <Text style={styles.tradeDate}>{trade.date.toLocaleDateString('cs-CZ')}</Text>
          </View>
        </View>
      </View>
      <View style={styles.tradeDetails}>
        <Text style={styles.tradeDetailText}>
          {trade.amount} ks × {formatCurrency(trade.price, 'EUR')}
        </Text>
        <View
          style={[
            styles.tradeTypeBadge,
            { backgroundColor: trade.type === 'buy' ? '#10B981' : '#EF4444' },
          ]}
        >
          <Text style={styles.tradeTypeText}>{trade.type === 'buy' ? 'NÁKUP' : 'PRODEJ'}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[portfolio.color, portfolio.color + 'CC']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity style={styles.backIconButton} onPress={() => router.back()}>
            <ArrowLeft color="white" size={24} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{portfolio.name}</Text>
            <Text style={styles.headerSubtitle}>{portfolio.currency || 'CZK'}</Text>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
            <Plus color="white" size={24} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={styles.totalValueContainer}>
        <View style={styles.totalValueCard}>
          <LinearGradient
            colors={
              totalChangePercent >= 0 ? ['#10B981', '#059669'] : ['#EF4444', '#DC2626']
            }
            style={styles.totalValueGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.totalValueLabel}>Celková hodnota portfolia</Text>
            <Text style={styles.totalValueAmount}>{formatCurrency(totalValue, 'EUR')}</Text>
            <View style={styles.totalChangeContainer}>
              {totalChangePercent >= 0 ? (
                <TrendingUp color="white" size={16} />
              ) : (
                <TrendingDown color="white" size={16} />
              )}
              <Text style={styles.totalChangeText}>
                {totalChangePercent >= 0 ? '+' : ''}
                {totalChangePercent.toFixed(2)}%
              </Text>
              <Text style={styles.totalChangeAmount}>
                ({totalChangePercent >= 0 ? '+' : ''}
                {formatCurrency(totalChange, 'EUR')})
              </Text>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricCardSmall}>
            <View style={styles.metricIconContainer}>
              <DollarSign color="#10B981" size={20} />
            </View>
            <Text style={styles.metricCardLabel}>Investováno</Text>
            <Text style={styles.metricCardValue}>
              {formatCurrency(portfolioMetrics.totalInvested, 'EUR')}
            </Text>
          </View>

          <View style={styles.metricCardSmall}>
            <View style={styles.metricIconContainer}>
              <TrendingUp color="#667eea" size={20} />
            </View>
            <Text style={styles.metricCardLabel}>Nerealizovaný zisk</Text>
            <Text style={[styles.metricCardValue, { color: totalChange >= 0 ? '#10B981' : '#EF4444' }]}>
              {totalChange >= 0 ? '+' : ''}{formatCurrency(totalChange, 'EUR')}
            </Text>
          </View>

          <View style={styles.metricCardSmall}>
            <View style={styles.metricIconContainer}>
              <Percent color="#8B5CF6" size={20} />
            </View>
            <Text style={styles.metricCardLabel}>Roční výnos</Text>
            <Text style={[styles.metricCardValue, { color: portfolioMetrics.xirr >= 0 ? '#10B981' : '#EF4444' }]}>
              {portfolioMetrics.xirr >= 0 ? '+' : ''}{(portfolioMetrics.xirr * 100).toFixed(2)}%
            </Text>
          </View>

          <View style={styles.metricCardSmall}>
            <View style={styles.metricIconContainer}>
              <TrendingDown color="#F59E0B" size={20} />
            </View>
            <Text style={styles.metricCardLabel}>Realizovaný zisk</Text>
            <Text style={[styles.metricCardValue, { color: portfolioMetrics.totalRealizedPnL >= 0 ? '#10B981' : '#EF4444' }]}>
              {portfolioMetrics.totalRealizedPnL >= 0 ? '+' : ''}{formatCurrency(portfolioMetrics.totalRealizedPnL, 'EUR')}
            </Text>
          </View>

          <View style={styles.metricCardSmall}>
            <View style={styles.metricIconContainer}>
              <DollarSign color="#8B5CF6" size={20} />
            </View>
            <Text style={styles.metricCardLabel}>Dividendy (roční)</Text>
            <Text style={[styles.metricCardValue, { color: '#10B981' }]}>
              +{formatCurrency(portfolioMetrics.totalDividends, 'EUR')}
            </Text>
          </View>

          <View style={styles.metricCardSmall}>
            <View style={styles.metricIconContainer}>
              <ArrowRightLeft color="#06B6D4" size={20} />
            </View>
            <Text style={styles.metricCardLabel}>Měnový dopad</Text>
            <Text style={[styles.metricCardValue, { color: '#EF4444' }]}>
              -{formatCurrency(totalValue * 0.005, 'EUR')}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.tabButton, selectedTab === 'portfolio' && styles.tabButtonActive]}
          onPress={() => setSelectedTab('portfolio')}
        >
          <PieChart
            color={selectedTab === 'portfolio' ? 'white' : '#6B7280'}
            size={16}
          />
          <Text
            style={[
              styles.tabButtonText,
              selectedTab === 'portfolio' && styles.tabButtonTextActive,
            ]}
          >
            Portfolio
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, selectedTab === 'performance' && styles.tabButtonActive]}
          onPress={() => setSelectedTab('performance')}
        >
          <TrendingUp
            color={selectedTab === 'performance' ? 'white' : '#6B7280'}
            size={16}
          />
          <Text
            style={[
              styles.tabButtonText,
              selectedTab === 'performance' && styles.tabButtonTextActive,
            ]}
          >
            Výkonnost
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, selectedTab === 'trades' && styles.tabButtonActive]}
          onPress={() => setSelectedTab('trades')}
        >
          <ShoppingCart
            color={selectedTab === 'trades' ? 'white' : '#6B7280'}
            size={16}
          />
          <Text
            style={[
              styles.tabButtonText,
              selectedTab === 'trades' && styles.tabButtonTextActive,
            ]}
          >
            Obchody
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {selectedTab === 'performance' ? (
          <View style={styles.performanceContainer}>
            {portfolioDataWithPercentages.length > 0 && (
              <View style={styles.performanceCard}>
                <View style={styles.performanceHeader}>
                  <PieChart color="#667eea" size={24} />
                  <Text style={styles.performanceTitle}>Typy aktiv</Text>
                </View>
                <View style={styles.chartContainer}>
                  <DonutChart data={portfolioDataWithPercentages} totalValue={totalValue} />
                  <View style={styles.chartLegend}>
                    {portfolioDataWithPercentages.slice(0, 5).map((item, index) => (
                      <View key={index} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                        <Text style={styles.legendLabel}>{item.symbol}</Text>
                        <Text style={styles.legendValue}>{item.percentage}%</Text>
                      </View>
                    ))}
                    {portfolioDataWithPercentages.length > 5 && (
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#9CA3AF' }]} />
                        <Text style={styles.legendLabel}>Ostatní</Text>
                        <Text style={styles.legendValue}>
                          {portfolioDataWithPercentages
                            .slice(5)
                            .reduce((sum, item) => sum + item.percentage, 0)
                            .toFixed(1)}%
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}
            <View style={styles.performanceCard}>
              <View style={styles.performanceHeader}>
                <DollarSign color="#10B981" size={24} />
                <Text style={styles.performanceTitle}>Zisk / Ztráta</Text>
              </View>
              <View style={styles.performanceMetrics}>
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Celkový zisk/ztráta:</Text>
                  <Text
                    style={[
                      styles.metricValue,
                      { color: totalChange >= 0 ? '#10B981' : '#EF4444' },
                    ]}
                  >
                    {totalChange >= 0 ? '+' : ''}
                    {formatCurrency(totalChange, 'EUR')}
                  </Text>
                </View>
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Procentuální výnos:</Text>
                  <Text
                    style={[
                      styles.metricValue,
                      { color: totalChangePercent >= 0 ? '#10B981' : '#EF4444' },
                    ]}
                  >
                    {totalChangePercent >= 0 ? '+' : ''}
                    {totalChangePercent.toFixed(2)}%
                  </Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Investováno:</Text>
                  <Text style={styles.metricValue}>
                    {formatCurrency(portfolioMetrics.totalInvested, 'EUR')}
                  </Text>
                </View>
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Současná hodnota:</Text>
                  <Text style={styles.metricValue}>
                    {formatCurrency(portfolioMetrics.totalValue, 'EUR')}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.performanceCard}>
              <View style={styles.performanceHeader}>
                <Percent color="#8B5CF6" size={24} />
                <Text style={styles.performanceTitle}>Výkonnostní metriky</Text>
              </View>
              <View style={styles.performanceMetrics}>
                <View style={styles.metricRow}>
                  <View style={styles.metricLabelContainer}>
                    <Text style={styles.metricLabel}>TWR (Time-Weighted Return):</Text>
                    <Text style={styles.metricDescription}>
                      Výnos nezávislý na vkladech/výběrech
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.metricValue,
                      { color: portfolioMetrics.twr >= 0 ? '#10B981' : '#EF4444' },
                    ]}
                  >
                    {portfolioMetrics.twr >= 0 ? '+' : ''}
                    {(portfolioMetrics.twr * 100).toFixed(2)}%
                  </Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricRow}>
                  <View style={styles.metricLabelContainer}>
                    <Text style={styles.metricLabel}>XIRR (Roční výnos):</Text>
                    <Text style={styles.metricDescription}>
                      Anualizovaný výnos portfolia
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.metricValue,
                      { color: portfolioMetrics.xirr >= 0 ? '#10B981' : '#EF4444' },
                    ]}
                  >
                    {portfolioMetrics.xirr >= 0 ? '+' : ''}
                    {(portfolioMetrics.xirr * 100).toFixed(2)}% p.a.
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.performanceCard}>
              <View style={styles.performanceHeader}>
                <AlertCircle color="#F59E0B" size={24} />
                <Text style={styles.performanceTitle}>Daňové informace</Text>
              </View>
              <View style={styles.performanceMetrics}>
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Zdanitelný zisk:</Text>
                  <Text
                    style={[
                      styles.metricValue,
                      { color: totalChange >= 0 ? '#F59E0B' : '#6B7280' },
                    ]}
                  >
                    {totalChange >= 0 ? formatCurrency(totalChange, 'EUR') : 'Žádný'}
                  </Text>
                </View>
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Odhadovaná daň (15%):</Text>
                  <Text style={styles.metricValue}>
                    {totalChange >= 0
                      ? formatCurrency(totalChange * 0.15, 'EUR')
                      : formatCurrency(0, 'EUR')}
                  </Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.taxInfoBox}>
                  <AlertCircle color="#F59E0B" size={16} />
                  <Text style={styles.taxInfoText}>
                    {totalChange >= 0
                      ? 'Zisky z prodeje akcií podléhají dani z příjmu 15%. Pokud držíte akcie déle než 3 roky, můžete být osvobozeni od daně.'
                      : 'Aktuálně nemáte realizované zisky podléhající zdanění.'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.performanceCard}>
              <View style={styles.performanceHeader}>
                <ArrowRightLeft color="#06B6D4" size={24} />
                <Text style={styles.performanceTitle}>Měnové konverze</Text>
              </View>
              <View style={styles.performanceMetrics}>
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Měna portfolia:</Text>
                  <Text style={styles.metricValue}>{portfolio.currency || 'EUR'}</Text>
                </View>
                <View style={styles.metricRow}>
                  <Text style={styles.metricLabel}>Zobrazovací měna:</Text>
                  <Text style={styles.metricValue}>
                    {currencyScope === 'investmentsOnly' ? investmentCurrency : currency}
                  </Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricRow}>
                  <View style={styles.metricLabelContainer}>
                    <Text style={styles.metricLabel}>Ztráta na konverzi:</Text>
                    <Text style={styles.metricDescription}>
                      Odhadovaný rozdíl při směně měn
                    </Text>
                  </View>
                  <Text style={[styles.metricValue, { color: '#EF4444' }]}>
                    ~{formatCurrency(totalValue * 0.005, 'EUR')}
                  </Text>
                </View>
                <View style={styles.currencyInfoBox}>
                  <ArrowRightLeft color="#06B6D4" size={16} />
                  <Text style={styles.currencyInfoText}>
                    Při převodu mezi měnami obvykle ztrácíte 0.5-2% na směnném kurzu a
                    poplatcích. Doporučujeme minimalizovat konverze.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : selectedTab === 'portfolio' ? (
          <View style={styles.portfolioContainer}>
            {portfolioData.positions.length === 0 ? (
              <View style={styles.emptyState}>
                <PieChart color="#9CA3AF" size={48} />
                <Text style={styles.emptyStateTitle}>Žádné investice</Text>
                <Text style={styles.emptyStateText}>
                  Přidej své první investice pomocí tlačítka nahoře
                </Text>
              </View>
            ) : (
              portfolioDataWithPercentages.map((item, index) => (
                <PortfolioItem key={index} item={item} />
              ))
            )}
          </View>
        ) : (
          <View style={styles.tradesContainer}>
            {trades.length === 0 ? (
              <View style={styles.emptyState}>
                <ShoppingCart color="#9CA3AF" size={48} />
                <Text style={styles.emptyStateTitle}>Žádné obchody</Text>
                <Text style={styles.emptyStateText}>Přidej svůj první nákup nebo prodej</Text>
              </View>
            ) : (
              <>
                <View style={styles.tradesHeader}>
                  <Text style={styles.tradesHeaderTitle}>Všechny obchody ({trades.length})</Text>
                </View>
                {trades.map((trade) => (
                  <TradeCard key={trade.id} trade={trade} />
                ))}
              </>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#8B5CF6', '#7C3AED']}
            style={styles.modalHeader}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.modalHeaderContent}>
              <TouchableOpacity onPress={() => setShowAddModal(false)} style={styles.closeButton}>
                <X color="white" size={24} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Přidat investici</Text>
              <View style={styles.modalProgress} />
            </View>
          </LinearGradient>

          <View style={styles.modalContent}>
            <View style={styles.addOptionsContainer}>
              <TouchableOpacity
                style={styles.addOptionCard}
                onPress={() => {
                  setShowAddModal(false);
                  setShowTradeModal(true);
                }}
              >
                <LinearGradient
                  colors={['#10B981', '#059669']}
                  style={styles.addOptionGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <ShoppingCart color="white" size={32} />
                  <Text style={styles.addOptionTitle}>Nový obchod</Text>
                  <Text style={styles.addOptionDescription}>
                    Přidej nákup nebo prodej akcií/ETF
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.addOptionCard}
                onPress={() => {
                  setShowAddModal(false);
                  setShowSuggestedModal(true);
                }}
              >
                <LinearGradient
                  colors={['#8B5CF6', '#7C3AED']}
                  style={styles.addOptionGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <TrendingUp color="white" size={32} />
                  <Text style={styles.addOptionTitle}>Doporučené investice</Text>
                  <Text style={styles.addOptionDescription}>
                    Vyberte z S&P 500, BTC a dalších
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.addOptionCard}
                onPress={() => {
                  setShowAddModal(false);
                  setTimeout(() => {
                    handleFileImport();
                  }, 300);
                }}
              >
                <LinearGradient
                  colors={['#3B82F6', '#2563EB']}
                  style={styles.addOptionGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Upload color="white" size={32} />
                  <Text style={styles.addOptionTitle}>Import portfolia</Text>
                  <Text style={styles.addOptionDescription}>Nahraj výpis z brokera</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showTradeModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#10B981', '#059669']}
            style={styles.modalHeader}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.modalHeaderContent}>
              <TouchableOpacity onPress={() => setShowTradeModal(false)} style={styles.closeButton}>
                <X color="white" size={24} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Nový obchod</Text>
              <View style={styles.modalProgress} />
            </View>
          </LinearGradient>

          <ScrollView style={styles.modalContent}>
            <View style={styles.tradeTypeSelector}>
              <TouchableOpacity
                style={[
                  styles.tradeTypeButton,
                  tradeType === 'buy' && styles.tradeTypeButtonActive,
                ]}
                onPress={() => setTradeType('buy')}
              >
                <Plus color={tradeType === 'buy' ? 'white' : '#10B981'} size={20} />
                <Text
                  style={[
                    styles.tradeTypeButtonText,
                    tradeType === 'buy' && styles.tradeTypeButtonTextActive,
                  ]}
                >
                  Nákup
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.tradeTypeButton,
                  tradeType === 'sell' && styles.tradeTypeButtonActive,
                ]}
                onPress={() => setTradeType('sell')}
              >
                <Minus color={tradeType === 'sell' ? 'white' : '#EF4444'} size={20} />
                <Text
                  style={[
                    styles.tradeTypeButtonText,
                    tradeType === 'sell' && styles.tradeTypeButtonTextActive,
                  ]}
                >
                  Prodej
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Symbol (např. AAPL, SPY)</Text>
                <TextInput
                  style={styles.textInput}
                  value={tradeSymbol}
                  onChangeText={setTradeSymbol}
                  placeholder="AAPL"
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Název</Text>
                <TextInput
                  style={styles.textInput}
                  value={tradeName}
                  onChangeText={setTradeName}
                  placeholder="Apple Inc."
                />
              </View>

              <View style={styles.inputRow}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.inputLabel}>Množství</Text>
                  <TextInput
                    style={styles.textInput}
                    value={tradeAmount}
                    onChangeText={setTradeAmount}
                    placeholder="10"
                    keyboardType="numeric"
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.inputLabel}>
                    Cena za kus ({CURRENCIES[currency].symbol})
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    value={tradePrice}
                    onChangeText={setTradePrice}
                    placeholder="4500"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {tradeAmount && tradePrice && (
                <View style={styles.totalContainer}>
                  <Text style={styles.totalLabel}>Celková částka:</Text>
                  <Text style={styles.totalAmount}>
                    {formatCurrency(parseFloat(tradeAmount) * parseFloat(tradePrice), 'EUR')}
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.submitButton} onPress={handleAddTrade}>
              <LinearGradient
                colors={
                  tradeType === 'buy' ? ['#10B981', '#059669'] : ['#EF4444', '#DC2626']
                }
                style={styles.submitButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.submitButtonText}>
                  {tradeType === 'buy' ? 'Přidat nákup' : 'Přidat prodej'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showSuggestedModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#8B5CF6', '#7C3AED']}
            style={styles.modalHeader}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.modalHeaderContent}>
              <TouchableOpacity
                onPress={() => setShowSuggestedModal(false)}
                style={styles.closeButton}
              >
                <X color="white" size={24} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Doporučené investice</Text>
              <View style={styles.modalProgress} />
            </View>
          </LinearGradient>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.suggestedDescription}>
              Vyberte z populárních investic a rychle je přidejte do svého portfolia:
            </Text>

            <View style={styles.suggestedContainer}>
              {SUGGESTED_INVESTMENTS.map((investment, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.suggestedItem}
                  onPress={() => {
                    setTradeSymbol(investment.symbol);
                    setTradeName(investment.name);
                    setShowSuggestedModal(false);
                    setShowTradeModal(true);
                  }}
                >
                  <View style={styles.suggestedItemContent}>
                    <View
                      style={[styles.colorIndicator, { backgroundColor: investment.color }]}
                    />
                    <View style={styles.suggestedItemInfo}>
                      <Text style={styles.suggestedItemName}>{investment.name}</Text>
                      <Text style={styles.suggestedItemSymbol}>{investment.symbol}</Text>
                      <Text style={styles.suggestedItemDescription}>
                        {investment.description}
                      </Text>
                    </View>
                    <Plus color="#6B7280" size={20} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showFileImportModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#3B82F6', '#2563EB']}
            style={styles.modalHeader}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.modalHeaderContent}>
              <TouchableOpacity
                onPress={() => {
                  setShowFileImportModal(false);
                  setSelectedFile(null);
                }}
                style={styles.closeButton}
              >
                <X color="white" size={24} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Import z výpisu</Text>
              <View style={styles.modalProgress} />
            </View>
          </LinearGradient>

          <ScrollView style={styles.modalContent}>
            <View style={styles.fileImportContainer}>
              <View style={styles.fileImportCard}>
                <FileText color="#3B82F6" size={48} />
                <Text style={styles.fileImportTitle}>Výpis z brokera</Text>

                {selectedFile ? (
                  <View style={styles.selectedFileInfo}>
                    <Text style={styles.selectedFileName}>{selectedFile.name}</Text>
                    <Text style={styles.selectedFileSize}>
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </Text>
                    <Text style={styles.selectedFileType}>
                      {selectedFile.mimeType || 'Neznámý typ'}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.fileImportDescription}>
                    Vyberte soubor s výpisem nákupů a prodejů z vašeho brokera
                  </Text>
                )}

                <View style={styles.supportedFormatsContainer}>
                  <Text style={styles.supportedFormatsTitle}>Podporované brokery:</Text>
                  <Text style={styles.supportedFormatsText}>
                    • Trading212 - historie transakcí
                  </Text>
                  <Text style={styles.supportedFormatsNote}>📄 Formáty: CSV, XLSX (Excel)</Text>
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            {selectedFile ? (
              <TouchableOpacity
                style={styles.submitButton}
                onPress={processImportedFile}
                disabled={isProcessingFile}
              >
                <LinearGradient
                  colors={['#3B82F6', '#2563EB']}
                  style={styles.submitButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.submitButtonText}>
                    {isProcessingFile ? 'Zpracovávám...' : 'Zpracovat výpis'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.submitButton} onPress={handleFileImport}>
                <LinearGradient
                  colors={['#6B7280', '#4B5563']}
                  style={styles.submitButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.submitButtonText}>Vybrat soubor</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: 'white',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalValueContainer: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
  },
  totalValueCard: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  totalValueGradient: {
    padding: 24,
    alignItems: 'center',
  },
  totalValueLabel: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    marginBottom: 8,
  },
  totalValueAmount: {
    fontSize: 32,
    fontWeight: 'bold' as const,
    color: 'white',
    marginBottom: 12,
  },
  totalChangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalChangeText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: 'white',
    marginLeft: 6,
    marginRight: 8,
  },
  totalChangeAmount: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
  },
  tabSelector: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabButtonActive: {
    backgroundColor: '#667eea',
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#6B7280',
    marginLeft: 4,
  },
  tabButtonTextActive: {
    color: 'white',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  portfolioContainer: {
    gap: 16,
    paddingBottom: 32,
  },
  portfolioItem: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  portfolioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  portfolioInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  portfolioName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 2,
  },
  portfolioSymbol: {
    fontSize: 12,
    color: '#6B7280',
  },
  portfolioValues: {
    alignItems: 'flex-end',
  },
  portfolioAmount: {
    fontSize: 16,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginBottom: 4,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changeText: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginLeft: 4,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  portfolioFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  percentageText: {
    fontSize: 12,
    color: '#6B7280',
  },
  sharesText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600' as const,
  },
  tradesContainer: {
    gap: 16,
    paddingBottom: 32,
  },
  tradeCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  tradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tradeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tradeMainInfo: {
    flex: 1,
  },
  tradeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tradeActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tradeTypeIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  tradeSymbol: {
    fontSize: 16,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginBottom: 2,
  },
  tradeName: {
    fontSize: 12,
    color: '#6B7280',
  },
  tradeValues: {
    alignItems: 'flex-end',
  },
  tradeTotal: {
    fontSize: 16,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginBottom: 2,
  },
  tradeDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  tradeDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tradeDetailText: {
    fontSize: 14,
    color: '#6B7280',
  },
  tradeTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tradeTypeText: {
    fontSize: 10,
    fontWeight: 'bold' as const,
    color: 'white',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 32,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  modalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: 'white',
    flex: 1,
    textAlign: 'center',
  },
  modalProgress: {
    width: 40,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  addOptionsContainer: {
    gap: 16,
  },
  addOptionCard: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  addOptionGradient: {
    padding: 24,
    alignItems: 'center',
  },
  addOptionTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: 'white',
    marginTop: 12,
    marginBottom: 8,
  },
  addOptionDescription: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    textAlign: 'center',
  },
  tradeTypeSelector: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 12,
  },
  tradeTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  tradeTypeButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  tradeTypeButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#6B7280',
    marginLeft: 6,
  },
  tradeTypeButtonTextActive: {
    color: 'white',
  },
  formContainer: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#374151',
  },
  textInput: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inputRow: {
    flexDirection: 'row',
  },
  totalContainer: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#374151',
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#10B981',
  },
  modalFooter: {
    padding: 20,
  },
  submitButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  submitButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: 'white',
  },
  tradesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tradesHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#1F2937',
  },
  suggestedDescription: {
    fontSize: 16,
    color: '#4B5563',
    lineHeight: 24,
    marginBottom: 24,
    textAlign: 'center',
  },
  suggestedContainer: {
    gap: 12,
  },
  suggestedItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  suggestedItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  suggestedItemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  suggestedItemName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 2,
  },
  suggestedItemSymbol: {
    fontSize: 12,
    fontWeight: 'bold' as const,
    color: '#6B7280',
    marginBottom: 4,
  },
  suggestedItemDescription: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  fileImportContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  fileImportCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  fileImportTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  fileImportDescription: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  selectedFileInfo: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    width: '100%',
  },
  selectedFileName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 4,
    textAlign: 'center',
  },
  selectedFileSize: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  selectedFileType: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  supportedFormatsContainer: {
    alignSelf: 'stretch',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  supportedFormatsTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#374151',
    marginBottom: 8,
  },
  supportedFormatsText: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  supportedFormatsNote: {
    fontSize: 12,
    color: '#F59E0B',
    marginTop: 8,
    fontWeight: '600' as const,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#EF4444',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  performanceContainer: {
    gap: 16,
    paddingBottom: 32,
  },
  performanceCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  performanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  performanceTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginLeft: 12,
  },
  performanceMetrics: {
    gap: 12,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
  metricLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500' as const,
  },
  metricDescription: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 'bold' as const,
    color: '#1F2937',
  },
  metricDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  taxInfoBox: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  taxInfoText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 18,
  },
  currencyInfoBox: {
    flexDirection: 'row',
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  currencyInfoText: {
    flex: 1,
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 18,
  },
  chartContainer: {
    gap: 24,
  },
  donutChartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
    alignSelf: 'center',
    marginVertical: 16,
  },
  donutChartCenter: {
    position: 'absolute' as const,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutChartValue: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginBottom: 4,
  },
  donutChartLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  chartLegend: {
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendLabel: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    fontWeight: '500' as const,
  },
  legendValue: {
    fontSize: 14,
    fontWeight: 'bold' as const,
    color: '#1F2937',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 16,
  },
  metricCardSmall: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  metricIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  metricCardLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 6,
    fontWeight: '500' as const,
  },
  metricCardValue: {
    fontSize: 16,
    fontWeight: 'bold' as const,
    color: '#1F2937',
  },
});
