import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Home,
  Car,
  Coffee,
  Gamepad2,
  Heart,
  Book,
  Smartphone,
} from 'lucide-react-native';
import { useFinanceStore, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/store/finance-store';
import { useBuddyStore } from '@/store/buddy-store';
import { useLanguageStore } from '@/store/language-store';

const EXPENSE_CATEGORY_ICONS = {
  'Jídlo a nápoje': Coffee,
  'Nájem a bydlení': Home,
  'Oblečení': ShoppingCart,
  'Doprava': Car,
  'Zábava': Gamepad2,
  'Zdraví': Heart,
  'Vzdělání': Book,
  'Nákupy': ShoppingCart,
  'Služby': Smartphone,
  'Ostatní': ShoppingCart,
};

const INCOME_CATEGORY_ICONS = {
  'Mzda': TrendingUp,
  'Freelance': TrendingUp,
  'Investice': TrendingUp,
  'Dary': TrendingUp,
  'Ostatní': TrendingUp,
};

export default function AddTransactionScreen() {
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  
  const { addTransaction } = useFinanceStore();
  const { addPoints, showBuddyMessage } = useBuddyStore();
  const { t } = useLanguageStore();

  const categoryData = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const categoryIcons = type === 'income' ? INCOME_CATEGORY_ICONS : EXPENSE_CATEGORY_ICONS;
  
  const categories = Object.entries(categoryData).map(([name, data]) => ({
    id: name,
    name,
    icon: categoryIcons[name as keyof typeof categoryIcons] || ShoppingCart,
    color: data.color,
  }));

  const handleSubmit = () => {
    if (!amount || !title || !selectedCategory) {
      Alert.alert(t('errorMessage'), t('fillAllFields'));
      return;
    }

    const numAmount = parseFloat(amount.replace(',', '.'));
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert(t('errorMessage'), t('enterValidAmount'));
      return;
    }

    addTransaction({
      id: Date.now().toString(),
      type,
      amount: numAmount,
      title,
      category: selectedCategory,
      date: new Date(),
    });

    addPoints(5);
    
    showBuddyMessage(
      type === 'income' 
        ? `${t('addedIncome')} ${numAmount.toLocaleString('cs-CZ')} Kč. ${t('dontForgetInvest')}`
        : `${t('recordedExpense')} ${numAmount.toLocaleString('cs-CZ')} Kč za ${selectedCategory}. ${t('watchBudget')}`
    );

    // Reset form
    setAmount('');
    setTitle('');
    setSelectedCategory('');
    
    Alert.alert(t('successMessage'), t('transactionAdded'));
  };

  const TypeSelector = () => (
    <View style={styles.typeSelector}>
      <TouchableOpacity
        style={[styles.typeButton, type === 'income' && styles.typeButtonActive]}
        onPress={() => {
          setType('income');
          setSelectedCategory('');
        }}
      >
        <LinearGradient
          colors={type === 'income' ? ['#10B981', '#059669'] : ['transparent', 'transparent']}
          style={styles.typeButtonGradient}
        >
          <TrendingUp color={type === 'income' ? 'white' : '#6B7280'} size={20} />
          <Text style={[styles.typeButtonText, type === 'income' && styles.typeButtonTextActive]}>
            {t('income')}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.typeButton, type === 'expense' && styles.typeButtonActive]}
        onPress={() => {
          setType('expense');
          setSelectedCategory('');
        }}
      >
        <LinearGradient
          colors={type === 'expense' ? ['#EF4444', '#DC2626'] : ['transparent', 'transparent']}
          style={styles.typeButtonGradient}
        >
          <TrendingDown color={type === 'expense' ? 'white' : '#6B7280'} size={20} />
          <Text style={[styles.typeButtonText, type === 'expense' && styles.typeButtonTextActive]}>
            {t('expense')}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const CategoryGrid = () => (
    <View style={styles.categoryGrid}>
      {categories.map((category) => {
        const Icon = category.icon;
        const isSelected = selectedCategory === category.id;
        
        return (
          <TouchableOpacity
            key={category.id}
            style={[styles.categoryCard, isSelected && styles.categoryCardSelected]}
            onPress={() => setSelectedCategory(category.id)}
          >
            <View style={[styles.categoryIcon, { backgroundColor: category.color + '20' }]}>
              <Icon color={isSelected ? 'white' : category.color} size={24} />
            </View>
            <Text style={[styles.categoryText, isSelected && styles.categoryTextSelected]}>
              {category.name}
            </Text>
            {isSelected && (
              <LinearGradient
                colors={[category.color, category.color + 'CC']}
                style={styles.categorySelectedOverlay}
              />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.headerTitle}>{t('addTransaction')}</Text>
        <Text style={styles.headerSubtitle}>{t('recordTransactions')}</Text>
      </LinearGradient>

      <View style={styles.content}>
        <TypeSelector />

        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>{t('amount')}</Text>
          <View style={styles.amountInputContainer}>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              keyboardType="numeric"
              placeholderTextColor="#9CA3AF"
            />
            <Text style={styles.currency}>Kč</Text>
          </View>
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>{t('description')}</Text>
          <TextInput
            style={styles.textInput}
            value={title}
            onChangeText={setTitle}
            placeholder={type === 'income' ? t('exampleSalary') : t('exampleShopping')}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>{t('category')}</Text>
          <CategoryGrid />
        </View>

        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <LinearGradient
            colors={type === 'income' ? ['#10B981', '#059669'] : ['#EF4444', '#DC2626']}
            style={styles.submitGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.submitText}>
              {type === 'income' ? t('addIncome') : t('addExpense')}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
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
    paddingBottom: 32,
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  typeSelector: {
    flexDirection: 'row',
    marginTop: -16,
    marginBottom: 32,
    gap: 12,
  },
  typeButton: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  typeButtonActive: {
    transform: [{ scale: 1.02 }],
  },
  typeButtonGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 8,
  },
  typeButtonTextActive: {
    color: 'white',
  },
  inputSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  currency: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
  },
  textInput: {
    backgroundColor: 'white',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    color: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    width: '47%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  categoryCardSelected: {
    transform: [{ scale: 1.02 }],
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
  },
  categoryTextSelected: {
    color: 'white',
    zIndex: 2,
  },
  categorySelectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  submitButton: {
    marginTop: 16,
    marginBottom: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  submitGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  submitText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
});