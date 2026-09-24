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
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  Target,
  BarChart3,
  ArrowLeft,
  Plus,
} from 'lucide-react-native';
import { useFinanceStore, EXPENSE_CATEGORIES } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { useRouter, Stack } from 'expo-router';

export default function ExpenseDetailScreen() {
  const { isDarkMode } = useSettingsStore();
  const pageBg = isDarkMode ? '#0f0f0f' : '#f5f5f5';
  const cardBg = isDarkMode ? '#1c1c1e' : '#ffffff';
  const textMain = isDarkMode ? '#ffffff' : '#1a1a1a';
  const textSec = isDarkMode ? '#ababab' : '#666666';
  const mutedBg = isDarkMode ? '#2c2c2e' : '#f3f4f6';

  const { transactions, totalExpenses, categoryExpenses } = useFinanceStore();
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('month');

  const expenseTransactions = transactions.filter(t => t.type === 'expense');
  const averageExpense = expenseTransactions.length > 0 ? totalExpenses / expenseTransactions.length : 0;
  
  // Analýza výdajů
  const getExpenseAnalysis = () => {
    const analysis = {
      highestCategory: categoryExpenses[0] || null,
      totalTransactions: expenseTransactions.length,
      averagePerTransaction: averageExpense,
      recommendations: [] as string[],
      warnings: [] as string[],
    };

    // Doporučení na základě kategorií
    categoryExpenses.forEach(category => {
      if (category.category === 'Jídlo a nápoje' && category.percentage > 30) {
        analysis.warnings.push('Utrácíš příliš za jídlo a nápoje (více než 30%)');
        analysis.recommendations.push('Zkus více vařit doma místo objednávání jídla');
      }
      if (category.category === 'Zábava' && category.percentage > 20) {
        analysis.warnings.push('Vysoké výdaje za zábavu (více než 20%)');
        analysis.recommendations.push('Hledej levnější alternativy zábavy');
      }
      if (category.category === 'Oblečení' && category.percentage > 15) {
        analysis.warnings.push('Vysoké výdaje za oblečení');
        analysis.recommendations.push('Nakupuj oblečení pouze když je potřeba');
      }
    });

    // Obecná doporučení
    if (analysis.recommendations.length === 0) {
      analysis.recommendations.push('Skvělá práce! Tvé výdaje vypadají vyváženě');
      analysis.recommendations.push('Zkus si stanovit měsíční rozpočet pro každou kategorii');
    }

    return analysis;
  };

  const analysis = getExpenseAnalysis();

  const PeriodButton = ({ period, label }: { period: 'week' | 'month' | 'year', label: string }) => (
    <TouchableOpacity
      style={[
        styles.periodButton,
        selectedPeriod === period && [styles.periodButtonActive, { backgroundColor: cardBg }],
      ]}
      onPress={() => setSelectedPeriod(period)}
    >
      <Text
        style={[
          styles.periodButtonText,
          { color: textSec },
          selectedPeriod === period && [styles.periodButtonTextActive, { color: textMain }],
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const StatCard = ({ title, value, icon: Icon, color, subtitle }: any) => (
    <View style={[styles.statCard, { backgroundColor: cardBg }]}>
      <View style={styles.statHeader}>
        <Icon color={color} size={20} />
        <Text style={[styles.statTitle, { color: textSec }]}>{title}</Text>
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {subtitle && <Text style={[styles.statSubtitle, { color: textSec }]}>{subtitle}</Text>}
    </View>
  );

  const CategoryDetailCard = ({ category }: any) => {
    const categoryData = EXPENSE_CATEGORIES[category.category as keyof typeof EXPENSE_CATEGORIES];
    const categoryTransactions = transactions.filter(
      t => t.type === 'expense' && t.category === category.category
    );

    return (
      <TouchableOpacity
        style={[styles.categoryDetailCard, { backgroundColor: cardBg }]}
        onPress={() =>
          router.push({
            pathname: '/category-detail',
            params: { category: category.category, type: 'expense' },
          })
        }
      >
        <View style={styles.categoryDetailHeader}>
          <View style={[styles.categoryDetailIconContainer, { backgroundColor: mutedBg }]}>
            <Text style={styles.categoryDetailIcon}>{categoryData?.icon || '📦'}</Text>
          </View>
          <View style={styles.categoryDetailInfo}>
            <Text style={[styles.categoryDetailName, { color: textMain }]}>{category.category}</Text>
            <Text style={[styles.categoryDetailCount, { color: textSec }]}>
              {categoryTransactions.length} transakcí
            </Text>
          </View>
          <View style={styles.categoryDetailAmount}>
            <Text style={[styles.categoryDetailAmountText, { color: category.color }]}>
              {category.amount.toLocaleString('cs-CZ')} Kč
            </Text>
            <Text style={[styles.categoryDetailPercentage, { color: textSec }]}>
              {category.percentage}% z celku
            </Text>
          </View>
        </View>
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBarBackground, { backgroundColor: mutedBg }]}>
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
      </TouchableOpacity>
    );
  };

  const RecommendationCard = ({ type, title, description, icon: Icon }: any) => (
    <View
      style={[
        styles.recommendationCard,
        type === 'warning'
          ? [
              styles.warningCard,
              {
                backgroundColor: isDarkMode ? 'rgba(245,158,11,0.22)' : '#FEF3C7',
                borderLeftColor: '#F59E0B',
              },
            ]
          : [
              styles.tipCard,
              {
                backgroundColor: isDarkMode ? 'rgba(16,185,129,0.22)' : '#D1FAE5',
                borderLeftColor: '#10B981',
              },
            ],
      ]}
    >
      <View style={styles.recommendationHeader}>
        <Icon 
          color={type === 'warning' ? '#F59E0B' : '#10B981'} 
          size={20} 
        />
        <Text style={[
          styles.recommendationTitle,
          { color: type === 'warning' ? '#F59E0B' : '#10B981' }
        ]}>
          {title}
        </Text>
      </View>
      <Text style={[styles.recommendationDescription, { color: textMain }]}>{description}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={['#EF4444', '#DC2626']}
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
            <Text style={styles.headerTitle}>Celkové výdaje</Text>
            <Text style={styles.headerAmount}>
              {totalExpenses.toLocaleString('cs-CZ')} Kč
            </Text>
          </View>
          <View style={styles.headerIcon}>
            <TrendingDown color="white" size={28} />
          </View>
        </View>
      </LinearGradient>
      <ScrollView
        style={[styles.scrollView, { flex: 1, backgroundColor: pageBg }]}
        showsVerticalScrollIndicator={false}
      >

        {/* Add Expense Button */}
        <View style={styles.addButtonContainer}>
          <TouchableOpacity
            style={styles.addExpenseButton}
            onPress={() => router.push('/(tabs)/add')}
          >
            <Plus color="white" size={20} />
            <Text style={styles.addExpenseButtonText}>Přidat výdaj</Text>
          </TouchableOpacity>
        </View>

        {/* Period Selection */}
        <View style={styles.periodContainer}>
          <Text style={[styles.sectionTitle, { color: textMain }]}>Období</Text>
          <View style={[styles.periodButtons, { backgroundColor: mutedBg }]}>
            <PeriodButton period="week" label="Týden" />
            <PeriodButton period="month" label="Měsíc" />
            <PeriodButton period="year" label="Rok" />
          </View>
        </View>

        {/* Statistics */}
        <View style={styles.statsContainer}>
          <Text style={[styles.sectionTitle, { color: textMain }]}>Statistiky</Text>
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
          <Text style={[styles.sectionTitle, { color: textMain }]}>Výdaje podle kategorií</Text>
          {categoryExpenses.map((category, index) => (
            <CategoryDetailCard key={index} category={category} />
          ))}
        </View>

        {/* Analysis & Recommendations */}
        <View style={styles.analysisContainer}>
          <Text style={[styles.sectionTitle, { color: textMain }]}>Analýza a doporučení</Text>
          
          {/* Warnings */}
          {analysis.warnings.map((warning, index) => (
            <RecommendationCard
              key={`warning-${index}`}
              type="warning"
              title="Upozornění"
              description={warning}
              icon={AlertTriangle}
            />
          ))}

          {/* Recommendations */}
          {analysis.recommendations.map((recommendation, index) => (
            <RecommendationCard
              key={`tip-${index}`}
              type="tip"
              title="Tip na úsporu"
              description={recommendation}
              icon={Lightbulb}
            />
          ))}
        </View>

        {/* Tip */}
        <View style={styles.insightsContainer}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.insightsGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.insightsTitle}>💡 Tip:</Text>
            <Text style={styles.insightsText}>
              {analysis.highestCategory 
                ? `Nejvíce utrácíš za ${analysis.highestCategory.category.toLowerCase()} (${analysis.highestCategory.percentage}%). Zkus si pro tuto kategorii stanovit měsíční limit a sleduj ho.`
                : 'Přidej více transakcí nebo naimportuj výpis z banky pro přesnější přehled.'}
            </Text>
            <TouchableOpacity 
              style={styles.chatButton}
              onPress={() => router.push('/bank-import')}
            >
              <Text style={styles.chatButtonText}>Importovat bankovní výpis</Text>
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
    marginBottom: 16,
  },
  periodButtons: {
    flexDirection: 'row',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  periodButtonTextActive: {},
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
  },
  categoriesContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  categoryDetailCard: {
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
    marginBottom: 2,
  },
  categoryDetailCount: {
    fontSize: 12,
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
  },
  progressBarContainer: {
    marginTop: 8,
  },
  progressBarBackground: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
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
  warningCard: {
    borderLeftWidth: 4,
  },
  tipCard: {
    borderLeftWidth: 4,
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
  addExpenseButton: {
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  addExpenseButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
});