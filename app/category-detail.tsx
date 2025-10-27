import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft } from 'lucide-react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useFinanceStore } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';

export default function CategoryDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category: string; type: 'income' | 'expense' }>();
  const { category, type } = params;
  const { getExpensesByCategory, getIncomesByCategory, getAllCategories, financialGoals } = useFinanceStore();
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  
  const transactions = type === 'expense' 
    ? getExpensesByCategory(category || '')
    : getIncomesByCategory(category || '');
  
  const allCategories = getAllCategories(type || 'expense');
  const categoryInfo = allCategories[category || ''] || { icon: '📦', color: '#6B7280' };
  
  const currentCurrency = getCurrentCurrency();
  
  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
  
  const categoryGoal = financialGoals.find(
    goal => goal.category === category && goal.type === 'spending_limit'
  );
  
  const budgetPercentage = categoryGoal 
    ? Math.round((totalAmount / categoryGoal.targetAmount) * 100)
    : null;
  
  const formatDate = (date: Date) => {
    const d = new Date(date);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen 
        options={{
          headerShown: false,
        }}
      />
      
      <LinearGradient
        colors={[categoryInfo.color, categoryInfo.color + 'CC']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft color="white" size={24} />
        </TouchableOpacity>
        
        <View style={styles.headerContent}>
          <Text style={styles.categoryIcon}>{categoryInfo.icon}</Text>
          <Text style={styles.headerTitle}>{category}</Text>
          <Text style={styles.headerSubtitle}>
            {transactions.length} {transactions.length === 1 ? 'transakce' : 'transakcí'}
          </Text>
          <Text style={styles.totalAmount}>
            {totalAmount.toLocaleString('cs-CZ')} {currentCurrency.symbol}
          </Text>
          {categoryGoal && budgetPercentage !== null && (
            <View style={styles.budgetInfoContainer}>
              <Text style={styles.budgetInfoText}>
                {budgetPercentage}% z budžetu {categoryGoal.targetAmount.toLocaleString('cs-CZ')} Kč
              </Text>
              {budgetPercentage > 100 && (
                <Text style={styles.overBudgetText}>
                  ⚠️ Překročen budžet o {(totalAmount - categoryGoal.targetAmount).toLocaleString('cs-CZ')} Kč
                </Text>
              )}
            </View>
          )}
        </View>
      </LinearGradient>
      
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.transactionsContainer}>
          {transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                Žádné transakce v této kategorii
              </Text>
            </View>
          ) : (
            transactions.map((transaction) => (
              <View 
                key={transaction.id}
                style={[
                  styles.transactionCard,
                  { backgroundColor: isDarkMode ? '#374151' : 'white' }
                ]}
              >
                <View style={styles.transactionLeft}>
                  <Text style={[
                    styles.transactionTitle,
                    { color: isDarkMode ? 'white' : '#1F2937' }
                  ]}>
                    {transaction.title}
                  </Text>
                  <Text style={[
                    styles.transactionDate,
                    { color: isDarkMode ? '#D1D5DB' : '#6B7280' }
                  ]}>
                    {formatDate(transaction.date)}
                  </Text>
                </View>
                
                <Text
                  style={[
                    styles.transactionAmount,
                    { color: type === 'income' ? '#10B981' : '#EF4444' }
                  ]}
                >
                  {type === 'income' ? '+' : '-'}
                  {transaction.amount.toLocaleString('cs-CZ')} {currentCurrency.symbol}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerContent: {
    alignItems: 'center',
  },
  categoryIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    marginBottom: 16,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
  },
  budgetInfoContainer: {
    marginTop: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  budgetInfoText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
  },
  overBudgetText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  transactionsContainer: {
    padding: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  transactionCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  transactionLeft: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 14,
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
});
