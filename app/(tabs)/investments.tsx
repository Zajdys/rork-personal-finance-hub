import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X,
  Briefcase,
  TrendingUp,
  TrendingDown,
  Trash2,
  ChevronRight,
  PieChart,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { usePortfolioStore, Portfolio } from '@/store/portfolio-store';
import { useSettingsStore, CURRENCIES } from '@/store/settings-store';

export default function InvestmentsScreen() {
  const router = useRouter();
  const { portfolios, isLoaded, addPortfolio, deletePortfolio, loadData } = usePortfolioStore();
  const { currency, currencyScope, investmentCurrency } = useSettingsStore();
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [portfolioName, setPortfolioName] = useState<string>('');
  const [selectedEmoji, setSelectedEmoji] = useState<string>('💼');
  const [selectedColor, setSelectedColor] = useState<string>('#667eea');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('CZK');

  useEffect(() => {
    if (!isLoaded) {
      loadData();
    }
  }, [isLoaded, loadData]);

  const handleCreatePortfolio = () => {
    if (!portfolioName.trim()) {
      Alert.alert('Chyba', 'Zadej název portfolia');
      return;
    }

    const newPortfolio: Portfolio = {
      id: Date.now().toString(),
      name: portfolioName.trim(),
      emoji: selectedEmoji,
      currency: selectedCurrency,
      createdAt: new Date(),
      trades: [],
      color: selectedColor,
    };

    addPortfolio(newPortfolio);
    setPortfolioName('');
    setSelectedEmoji('💼');
    setSelectedColor('#667eea');
    setSelectedCurrency('CZK');
    setShowCreateModal(false);
    
    Alert.alert('Úspěch! 🎉', `Portfolio "${newPortfolio.name}" bylo vytvořeno.`);
  };

  const handleDeletePortfolio = (portfolio: Portfolio) => {
    Alert.alert(
      'Smazat portfolio',
      `Opravdu chceš smazat portfolio "${portfolio.name}"? Tato akce je nevratná.`,
      [
        { text: 'Zrušit', style: 'cancel' },
        {
          text: 'Smazat',
          style: 'destructive',
          onPress: () => {
            deletePortfolio(portfolio.id);
            Alert.alert('Smazáno', `Portfolio "${portfolio.name}" bylo smazáno.`);
          },
        },
      ]
    );
  };

  const calculatePortfolioMetrics = (portfolio: Portfolio) => {
    const positions = portfolio.trades.reduce((acc, trade) => {
      const existing = acc.find((item) => item.symbol === trade.symbol);
      if (existing) {
        if (trade.type === 'buy') {
          const newTotalShares = existing.shares + trade.amount;
          const newTotalInvested = existing.totalInvested + trade.total;
          existing.totalInvested = newTotalInvested;
          existing.shares = newTotalShares;
          existing.avgPrice = newTotalInvested / newTotalShares;
        } else {
          const soldShares = Math.min(trade.amount, existing.shares);
          const soldInvestment = soldShares * existing.avgPrice;
          existing.shares -= soldShares;
          existing.totalInvested -= soldInvestment;
        }
      } else {
        if (trade.type === 'buy') {
          acc.push({
            symbol: trade.symbol,
            shares: trade.amount,
            avgPrice: trade.price,
            totalInvested: trade.total,
          });
        }
      }
      return acc;
    }, [] as { symbol: string; shares: number; avgPrice: number; totalInvested: number }[])
    .filter((item) => item.shares > 0);

    const totalInvested = positions.reduce((sum, p) => sum + p.totalInvested, 0);
    const totalValue = positions.reduce((sum, p) => sum + p.shares * p.avgPrice, 0);
    const totalChange = totalValue - totalInvested;
    const totalChangePercent = totalInvested > 0 ? (totalChange / totalInvested) * 100 : 0;

    return {
      totalInvested,
      totalValue,
      totalChange,
      totalChangePercent,
      positionsCount: positions.length,
    };
  };

  const calculateTotalMetrics = () => {
    let totalInvested = 0;
    let totalValue = 0;
    let totalPositions = 0;

    portfolios.forEach((portfolio) => {
      const metrics = calculatePortfolioMetrics(portfolio);
      totalInvested += metrics.totalInvested;
      totalValue += metrics.totalValue;
      totalPositions += metrics.positionsCount;
    });

    const totalChange = totalValue - totalInvested;
    const totalChangePercent = totalInvested > 0 ? (totalChange / totalInvested) * 100 : 0;

    return {
      totalInvested,
      totalValue,
      totalChange,
      totalChangePercent,
      positionsCount: totalPositions,
    };
  };

  const formatCurrency = (amount: number): string => {
    const targetCurrency = currencyScope === 'investmentsOnly' ? investmentCurrency : currency;
    const currencyInfo = CURRENCIES[targetCurrency];
    
    if (targetCurrency === 'CZK') {
      return `${amount.toLocaleString('cs-CZ')} ${currencyInfo.symbol}`;
    } else {
      return `${currencyInfo.symbol}${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    }
  };

  const TotalPortfolioCard = () => {
    const metrics = calculateTotalMetrics();

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          router.push('/portfolio-detail?portfolioId=total' as any);
        }}
        style={styles.totalPortfolioCard}
      >
        <LinearGradient
          colors={['#1F2937', '#374151']}
          style={styles.portfolioGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.portfolioHeader}>
            <View style={styles.portfolioInfo}>
              <View style={styles.totalIconContainer}>
                <PieChart color="white" size={24} />
              </View>
              <View style={styles.portfolioTitleContainer}>
                <Text style={styles.portfolioName}>Celkové portfolio</Text>
                <Text style={styles.portfolioCurrency}>Všechna portfolia</Text>
              </View>
            </View>
          </View>

          <View style={styles.portfolioMetrics}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Celková hodnota</Text>
              <Text style={styles.metricValue}>
                {formatCurrency(metrics.totalValue)}
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Zisk/Ztráta</Text>
              <View style={styles.changeRow}>
                {metrics.totalChangePercent >= 0 ? (
                  <TrendingUp color="white" size={16} />
                ) : (
                  <TrendingDown color="white" size={16} />
                )}
                <Text style={styles.metricValue}>
                  {metrics.totalChangePercent >= 0 ? '+' : ''}
                  {metrics.totalChangePercent.toFixed(2)}%
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.portfolioFooter}>
            <Text style={styles.positionsCount}>
              {portfolios.length} {portfolios.length === 1 ? 'portfolio' : 'portfolií'} • {metrics.positionsCount} {metrics.positionsCount === 1 ? 'pozice' : 'pozic'}
            </Text>
            <ChevronRight color="white" size={20} />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const PortfolioCard = ({ portfolio }: { portfolio: Portfolio }) => {
    const metrics = calculatePortfolioMetrics(portfolio);

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          router.push(`/portfolio-detail?portfolioId=${portfolio.id}` as any);
        }}
        style={styles.portfolioCard}
      >
        <LinearGradient
          colors={[portfolio.color, portfolio.color + 'CC']}
          style={styles.portfolioGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.portfolioHeader}>
            <View style={styles.portfolioInfo}>
              <Text style={styles.portfolioEmoji}>{portfolio.emoji || '💼'}</Text>
              <View style={styles.portfolioTitleContainer}>
                <Text style={styles.portfolioName}>{portfolio.name}</Text>
                <Text style={styles.portfolioCurrency}>{portfolio.currency || 'CZK'}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handleDeletePortfolio(portfolio);
              }}
              style={styles.deleteButton}
            >
              <Trash2 color="white" size={18} />
            </TouchableOpacity>
          </View>

          <View style={styles.portfolioMetrics}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Celková hodnota</Text>
              <Text style={styles.metricValue}>
                {formatCurrency(metrics.totalValue)}
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Zisk/Ztráta</Text>
              <View style={styles.changeRow}>
                {metrics.totalChangePercent >= 0 ? (
                  <TrendingUp color="white" size={16} />
                ) : (
                  <TrendingDown color="white" size={16} />
                )}
                <Text style={styles.metricValue}>
                  {metrics.totalChangePercent >= 0 ? '+' : ''}
                  {metrics.totalChangePercent.toFixed(2)}%
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.portfolioFooter}>
            <Text style={styles.positionsCount}>
              {metrics.positionsCount} {metrics.positionsCount === 1 ? 'pozice' : 'pozic'}
            </Text>
            <ChevronRight color="white" size={20} />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.headerTitle}>Portfolia</Text>
            <Text style={styles.headerSubtitle}>Správa investic</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {portfolios.length === 0 ? (
          <View style={styles.emptyState}>
            <Briefcase color="#9CA3AF" size={64} />
            <Text style={styles.emptyStateTitle}>Žádná portfolia</Text>
            <Text style={styles.emptyStateText}>
              Vytvoř své první portfolio a začni sledovat své investice
            </Text>
            <TouchableOpacity
              style={styles.createFirstButton}
              onPress={() => setShowCreateModal(true)}
            >
              <LinearGradient
                colors={['#667eea', '#764ba2']}
                style={styles.createFirstGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.createFirstText}>Vytvořit portfolio</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.portfolioList}>
            {portfolios.length > 1 && <TotalPortfolioCard />}
            {portfolios.map((portfolio) => (
              <PortfolioCard key={portfolio.id} portfolio={portfolio} />
            ))}
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => setShowCreateModal(true)}
            >
              <LinearGradient
                colors={['#667eea', '#764ba2']}
                style={styles.createButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.createButtonText}>Vytvořit nové portfolio</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.modalHeader}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.modalHeaderContent}>
              <TouchableOpacity
                onPress={() => {
                  setShowCreateModal(false);
                  setPortfolioName('');
                  setSelectedEmoji('💼');
                  setSelectedColor('#667eea');
                  setSelectedCurrency('CZK');
                }}
                style={styles.closeButton}
              >
                <X color="white" size={24} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Nové portfolio</Text>
              <View style={styles.modalProgress} />
            </View>
          </LinearGradient>

          <ScrollView style={styles.modalContent}>
            <View style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Název portfolia *</Text>
                <TextInput
                  style={styles.textInput}
                  value={portfolioName}
                  onChangeText={setPortfolioName}
                  placeholder="Např. Dlouhodobé investice"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Emoji</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiScroll}>
                  {['💼', '📈', '💰', '🚀', '💎', '🏦', '📊', '💵', '🎯', '⭐', '🔥', '💪'].map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      onPress={() => setSelectedEmoji(emoji)}
                      style={[
                        styles.emojiButton,
                        selectedEmoji === emoji && styles.emojiButtonSelected,
                      ]}
                    >
                      <Text style={styles.emojiText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Barva</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorScroll}>
                  {['#667eea', '#764ba2', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899'].map((color) => (
                    <TouchableOpacity
                      key={color}
                      onPress={() => setSelectedColor(color)}
                      style={[
                        styles.colorButton,
                        { backgroundColor: color },
                        selectedColor === color && styles.colorButtonSelected,
                      ]}
                    />
                  ))}
                </ScrollView>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Měna</Text>
                <View style={styles.currencyContainer}>
                  {['CZK', 'EUR', 'USD'].map((curr) => (
                    <TouchableOpacity
                      key={curr}
                      onPress={() => setSelectedCurrency(curr)}
                      style={[
                        styles.currencyButton,
                        selectedCurrency === curr && styles.currencyButtonSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.currencyText,
                          selectedCurrency === curr && styles.currencyTextSelected,
                        ]}
                      >
                        {curr}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleCreatePortfolio}
            >
              <LinearGradient
                colors={['#667eea', '#764ba2']}
                style={styles.submitButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.submitButtonText}>Vytvořit portfolio</Text>
              </LinearGradient>
            </TouchableOpacity>
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
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginTop: 24,
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 32,
    marginBottom: 32,
  },
  createFirstButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  createFirstGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  createFirstText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: 'white',
  },
  portfolioList: {
    gap: 16,
    paddingBottom: 32,
  },
  portfolioCard: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  portfolioGradient: {
    padding: 20,
  },
  portfolioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  portfolioInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    gap: 12,
  },
  portfolioTitleContainer: {
    flex: 1,
  },
  portfolioName: {
    fontSize: 20,
    fontWeight: 'bold' as const,
    color: 'white',
    marginBottom: 4,
  },
  portfolioEmoji: {
    fontSize: 28,
  },
  portfolioCurrency: {
    fontSize: 12,
    color: 'white',
    opacity: 0.8,
    marginTop: 2,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portfolioMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 12,
    color: 'white',
    opacity: 0.8,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: 'white',
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  portfolioFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  positionsCount: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
  },
  totalPortfolioCard: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 24,
  },
  totalIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    marginTop: 8,
  },
  createButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: 'white',
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
  formContainer: {
    gap: 20,
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
    color: '#1F2937',
  },
  emojiScroll: {
    flexGrow: 0,
  },
  emojiButton: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  emojiButtonSelected: {
    borderColor: '#667eea',
    backgroundColor: '#EEF2FF',
  },
  emojiText: {
    fontSize: 28,
  },
  colorScroll: {
    flexGrow: 0,
  },
  colorButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorButtonSelected: {
    borderColor: '#1F2937',
  },
  currencyContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  currencyButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  currencyButtonSelected: {
    borderColor: '#667eea',
    backgroundColor: '#EEF2FF',
  },
  currencyText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#6B7280',
  },
  currencyTextSelected: {
    color: '#667eea',
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
});
