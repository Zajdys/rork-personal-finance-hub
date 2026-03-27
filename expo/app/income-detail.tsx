import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  TrendingUp,
  Lightbulb,
  Target,
  BarChart3,
  Plus,
  DollarSign,
  ArrowLeft,
} from 'lucide-react-native';
import { useFinanceStore, INCOME_CATEGORIES } from '@/store/finance-store';
import { useRouter, Stack } from 'expo-router';

export default function IncomeDetailScreen() {
  const { transactions, totalIncome } = useFinanceStore();
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('month');

  const incomeTransactions = transactions.filter(t => t.type === 'income');
  const averageIncome = incomeTransactions.length > 0 ? totalIncome / incomeTransactions.length : 0;
  
  // Analýza příjmů podle kategorií
  const getIncomeByCategory = () => {
    const categoryTotals: { [key: string]: number } = {};
    
    incomeTransactions.forEach(transaction => {
      const category = transaction.category || 'Ostatní';
      categoryTotals[category] = (categoryTotals[category] || 0) + transaction.amount;
    });
    
    return Object.entries(categoryTotals)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalIncome > 0 ? Math.round((amount / totalIncome) * 100) : 0,
        icon: INCOME_CATEGORIES[category as keyof typeof INCOME_CATEGORIES]?.icon || '💰',
        color: INCOME_CATEGORIES[category as keyof typeof INCOME_CATEGORIES]?.color || '#6B7280',
        transactions: incomeTransactions.filter(t => t.category === category).length,
      }))
      .sort((a, b) => b.amount - a.amount);
  };

  const categoryIncomes = getIncomeByCategory();

  // Analýza příjmů
  const getIncomeAnalysis = () => {
    const analysis = {
      highestCategory: categoryIncomes[0] || null,
      totalTransactions: incomeTransactions.length,
      averagePerTransaction: averageIncome,
      recommendations: [] as string[],
      insights: [] as string[],
    };

    // Doporučení na základě kategorií
    if (categoryIncomes.length > 0) {
      const mainCategory = categoryIncomes[0];
      if (mainCategory.category === 'Mzda' && mainCategory.percentage > 80) {
        analysis.insights.push('Většina tvých příjmů pochází z mzdy. To je stabilní, ale zvažuj diverzifikaci.');
        analysis.recommendations.push('Zkus najít vedlejší příjem nebo investovat do pasivních příjmů');
      }
      
      if (categoryIncomes.some(cat => cat.category === 'Investice')) {
        analysis.insights.push('Skvělé! Už máš příjmy z investic. To je cesta k finanční svobodě.');
      } else {
        analysis.recommendations.push('Zvažuj investování části příjmů pro budoucí pasivní příjmy');
      }

      if (categoryIncomes.some(cat => cat.category === 'Freelance')) {
        analysis.insights.push('Freelance příjmy ti dávají flexibilitu a možnost růstu.');
        analysis.recommendations.push('Zkus si vytvořit stabilnější freelance klientelu');
      }
    }

    // Obecná doporučení
    if (analysis.recommendations.length === 0) {
      analysis.recommendations.push('Sleduj své příjmy pravidelně a hledej možnosti jejich zvýšení');
      analysis.recommendations.push('Vytvoř si plán pro zvýšení příjmů v příštím roce');
    }

    return analysis;
  };

  const analysis = getIncomeAnalysis();

  const PeriodButton = ({ period, label }: { period: 'week' | 'month' | 'year', label: string }) => (
    <TouchableOpacity
      style={[
        styles.periodButton,
        selectedPeriod === period && styles.periodButtonActive
      ]}
      onPress={() => setSelectedPeriod(period)}
    >
      <Text style={[
        styles.periodButtonText,
        selectedPeriod === period && styles.periodButtonTextActive
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const StatCard = ({ title, value, icon: Icon, color, subtitle }: any) => (
    <View style={styles.statCard}>
      <View style={styles.statHeader}>
        <Icon color={color} size={20} />
        <Text style={styles.statTitle}>{title}</Text>
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
    </View>
  );

  const CategoryIncomeCard = ({ category }: any) => {
    const categoryData = INCOME_CATEGORIES[category.category as keyof typeof INCOME_CATEGORIES];

    return (
      <View style={styles.categoryDetailCard}>
        <View style={styles.categoryDetailHeader}>
          <View style={styles.categoryDetailIconContainer}>
            <Text style={styles.categoryDetailIcon}>{categoryData?.icon || '💰'}</Text>
          </View>
          <View style={styles.categoryDetailInfo}>
            <Text style={styles.categoryDetailName}>{category.category}</Text>
            <Text style={styles.categoryDetailCount}>
              {category.transactions} transakcí
            </Text>
          </View>
          <View style={styles.categoryDetailAmount}>
            <Text style={[styles.categoryDetailAmountText, { color: category.color }]}>
              +{category.amount.toLocaleString('cs-CZ')} Kč
            </Text>
            <Text style={styles.categoryDetailPercentage}>
              {category.percentage}% z celku
            </Text>
          </View>
        </View>
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBackground}>
            <View 
              style={[
                styles.progressBar, 
                { 
                  width: `${category.percentage}%`, 
                  backgroundColor: category.color 
                }
              ]} 
            />
          </View>
        </View>
      </View>
    );
  };

  const RecommendationCard = ({ type, title, description, icon: Icon }: any) => (
    <View style={[
      styles.recommendationCard,
      type === 'insight' ? styles.insightCard : styles.tipCard
    ]}>
      <View style={styles.recommendationHeader}>
        <Icon 
          color={type === 'insight' ? '#3B82F6' : '#10B981'} 
          size={20} 
        />
        <Text style={[
          styles.recommendationTitle,
          { color: type === 'insight' ? '#3B82F6' : '#10B981' }
        ]}>
          {title}
        </Text>
      </View>
      <Text style={styles.recommendationDescription}>{description}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={['#10B981', '#059669']}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft color="white" size={24} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Celkové příjmy</Text>
            <Text style={styles.headerAmount}>
              +{totalIncome.toLocaleString('cs-CZ')} Kč
            </Text>
          </View>
          <View style={styles.headerIcon}>
            <TrendingUp color="white" size={28} />
          </View>
        </View>
      </LinearGradient>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>

        {/* Add Income Button */}
        <View style={styles.addButtonContainer}>
          <TouchableOpacity
            style={styles.addIncomeButton}
            onPress={() => router.push('/(tabs)/add')}
          >
            <Plus color="white" size={20} />
            <Text style={styles.addIncomeButtonText}>Přidat příjem</Text>
          </TouchableOpacity>
        </View>

        {/* Period Selection */}
        <View style={styles.periodContainer}>
          <Text style={styles.sectionTitle}>Období</Text>
          <View style={styles.periodButtons}>
            <PeriodButton period="week" label="Týden" />
            <PeriodButton period="month" label="Měsíc" />
            <PeriodButton period="year" label="Rok" />
          </View>
        </View>

        {/* Statistics */}
        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>Statistiky</Text>
          <View style={styles.statsGrid}>
            <StatCard
              title="Počet transakcí"
              value={analysis.totalTransactions}
              icon={BarChart3}
              color="#6366F1"
              subtitle="za měsíc"
            />
            <StatCard
              title="Průměr na transakci"
              value={`${Math.round(analysis.averagePerTransaction).toLocaleString('cs-CZ')} Kč`}
              icon={Target}
              color="#8B5CF6"
            />
          </View>
        </View>

        {/* Categories Breakdown */}
        <View style={styles.categoriesContainer}>
          <Text style={styles.sectionTitle}>Příjmy podle kategorií</Text>
          {categoryIncomes.length > 0 ? (
            categoryIncomes.map((category, index) => (
              <CategoryIncomeCard key={index} category={category} />
            ))
          ) : (
            <View style={styles.emptyState}>
              <DollarSign color="#9CA3AF" size={48} />
              <Text style={styles.emptyStateText}>Zatím žádné příjmy</Text>
              <Text style={styles.emptyStateSubtext}>
                Začni přidáváním svých příjmů
              </Text>
              <TouchableOpacity 
                style={styles.addButton}
                onPress={() => router.push('/add')}
              >
                <Plus color="white" size={20} />
                <Text style={styles.addButtonText}>Přidat příjem</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Analysis & Recommendations */}
        {categoryIncomes.length > 0 && (
          <View style={styles.analysisContainer}>
            <Text style={styles.sectionTitle}>Analýza a doporučení</Text>
            
            {/* Insights */}
            {analysis.insights.map((insight, index) => (
              <RecommendationCard
                key={`insight-${index}`}
                type="insight"
                title="Pozorování"
                description={insight}
                icon={DollarSign}
              />
            ))}

            {/* Recommendations */}
            {analysis.recommendations.map((recommendation, index) => (
              <RecommendationCard
                key={`tip-${index}`}
                type="tip"
                title="Tip na zvýšení příjmů"
                description={recommendation}
                icon={Lightbulb}
              />
            ))}
          </View>
        )}

        {/* MoneyBuddy Insights */}
        <View style={styles.insightsContainer}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.insightsGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.insightsTitle}>💡 MoneyBuddy říká:</Text>
            <Text style={styles.insightsText}>
              {analysis.highestCategory 
                ? `Tvůj hlavní zdroj příjmů je ${analysis.highestCategory.category.toLowerCase()} (${analysis.highestCategory.percentage}%). ${
                    analysis.highestCategory.percentage > 90 
                      ? 'Zvažuj diverzifikaci příjmů pro větší finanční bezpečnost.'
                      : 'Máš dobře diverzifikované příjmy, to je skvělé!'
                  }`
                : 'Začni sledovat své příjmy pro lepší finanční plánování. Každá koruna se počítá!'}
            </Text>
            <TouchableOpacity 
              style={styles.chatButton}
              onPress={() => router.push('/chat')}
            >
              <Text style={styles.chatButtonText}>Zeptat se MoneyBuddy</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollView: {
    flex: 1,
  },
  headerGradient: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
    marginBottom: 4,
  },
  headerAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
  },
  headerIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodContainer: {
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  periodButtons: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  periodButtonTextActive: {
    color: '#1F2937',
  },
  statsContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statTitle: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 8,
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statSubtitle: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  categoriesContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  categoryDetailCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryDetailIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryDetailIcon: {
    fontSize: 24,
  },
  categoryDetailInfo: {
    flex: 1,
  },
  categoryDetailName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  categoryDetailCount: {
    fontSize: 12,
    color: '#6B7280',
  },
  categoryDetailAmount: {
    alignItems: 'flex-end',
  },
  categoryDetailAmountText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  categoryDetailPercentage: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  progressBarContainer: {
    marginTop: 8,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
    textAlign: 'center',
    marginBottom: 20,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
  analysisContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  recommendationCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  insightCard: {
    backgroundColor: '#DBEAFE',
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  tipCard: {
    backgroundColor: '#D1FAE5',
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  recommendationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  recommendationTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  recommendationDescription: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  insightsContainer: {
    marginHorizontal: 20,
    marginBottom: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  insightsGradient: {
    padding: 20,
  },
  insightsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  insightsText: {
    fontSize: 14,
    color: 'white',
    lineHeight: 20,
    marginBottom: 16,
    opacity: 0.9,
  },
  chatButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  chatButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  addButtonContainer: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  addIncomeButton: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  addIncomeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
});