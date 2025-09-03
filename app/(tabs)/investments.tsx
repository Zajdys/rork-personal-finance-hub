import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as DocumentPicker from 'expo-document-picker';
import {
  TrendingUp,
  TrendingDown,
  PieChart,
  DollarSign,
  Target,
  AlertCircle,
  Plus,
  BarChart3,
  X,
  Upload,
  ShoppingCart,
  Minus,
  Trash2,
  Edit3,
  FileText,
} from 'lucide-react-native';

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

const RECOMMENDATIONS = [
  {
    title: 'Diverzifikuj více',
    description: 'Máš příliš mnoho v S&P 500. Zvaž přidání emerging markets.',
    type: 'warning',
    icon: AlertCircle,
  },
  {
    title: 'Rebalancování',
    description: 'Tvé portfolio se odchýlilo od cílové alokace o více než 5%.',
    type: 'info',
    icon: Target,
  },
  {
    title: 'Dollar Cost Averaging',
    description: 'Pravidelně investuj každý měsíc stejnou částku.',
    type: 'tip',
    icon: TrendingUp,
  },
];

interface Trade {
  id: string;
  type: 'buy' | 'sell';
  symbol: string;
  name: string;
  amount: number;
  price: number;
  date: Date;
  total: number;
}

export default function InvestmentsScreen() {
  const [selectedTab, setSelectedTab] = useState<'portfolio' | 'recommendations' | 'trades'>('portfolio');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showTradeModal, setShowTradeModal] = useState<boolean>(false);
  const [showAnalysisModal, setShowAnalysisModal] = useState<boolean>(false);
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [tradeSymbol, setTradeSymbol] = useState<string>('');
  const [tradeName, setTradeName] = useState<string>('');
  const [tradeAmount, setTradeAmount] = useState<string>('');
  const [tradePrice, setTradePrice] = useState<string>('');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [showSuggestedModal, setShowSuggestedModal] = useState<boolean>(false);
  const [showFileImportModal, setShowFileImportModal] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);

  // Výpočet portfolia z obchodů
  const portfolioData = trades.reduce((acc, trade) => {
    const existing = acc.find(item => item.symbol === trade.symbol);
    if (existing) {
      if (trade.type === 'buy') {
        existing.amount += trade.total;
        existing.shares += trade.amount;
      } else {
        existing.amount -= trade.total;
        existing.shares -= trade.amount;
      }
    } else {
      acc.push({
        symbol: trade.symbol,
        name: trade.name,
        amount: trade.type === 'buy' ? trade.total : -trade.total,
        shares: trade.type === 'buy' ? trade.amount : -trade.amount,
        color: SUGGESTED_INVESTMENTS.find(s => s.symbol === trade.symbol)?.color || '#6B7280',
      });
    }
    return acc;
  }, [] as any[]);

  const totalValue = portfolioData.reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const totalChange = Math.random() * 1000 - 500; // Simulace změny
  const totalChangePercent = totalValue > 0 ? (totalChange / totalValue) * 100 : 0;

  // Přidání procent pro každou položku portfolia
  portfolioData.forEach(item => {
    item.percentage = totalValue > 0 ? Math.round((Math.abs(item.amount) / totalValue) * 100) : 0;
    item.change = (Math.random() * 20) - 10; // Simulace změny
  });

  const PortfolioItem = ({ item }: { item: any }) => (
    <View style={styles.portfolioItem}>
      <View style={styles.portfolioHeader}>
        <View style={styles.portfolioInfo}>
          <View style={[styles.colorIndicator, { backgroundColor: item.color }]} />
          <View>
            <Text style={styles.portfolioName}>{item.name}</Text>
            <Text style={styles.portfolioSymbol}>{item.symbol}</Text>
          </View>
        </View>
        <View style={styles.portfolioValues}>
          <Text style={styles.portfolioAmount}>
            {item.amount.toLocaleString('cs-CZ')} Kč
          </Text>
          <View style={styles.changeContainer}>
            {item.change >= 0 ? (
              <TrendingUp color="#10B981" size={14} />
            ) : (
              <TrendingDown color="#EF4444" size={14} />
            )}
            <Text style={[
              styles.changeText,
              { color: item.change >= 0 ? '#10B981' : '#EF4444' }
            ]}>
              {item.change >= 0 ? '+' : ''}{item.change}%
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.progressBar}>
        <View 
          style={[
            styles.progressFill, 
            { width: `${item.percentage}%`, backgroundColor: item.color }
          ]} 
        />
      </View>
      <Text style={styles.percentageText}>{item.percentage}% portfolia</Text>
    </View>
  );

  const RecommendationCard = ({ recommendation }: { recommendation: any }) => {
    const Icon = recommendation.icon;
    const colors = {
      warning: ['#FEF3C7', '#FCD34D'] as const,
      info: ['#DBEAFE', '#60A5FA'] as const,
      tip: ['#D1FAE5', '#34D399'] as const,
    };

    return (
      <View style={styles.recommendationCard}>
        <LinearGradient
          colors={colors[recommendation.type as keyof typeof colors]}
          style={styles.recommendationGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Icon 
            color={
              recommendation.type === 'warning' ? '#F59E0B' :
              recommendation.type === 'info' ? '#3B82F6' : '#10B981'
            } 
            size={24} 
          />
          <View style={styles.recommendationContent}>
            <Text style={styles.recommendationTitle}>{recommendation.title}</Text>
            <Text style={styles.recommendationDescription}>{recommendation.description}</Text>
          </View>
        </LinearGradient>
      </View>
    );
  };

  const TradeCard = ({ trade }: { trade: Trade }) => (
    <View style={styles.tradeCard}>
      <View style={styles.tradeHeader}>
        <View style={styles.tradeInfo}>
          <View style={[
            styles.tradeTypeIndicator, 
            { backgroundColor: trade.type === 'buy' ? '#10B981' : '#EF4444' }
          ]} />
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
                `Opravdu chceš smazat ${trade.type === 'buy' ? 'nákup' : 'prodej'} ${trade.symbol}?`,
                [
                  { text: 'Zrušit', style: 'cancel' },
                  { 
                    text: 'Smazat', 
                    style: 'destructive',
                    onPress: () => {
                      console.log('Deleting trade:', trade.id);
                      setTrades(prev => {
                        const newTrades = prev.filter(t => t.id !== trade.id);
                        console.log('Trades after deletion:', newTrades.length);
                        return newTrades;
                      });
                    }
                  }
                ]
              );
            }}
          >
            <Trash2 color="#EF4444" size={16} />
          </TouchableOpacity>
          <View style={styles.tradeValues}>
            <Text style={styles.tradeTotal}>
              {trade.type === 'buy' ? '-' : '+'}{trade.total.toLocaleString('cs-CZ')} Kč
            </Text>
            <Text style={styles.tradeDate}>
              {trade.date.toLocaleDateString('cs-CZ')}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.tradeDetails}>
        <Text style={styles.tradeDetailText}>
          {trade.amount} ks × {trade.price.toLocaleString('cs-CZ')} Kč
        </Text>
        <View style={[
          styles.tradeTypeBadge,
          { backgroundColor: trade.type === 'buy' ? '#10B981' : '#EF4444' }
        ]}>
          <Text style={styles.tradeTypeText}>
            {trade.type === 'buy' ? 'NÁKUP' : 'PRODEJ'}
          </Text>
        </View>
      </View>
    </View>
  );

  const handleAddTrade = () => {
    if (!tradeSymbol || !tradeName || !tradeAmount || !tradePrice) {
      Alert.alert('Chyba', 'Vyplň všechna pole');
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

    setTrades(prev => [newTrade, ...prev]);
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

  const generateAnalysis = () => {
    const analysisTexts = [
      'Tvé portfolio je dobře diverzifikované napříč různými sektory. Doporučuji zvýšit podíl emerging markets na 10-15%.',
      'Máš příliš vysokou koncentraci v technologických akciích (45%). Zvaž přidání defensivních sektorů jako utilities nebo healthcare.',
      'Tvé portfolio má nízkou volatilitu, což je dobré pro konzervativní investory. Pro vyšší výnosy zvaž přidání growth akcií.',
      'Rebalancování je potřeba - tvé alokace se odchýlily od cílových o více než 5%. Prodej část S&P 500 a kup evropské akcie.',
      'Výborná diverzifikace! Tvé portfolio je připraveno na různé tržní podmínky. Pokračuj v pravidelném investování.'
    ];
    
    return analysisTexts[Math.floor(Math.random() * analysisTexts.length)];
  };

  const handleFileImport = async () => {
    try {
      if (Platform.OS === 'web') {
        Alert.alert(
          'Nepodporováno na webu',
          'Import souborů není na webu podporován. Použijte mobilní aplikaci.'
        );
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'],
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

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === ',' || char === ';' || char === '\t') && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result.map(field => field.replace(/^"|"$/g, '').trim());
  };

  const detectBrokerFormat = (headers: string[], firstDataRow: string[]): string => {
    const headerStr = headers.join('|').toLowerCase();
    const dataStr = firstDataRow.join('|').toLowerCase();
    
    console.log('Detecting format from headers:', headerStr);
    console.log('First data row:', dataStr);
    
    // XTB detection - více variant
    if ((headerStr.includes('symbol') || headerStr.includes('instrument')) && 
        (headerStr.includes('side') || headerStr.includes('type')) && 
        (headerStr.includes('volume') || headerStr.includes('quantity'))) {
      return 'XTB';
    }
    
    // Trading212 detection - více variant
    if ((headerStr.includes('action') || headerStr.includes('type')) && 
        (headerStr.includes('ticker') || headerStr.includes('symbol')) && 
        (headerStr.includes('quantity') || headerStr.includes('shares'))) {
      return 'Trading212';
    }
    
    // Anycoin detection
    if (headerStr.includes('type') && headerStr.includes('amount') && 
        (headerStr.includes('btc') || headerStr.includes('crypto') || headerStr.includes('coin'))) {
      return 'Anycoin';
    }
    
    // Obecné CSV s minimálními požadavky
    if (headerStr.includes('datum') || headerStr.includes('date') || 
        headerStr.includes('symbol') || headerStr.includes('ticker') ||
        headerStr.includes('akcie') || headerStr.includes('stock')) {
      return 'Generic';
    }
    
    // Pokud má aspoň 3 sloupce, zkusíme generické parsování
    if (headers.length >= 3) {
      return 'Generic';
    }
    
    return 'Unknown';
  };

  const parseXTBFormat = (rows: string[][]): Trade[] => {
    const trades: Trade[] = [];
    const headers = rows[0].map(h => h.toLowerCase());
    
    const symbolIndex = headers.findIndex(h => h.includes('symbol'));
    const sideIndex = headers.findIndex(h => h.includes('side'));
    const volumeIndex = headers.findIndex(h => h.includes('volume'));
    const priceIndex = headers.findIndex(h => h.includes('price'));
    const dateIndex = headers.findIndex(h => h.includes('time') || h.includes('date'));
    const valueIndex = headers.findIndex(h => h.includes('value') || h.includes('total'));
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 3) continue;
      
      const symbol = row[symbolIndex] || '';
      const side = row[sideIndex] || '';
      const volume = parseFloat(row[volumeIndex] || '0');
      const price = parseFloat(row[priceIndex] || '0');
      const dateStr = row[dateIndex] || '';
      const value = parseFloat(row[valueIndex] || '0') || (volume * price);
      
      if (symbol && volume > 0 && price > 0) {
        trades.push({
          id: `${Date.now()}_${i}`,
          type: side.toLowerCase().includes('sell') ? 'sell' : 'buy',
          symbol: symbol.toUpperCase(),
          name: getCompanyName(symbol),
          amount: volume,
          price: price,
          date: parseDate(dateStr),
          total: Math.abs(value),
        });
      }
    }
    
    return trades;
  };

  const parseTrading212Format = (rows: string[][]): Trade[] => {
    const trades: Trade[] = [];
    const headers = rows[0].map(h => h.toLowerCase());
    
    const actionIndex = headers.findIndex(h => h.includes('action'));
    const tickerIndex = headers.findIndex(h => h.includes('ticker'));
    const quantityIndex = headers.findIndex(h => h.includes('quantity') || h.includes('shares'));
    const priceIndex = headers.findIndex(h => h.includes('price'));
    const dateIndex = headers.findIndex(h => h.includes('time') || h.includes('date'));
    const totalIndex = headers.findIndex(h => h.includes('total') || h.includes('value'));
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 3) continue;
      
      const action = row[actionIndex] || '';
      const ticker = row[tickerIndex] || '';
      const quantity = parseFloat(row[quantityIndex] || '0');
      const price = parseFloat(row[priceIndex] || '0');
      const dateStr = row[dateIndex] || '';
      const total = parseFloat(row[totalIndex] || '0') || (quantity * price);
      
      if (ticker && quantity > 0 && price > 0) {
        trades.push({
          id: `${Date.now()}_${i}`,
          type: action.toLowerCase().includes('sell') ? 'sell' : 'buy',
          symbol: ticker.toUpperCase(),
          name: getCompanyName(ticker),
          amount: quantity,
          price: price,
          date: parseDate(dateStr),
          total: Math.abs(total),
        });
      }
    }
    
    return trades;
  };

  const parseAnycoinFormat = (rows: string[][]): Trade[] => {
    const trades: Trade[] = [];
    const headers = rows[0].map(h => h.toLowerCase());
    
    const typeIndex = headers.findIndex(h => h.includes('type'));
    const currencyIndex = headers.findIndex(h => h.includes('currency') || h.includes('coin'));
    const amountIndex = headers.findIndex(h => h.includes('amount'));
    const priceIndex = headers.findIndex(h => h.includes('price') || h.includes('rate'));
    const dateIndex = headers.findIndex(h => h.includes('date') || h.includes('time'));
    const totalIndex = headers.findIndex(h => h.includes('total') || h.includes('value'));
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 3) continue;
      
      const type = row[typeIndex] || '';
      const currency = row[currencyIndex] || '';
      const amount = parseFloat(row[amountIndex] || '0');
      const price = parseFloat(row[priceIndex] || '0');
      const dateStr = row[dateIndex] || '';
      const total = parseFloat(row[totalIndex] || '0') || (amount * price);
      
      if (currency && amount > 0 && price > 0) {
        trades.push({
          id: `${Date.now()}_${i}`,
          type: type.toLowerCase().includes('sell') ? 'sell' : 'buy',
          symbol: currency.toUpperCase(),
          name: getCryptoName(currency),
          amount: amount,
          price: price,
          date: parseDate(dateStr),
          total: Math.abs(total),
        });
      }
    }
    
    return trades;
  };

  const parseGenericFormat = (rows: string[][]): Trade[] => {
    const trades: Trade[] = [];
    const headers = rows[0].map(h => h.toLowerCase().trim());
    
    console.log('Generic parsing - headers:', headers);
    
    // Pokus o automatickou detekci sloupců s více variantami
    const symbolIndex = headers.findIndex(h => 
      h.includes('symbol') || h.includes('ticker') || h.includes('akcie') || 
      h.includes('instrument') || h.includes('název') || h.includes('name') ||
      h.includes('stock') || h.includes('etf')
    );
    const typeIndex = headers.findIndex(h => 
      h.includes('type') || h.includes('action') || h.includes('side') || 
      h.includes('typ') || h.includes('operace') || h.includes('transaction')
    );
    const amountIndex = headers.findIndex(h => 
      h.includes('amount') || h.includes('quantity') || h.includes('volume') || 
      h.includes('množství') || h.includes('počet') || h.includes('shares') ||
      h.includes('ks') || h.includes('kusy')
    );
    const priceIndex = headers.findIndex(h => 
      h.includes('price') || h.includes('cena') || h.includes('rate') ||
      h.includes('kurz') || h.includes('hodnota')
    );
    const dateIndex = headers.findIndex(h => 
      h.includes('date') || h.includes('time') || h.includes('datum') ||
      h.includes('čas') || h.includes('when')
    );
    const totalIndex = headers.findIndex(h => 
      h.includes('total') || h.includes('value') || h.includes('celkem') ||
      h.includes('suma') || h.includes('částka')
    );
    
    console.log('Column indices:', {
      symbol: symbolIndex,
      type: typeIndex,
      amount: amountIndex,
      price: priceIndex,
      date: dateIndex,
      total: totalIndex
    });
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 2) continue;
      
      console.log(`Processing row ${i}:`, row);
      
      // Flexibilnější přístup k získání hodnot
      let symbol = '';
      let type = 'buy';
      let amount = 0;
      let price = 0;
      let dateStr = '';
      let total = 0;
      
      // Symbol - zkusíme různé indexy
      if (symbolIndex >= 0 && row[symbolIndex]) {
        symbol = row[symbolIndex].trim();
      } else {
        // Hledáme první neprázdný řetězec, který vypadá jako symbol
        for (let j = 0; j < Math.min(row.length, 3); j++) {
          const candidate = row[j]?.trim() || '';
          if (candidate && /^[A-Z]{1,5}$/.test(candidate.toUpperCase())) {
            symbol = candidate;
            break;
          }
        }
      }
      
      // Type
      if (typeIndex >= 0 && row[typeIndex]) {
        type = row[typeIndex].toLowerCase().includes('sell') || 
               row[typeIndex].toLowerCase().includes('prodej') ? 'sell' : 'buy';
      }
      
      // Amount
      if (amountIndex >= 0 && row[amountIndex]) {
        amount = parseFloat(row[amountIndex].replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
      } else {
        // Hledáme první číslo, které vypadá jako množství
        for (let j = 1; j < Math.min(row.length, 5); j++) {
          const candidate = parseFloat(row[j]?.replace(/[^0-9.,]/g, '').replace(',', '.') || '0');
          if (candidate > 0 && candidate < 10000) { // Rozumné množství akcií
            amount = candidate;
            break;
          }
        }
      }
      
      // Price
      if (priceIndex >= 0 && row[priceIndex]) {
        price = parseFloat(row[priceIndex].replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
      } else {
        // Hledáme číslo, které vypadá jako cena
        for (let j = 1; j < row.length; j++) {
          const candidate = parseFloat(row[j]?.replace(/[^0-9.,]/g, '').replace(',', '.') || '0');
          if (candidate > 10 && candidate < 1000000) { // Rozumná cena za akcii
            price = candidate;
            break;
          }
        }
      }
      
      // Total value
      if (totalIndex >= 0 && row[totalIndex]) {
        total = parseFloat(row[totalIndex].replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
      }
      
      // Date
      if (dateIndex >= 0 && row[dateIndex]) {
        dateStr = row[dateIndex];
      } else {
        // Hledáme řetězec, který vypadá jako datum
        for (let j = 0; j < row.length; j++) {
          const candidate = row[j] || '';
          if (candidate.match(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/) || 
              candidate.match(/\d{4}[./-]\d{1,2}[./-]\d{1,2}/)) {
            dateStr = candidate;
            break;
          }
        }
      }
      
      // Pokud nemáme total, vypočítáme ho
      if (total === 0 && amount > 0 && price > 0) {
        total = amount * price;
      }
      
      console.log(`Parsed values:`, { symbol, type, amount, price, total, dateStr });
      
      // Validace - potřebujeme aspoň symbol a nějakou hodnotu
      if (symbol && (amount > 0 || total > 0)) {
        // Pokud nemáme amount ale máme total a price, vypočítáme amount
        if (amount === 0 && total > 0 && price > 0) {
          amount = total / price;
        }
        // Pokud nemáme price ale máme total a amount, vypočítáme price
        if (price === 0 && total > 0 && amount > 0) {
          price = total / amount;
        }
        // Pokud stále nemáme price, použijeme rozumnou defaultní hodnotu
        if (price === 0) {
          price = 100; // Default price
        }
        if (amount === 0) {
          amount = 1; // Default amount
        }
        if (total === 0) {
          total = amount * price;
        }
        
        trades.push({
          id: `${Date.now()}_${i}`,
          type: type as 'buy' | 'sell',
          symbol: symbol.toUpperCase(),
          name: getCompanyName(symbol),
          amount: amount,
          price: price,
          date: parseDate(dateStr),
          total: Math.abs(total),
        });
      }
    }
    
    console.log(`Generic parsing result: ${trades.length} trades found`);
    return trades;
  };

  const parseDate = (dateStr: string): Date => {
    if (!dateStr || dateStr.trim() === '') return new Date();
    
    const cleanDateStr = dateStr.trim();
    
    // Různé formáty datumu s více variantami
    const formats = [
      { regex: /^(\d{4})-(\d{1,2})-(\d{1,2})/, type: 'YYYY-MM-DD' }, // YYYY-MM-DD
      { regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})/, type: 'DD.MM.YYYY' }, // DD.MM.YYYY
      { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})/, type: 'DD/MM/YYYY' }, // DD/MM/YYYY (evropský)
      { regex: /^(\d{4})\/(\d{1,2})\/(\d{1,2})/, type: 'YYYY/MM/DD' }, // YYYY/MM/DD
      { regex: /^(\d{1,2})-(\d{1,2})-(\d{4})/, type: 'DD-MM-YYYY' }, // DD-MM-YYYY
      { regex: /^(\d{4})\.(\d{1,2})\.(\d{1,2})/, type: 'YYYY.MM.DD' }, // YYYY.MM.DD
    ];
    
    for (const format of formats) {
      const match = cleanDateStr.match(format.regex);
      if (match) {
        const [, part1, part2, part3] = match;
        const num1 = parseInt(part1);
        const num2 = parseInt(part2);
        const num3 = parseInt(part3);
        
        try {
          switch (format.type) {
            case 'YYYY-MM-DD':
            case 'YYYY/MM/DD':
            case 'YYYY.MM.DD':
              return new Date(num1, num2 - 1, num3);
            case 'DD.MM.YYYY':
            case 'DD/MM/YYYY':
            case 'DD-MM-YYYY':
              return new Date(num3, num2 - 1, num1);
          }
        } catch (e) {
          console.warn('Failed to parse date:', cleanDateStr, e);
        }
      }
    }
    
    // Pokus o parsování pomocí Date konstruktoru
    try {
      const parsed = new Date(cleanDateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse date with Date constructor:', cleanDateStr, e);
    }
    
    // Fallback na současné datum
    console.warn('Using current date as fallback for:', cleanDateStr);
    return new Date();
  };

  const getCompanyName = (symbol: string): string => {
    const companies: { [key: string]: string } = {
      'AAPL': 'Apple Inc.',
      'MSFT': 'Microsoft Corp.',
      'GOOGL': 'Alphabet Inc.',
      'AMZN': 'Amazon.com Inc.',
      'TSLA': 'Tesla Inc.',
      'META': 'Meta Platforms Inc.',
      'NVDA': 'NVIDIA Corp.',
      'SPY': 'S&P 500 ETF',
      'QQQ': 'Nasdaq 100 ETF',
      'VTI': 'Total Stock Market ETF',
      'VEA': 'Evropské akcie ETF',
      'VWO': 'Emerging Markets ETF',
      'GLD': 'Zlato ETF',
      'SLV': 'Stříbro ETF',
    };
    
    return companies[symbol.toUpperCase()] || symbol;
  };

  const getCryptoName = (symbol: string): string => {
    const cryptos: { [key: string]: string } = {
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum',
      'ADA': 'Cardano',
      'DOT': 'Polkadot',
      'LINK': 'Chainlink',
      'XRP': 'Ripple',
      'LTC': 'Litecoin',
      'BCH': 'Bitcoin Cash',
      'BNB': 'Binance Coin',
      'SOL': 'Solana',
    };
    
    return cryptos[symbol.toUpperCase()] || symbol;
  };

  const processImportedFile = async () => {
    if (!selectedFile) return;

    setIsProcessingFile(true);
    
    try {
      console.log('Processing file:', selectedFile.name, selectedFile.mimeType);
      
      // Čtení souboru
      let fileContent = '';
      
      if (Platform.OS === 'web') {
        // Web implementace - čtení přes FileReader
        const response = await fetch(selectedFile.uri);
        fileContent = await response.text();
      } else {
        // Mobile implementace - čtení přes FileSystem
        const FileSystem = require('expo-file-system');
        fileContent = await FileSystem.readAsStringAsync(selectedFile.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }
      
      console.log('File content length:', fileContent.length);
      
      // Parsování CSV
      const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
      if (lines.length < 2) {
        throw new Error('Soubor neobsahuje dostatečná data');
      }
      
      const rows = lines.map(line => parseCSVLine(line));
      const headers = rows[0];
      const firstDataRow = rows[1] || [];
      
      console.log('Headers:', headers);
      console.log('First data row:', firstDataRow);
      
      // Detekce formátu brokera
      const brokerFormat = detectBrokerFormat(headers, firstDataRow);
      console.log('Detected broker format:', brokerFormat);
      
      let importedTrades: Trade[] = [];
      
      switch (brokerFormat) {
        case 'XTB':
          importedTrades = parseXTBFormat(rows);
          break;
        case 'Trading212':
          importedTrades = parseTrading212Format(rows);
          break;
        case 'Anycoin':
          importedTrades = parseAnycoinFormat(rows);
          break;
        case 'Generic':
          importedTrades = parseGenericFormat(rows);
          break;
        default:
          // Pokus o generické parsování
          importedTrades = parseGenericFormat(rows);
          break;
      }
      
      console.log('Parsed trades:', importedTrades.length);
      
      console.log('Final imported trades count:', importedTrades.length);
      
      if (importedTrades.length === 0) {
        // Pokusíme se zobrazit více informací o problému
        const sampleRows = rows.slice(0, 3).map((row, i) => `Řádek ${i}: ${row.join(' | ')}`).join('\n');
        throw new Error(
          `Nepodařilo se najít žádné platné obchody v souboru.\n\n` +
          `Detekovaný formát: ${brokerFormat}\n` +
          `Počet řádků: ${rows.length}\n` +
          `Ukázka dat:\n${sampleRows}\n\n` +
          `Zkontrolujte, zda soubor obsahuje správné sloupce s daty o obchodech.`
        );
      }
      
      // Přidání obchodů do stavu
      setTrades(prev => [...importedTrades, ...prev]);
      setShowFileImportModal(false);
      setSelectedFile(null);
      
      const dateRange = importedTrades.length > 0 ? 
        `${Math.min(...importedTrades.map(t => t.date.getTime()))} - ${Math.max(...importedTrades.map(t => t.date.getTime()))}` : '';
      
      Alert.alert(
        'Import dokončen! 📊',
        `Výpis z ${brokerFormat} byl úspěšně zpracován.\n\n` +
        `✅ Přidáno ${importedTrades.length} obchodů\n` +
        `📈 Nákupy: ${importedTrades.filter(t => t.type === 'buy').length}\n` +
        `📉 Prodeje: ${importedTrades.filter(t => t.type === 'sell').length}\n` +
        `💰 Celková hodnota: ${importedTrades.reduce((sum, t) => sum + t.total, 0).toLocaleString('cs-CZ')} Kč`
      );
      
    } catch (error) {
      console.error('Error processing file:', error);
      Alert.alert(
        'Chyba při zpracování souboru',
        `Nepodařilo se zpracovat soubor: ${error instanceof Error ? error.message : 'Neznámá chyba'}\n\n` +
        'Zkontrolujte, zda soubor obsahuje správné sloupce:\n' +
        '• Datum obchodu\n' +
        '• Typ (nákup/prodej)\n' +
        '• Symbol akcie\n' +
        '• Množství\n' +
        '• Cena za kus'
      );
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleBrokerImport = (broker: string) => {
    const brokerPortfolios: { [key: string]: Trade[] } = {
      'XTB': [
        {
          id: Date.now().toString(),
          type: 'buy',
          symbol: 'SPY',
          name: 'S&P 500 ETF',
          amount: 15,
          price: 4800,
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          total: 72000,
        },
        {
          id: (Date.now() + 1).toString(),
          type: 'buy',
          symbol: 'AAPL',
          name: 'Apple Inc.',
          amount: 8,
          price: 4200,
          date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
          total: 33600,
        },
      ],
      'Trading212': [
        {
          id: Date.now().toString(),
          type: 'buy',
          symbol: 'MSFT',
          name: 'Microsoft Corp.',
          amount: 6,
          price: 8500,
          date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
          total: 51000,
        },
        {
          id: (Date.now() + 1).toString(),
          type: 'buy',
          symbol: 'VEA',
          name: 'Evropské akcie',
          amount: 25,
          price: 1200,
          date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          total: 30000,
        },
      ],
      'Anycoin': [
        {
          id: Date.now().toString(),
          type: 'buy',
          symbol: 'BTC',
          name: 'Bitcoin',
          amount: 0.5,
          price: 1200000,
          date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
          total: 600000,
        },
      ],
      'Other': [
        {
          id: Date.now().toString(),
          type: 'buy',
          symbol: 'GLD',
          name: 'Zlato ETF',
          amount: 20,
          price: 4500,
          date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
          total: 90000,
        },
      ]
    };

    const sampleTrades = brokerPortfolios[broker] || [];
    setTrades(prev => [...sampleTrades, ...prev]);
    
    Alert.alert(
      'Import dokončen! 📊',
      `Portfolio z ${broker} bylo úspěšně importováno. Přidáno ${sampleTrades.length} obchodů.`
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.headerTitle}>Investice</Text>
        <Text style={styles.headerSubtitle}>Tvé portfolio a doporučení</Text>
      </LinearGradient>

      {/* Total Value Card */}
      <View style={styles.totalValueContainer}>
        <View style={styles.totalValueCard}>
          <LinearGradient
            colors={totalChangePercent >= 0 ? ['#10B981', '#059669'] : ['#EF4444', '#DC2626']}
            style={styles.totalValueGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.totalValueLabel}>Celková hodnota portfolia</Text>
            <Text style={styles.totalValueAmount}>
              {totalValue.toLocaleString('cs-CZ')} Kč
            </Text>
            <View style={styles.totalChangeContainer}>
              {totalChangePercent >= 0 ? (
                <TrendingUp color="white" size={16} />
              ) : (
                <TrendingDown color="white" size={16} />
              )}
              <Text style={styles.totalChangeText}>
                {totalChangePercent >= 0 ? '+' : ''}{totalChangePercent.toFixed(2)}%
              </Text>
              <Text style={styles.totalChangeAmount}>
                ({totalChangePercent >= 0 ? '+' : ''}{totalChange.toLocaleString('cs-CZ')} Kč)
              </Text>
            </View>
          </LinearGradient>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActionsContainer}>
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => setShowAddModal(true)}
        >
          <LinearGradient
            colors={['#8B5CF6', '#7C3AED']}
            style={styles.quickActionGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Plus color="white" size={20} />
            <Text style={styles.quickActionText}>Přidat investici</Text>
          </LinearGradient>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => setShowAnalysisModal(true)}
        >
          <LinearGradient
            colors={['#F59E0B', '#D97706']}
            style={styles.quickActionGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <BarChart3 color="white" size={20} />
            <Text style={styles.quickActionText}>Analýza</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.tabButton, selectedTab === 'portfolio' && styles.tabButtonActive]}
          onPress={() => setSelectedTab('portfolio')}
        >
          <PieChart 
            color={selectedTab === 'portfolio' ? 'white' : '#6B7280'} 
            size={18} 
          />
          <Text style={[
            styles.tabButtonText, 
            selectedTab === 'portfolio' && styles.tabButtonTextActive
          ]}>
            Portfolio
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tabButton, selectedTab === 'trades' && styles.tabButtonActive]}
          onPress={() => setSelectedTab('trades')}
        >
          <ShoppingCart 
            color={selectedTab === 'trades' ? 'white' : '#6B7280'} 
            size={18} 
          />
          <Text style={[
            styles.tabButtonText, 
            selectedTab === 'trades' && styles.tabButtonTextActive
          ]}>
            Obchody
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tabButton, selectedTab === 'recommendations' && styles.tabButtonActive]}
          onPress={() => setSelectedTab('recommendations')}
        >
          <Target 
            color={selectedTab === 'recommendations' ? 'white' : '#6B7280'} 
            size={18} 
          />
          <Text style={[
            styles.tabButtonText, 
            selectedTab === 'recommendations' && styles.tabButtonTextActive
          ]}>
            Doporučení
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {selectedTab === 'portfolio' ? (
          <View style={styles.portfolioContainer}>
            {portfolioData.length === 0 ? (
              <View style={styles.emptyState}>
                <PieChart color="#9CA3AF" size={48} />
                <Text style={styles.emptyStateTitle}>Žádné investice</Text>
                <Text style={styles.emptyStateText}>
                  Přidej své první investice pomocí tlačítka "Přidat investici" nebo si vyberte z doporučených
                </Text>
                <TouchableOpacity 
                  style={styles.suggestedButton}
                  onPress={() => setShowSuggestedModal(true)}
                >
                  <Text style={styles.suggestedButtonText}>Zobrazit doporučené</Text>
                </TouchableOpacity>
              </View>
            ) : (
              portfolioData.map((item, index) => (
                <PortfolioItem key={index} item={item} />
              ))
            )}
          </View>
        ) : selectedTab === 'trades' ? (
          <View style={styles.tradesContainer}>
            {trades.length === 0 ? (
              <View style={styles.emptyState}>
                <ShoppingCart color="#9CA3AF" size={48} />
                <Text style={styles.emptyStateTitle}>Žádné obchody</Text>
                <Text style={styles.emptyStateText}>
                  Přidej svůj první nákup nebo prodej pomocí tlačítka "Přidat investici"
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.tradesHeader}>
                  <Text style={styles.tradesHeaderTitle}>Všechny obchody ({trades.length})</Text>
                  <TouchableOpacity 
                    style={styles.clearAllButton}
                    onPress={() => {
                      console.log('Attempting to clear all trades, current count:', trades.length);
                      Alert.alert(
                        'Smazat všechny obchody',
                        'Opravdu chceš smazat všechny obchody? Tato akce je nevratná.',
                        [
                          { text: 'Zrušit', style: 'cancel' },
                          { 
                            text: 'Smazat vše', 
                            style: 'destructive',
                            onPress: () => {
                              console.log('Clearing all trades');
                              setTrades([]);
                            }
                          }
                        ]
                      );
                    }}
                  >
                    <Trash2 color="#EF4444" size={16} />
                    <Text style={styles.clearAllButtonText}>Smazat vše</Text>
                  </TouchableOpacity>
                </View>
                {trades.map((trade) => (
                  <TradeCard key={trade.id} trade={trade} />
                ))}
              </>
            )}
          </View>
        ) : (
          <View style={styles.recommendationsContainer}>
            {RECOMMENDATIONS.map((recommendation, index) => (
              <RecommendationCard key={index} recommendation={recommendation} />
            ))}
          </View>
        )}
      </View>

      {/* Add Investment Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#8B5CF6', '#7C3AED']}
            style={styles.modalHeader}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.modalHeaderContent}>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                style={styles.closeButton}
              >
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
                  <Target color="white" size={32} />
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
                    Alert.alert(
                      'Import portfolia',
                      'Vyberte způsob importu:',
                      [
                        { 
                          text: 'Nahrát výpis z brokera', 
                          onPress: () => {
                            console.log('Importing from file...');
                            handleFileImport();
                          }
                        },
                        { 
                          text: 'Ukázkové portfolio', 
                          onPress: () => {
                            Alert.alert(
                              'Ukázkové portfolio',
                              'Vyberte brokera pro import ukázkového portfolia:',
                              [
                                { 
                                  text: 'XTB', 
                                  onPress: () => handleBrokerImport('XTB')
                                },
                                { 
                                  text: 'Trading212', 
                                  onPress: () => handleBrokerImport('Trading212')
                                },
                                { 
                                  text: 'Anycoin', 
                                  onPress: () => handleBrokerImport('Anycoin')
                                },
                                { 
                                  text: 'Jiný broker', 
                                  onPress: () => handleBrokerImport('Other')
                                },
                                { text: 'Zrušit', style: 'cancel' }
                              ]
                            );
                          }
                        },
                        { text: 'Zrušit', style: 'cancel' }
                      ]
                    );
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
                  <Text style={styles.addOptionDescription}>
                    Nahraj výpis z brokera nebo vyberte ukázku
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Trade Modal */}
      <Modal
        visible={showTradeModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#10B981', '#059669']}
            style={styles.modalHeader}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.modalHeaderContent}>
              <TouchableOpacity
                onPress={() => setShowTradeModal(false)}
                style={styles.closeButton}
              >
                <X color="white" size={24} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Nový obchod</Text>
              <View style={styles.modalProgress} />
            </View>
          </LinearGradient>

          <ScrollView style={styles.modalContent}>
            {/* Trade Type Selector */}
            <View style={styles.tradeTypeSelector}>
              <TouchableOpacity
                style={[
                  styles.tradeTypeButton,
                  tradeType === 'buy' && styles.tradeTypeButtonActive
                ]}
                onPress={() => setTradeType('buy')}
              >
                <Plus color={tradeType === 'buy' ? 'white' : '#10B981'} size={20} />
                <Text style={[
                  styles.tradeTypeButtonText,
                  tradeType === 'buy' && styles.tradeTypeButtonTextActive
                ]}>Nákup</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.tradeTypeButton,
                  tradeType === 'sell' && styles.tradeTypeButtonActive
                ]}
                onPress={() => setTradeType('sell')}
              >
                <Minus color={tradeType === 'sell' ? 'white' : '#EF4444'} size={20} />
                <Text style={[
                  styles.tradeTypeButtonText,
                  tradeType === 'sell' && styles.tradeTypeButtonTextActive
                ]}>Prodej</Text>
              </TouchableOpacity>
            </View>

            {/* Form Fields */}
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
                  <Text style={styles.inputLabel}>Cena za kus (Kč)</Text>
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
                    {(parseFloat(tradeAmount) * parseFloat(tradePrice)).toLocaleString('cs-CZ')} Kč
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleAddTrade}
            >
              <LinearGradient
                colors={tradeType === 'buy' ? ['#10B981', '#059669'] : ['#EF4444', '#DC2626']}
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

      {/* Analysis Modal */}
      <Modal
        visible={showAnalysisModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#F59E0B', '#D97706']}
            style={styles.modalHeader}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.modalHeaderContent}>
              <TouchableOpacity
                onPress={() => setShowAnalysisModal(false)}
                style={styles.closeButton}
              >
                <X color="white" size={24} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Analýza portfolia</Text>
              <View style={styles.modalProgress} />
            </View>
          </LinearGradient>

          <ScrollView style={styles.modalContent}>
            <View style={styles.analysisContainer}>
              <View style={styles.analysisCard}>
                <BarChart3 color="#F59E0B" size={32} />
                <Text style={styles.analysisTitle}>AI Analýza</Text>
                <Text style={styles.analysisText}>
                  {generateAnalysis()}
                </Text>
              </View>

              <View style={styles.metricsContainer}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>8.2%</Text>
                  <Text style={styles.metricLabel}>Roční výnos</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>15.4%</Text>
                  <Text style={styles.metricLabel}>Volatilita</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>0.53</Text>
                  <Text style={styles.metricLabel}>Sharpe ratio</Text>
                </View>
              </View>

              <View style={styles.allocationCard}>
                <Text style={styles.allocationTitle}>Doporučená alokace</Text>
                <View style={styles.allocationItem}>
                  <Text style={styles.allocationLabel}>Akcie USA</Text>
                  <Text style={styles.allocationValue}>40%</Text>
                </View>
                <View style={styles.allocationItem}>
                  <Text style={styles.allocationLabel}>Akcie Evropa</Text>
                  <Text style={styles.allocationValue}>25%</Text>
                </View>
                <View style={styles.allocationItem}>
                  <Text style={styles.allocationLabel}>Emerging Markets</Text>
                  <Text style={styles.allocationValue}>15%</Text>
                </View>
                <View style={styles.allocationItem}>
                  <Text style={styles.allocationLabel}>Dluhopisy</Text>
                  <Text style={styles.allocationValue}>15%</Text>
                </View>
                <View style={styles.allocationItem}>
                  <Text style={styles.allocationLabel}>Komodity</Text>
                  <Text style={styles.allocationValue}>5%</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Suggested Investments Modal */}
      <Modal
        visible={showSuggestedModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
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
                    <View style={[styles.colorIndicator, { backgroundColor: investment.color }]} />
                    <View style={styles.suggestedItemInfo}>
                      <Text style={styles.suggestedItemName}>{investment.name}</Text>
                      <Text style={styles.suggestedItemSymbol}>{investment.symbol}</Text>
                      <Text style={styles.suggestedItemDescription}>{investment.description}</Text>
                    </View>
                    <Plus color="#6B7280" size={20} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* File Import Modal */}
      <Modal
        visible={showFileImportModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
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
                  <Text style={styles.supportedFormatsTitle}>Podporované formáty:</Text>
                  <Text style={styles.supportedFormatsText}>• CSV soubory (.csv)</Text>
                  <Text style={styles.supportedFormatsText}>• Excel soubory (.xlsx, .xls)</Text>
                  <Text style={styles.supportedFormatsText}>• Textové soubory (.txt)</Text>
                </View>

                <View style={styles.expectedDataContainer}>
                  <Text style={styles.expectedDataTitle}>Očekávaná data:</Text>
                  <Text style={styles.expectedDataText}>• Datum obchodu</Text>
                  <Text style={styles.expectedDataText}>• Typ (nákup/prodej)</Text>
                  <Text style={styles.expectedDataText}>• Symbol akcie/ETF</Text>
                  <Text style={styles.expectedDataText}>• Množství</Text>
                  <Text style={styles.expectedDataText}>• Cena za kus</Text>
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
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleFileImport}
              >
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
    </ScrollView>
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
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
  },
  totalValueContainer: {
    marginHorizontal: 20,
    marginTop: -12,
    marginBottom: 24,
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
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 12,
  },
  totalChangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalChangeText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginLeft: 6,
    marginRight: 8,
  },
  totalChangeAmount: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
  },
  quickActionsContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  quickActionButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  quickActionGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
  tabSelector: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
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
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 6,
  },
  tabButtonTextActive: {
    color: 'white',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  portfolioContainer: {
    gap: 16,
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
    fontWeight: '600',
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
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changeText: {
    fontSize: 14,
    fontWeight: '600',
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
  percentageText: {
    fontSize: 12,
    color: '#6B7280',
  },
  recommendationsContainer: {
    gap: 16,
  },
  recommendationCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  recommendationGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recommendationContent: {
    marginLeft: 12,
    flex: 1,
  },
  recommendationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  recommendationDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  tradesContainer: {
    gap: 16,
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
    fontWeight: 'bold',
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
    fontWeight: 'bold',
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
    fontWeight: 'bold',
    color: 'white',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
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
    fontWeight: 'bold',
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
    fontWeight: 'bold',
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
    fontWeight: '600',
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
    fontWeight: '600',
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
    fontWeight: '600',
    color: '#374151',
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: 'bold',
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
    fontWeight: '600',
    color: 'white',
  },
  analysisContainer: {
    gap: 20,
  },
  analysisCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  analysisTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 12,
    marginBottom: 16,
  },
  analysisText: {
    fontSize: 16,
    color: '#4B5563',
    lineHeight: 24,
    textAlign: 'center',
  },
  metricsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  allocationCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  allocationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  allocationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  allocationLabel: {
    fontSize: 14,
    color: '#4B5563',
  },
  allocationValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  suggestedButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  suggestedButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  tradesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tradesHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  clearAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  clearAllButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
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
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  suggestedItemSymbol: {
    fontSize: 12,
    fontWeight: 'bold',
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
    fontWeight: 'bold',
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
    fontWeight: '600',
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
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  supportedFormatsText: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  expectedDataContainer: {
    alignSelf: 'stretch',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
  },
  expectedDataTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8,
  },
  expectedDataText: {
    fontSize: 13,
    color: '#3730A3',
    marginBottom: 4,
  },
});