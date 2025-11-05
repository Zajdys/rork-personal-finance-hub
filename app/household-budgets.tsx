import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Switch,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DollarSign, Plus, X, Save, TrendingUp } from 'lucide-react-native';
import { useHousehold } from '@/store/household-store';
import { useSettingsStore } from '@/store/settings-store';
import type { CategoryBudget } from '@/types/household';

const CATEGORIES = [
  { id: 'housing', name: 'Bydlení (Nájem)', icon: '🏠' },
  { id: 'food', name: 'Jídlo', icon: '🍽️' },
  { id: 'transport', name: 'Doprava', icon: '🚗' },
  { id: 'entertainment', name: 'Zábava', icon: '🎬' },
  { id: 'utilities', name: 'Energie', icon: '⚡' },
  { id: 'shopping', name: 'Nákupy', icon: '🛒' },
  { id: 'health', name: 'Zdraví', icon: '💊' },
  { id: 'education', name: 'Vzdělání', icon: '📚' },
];

export default function HouseholdBudgetsScreen() {
  const { currentHousehold, setCategoryBudget } = useHousehold();
  const { getCurrentCurrency } = useSettingsStore();
  const currency = getCurrentCurrency();

  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [enabled, setEnabled] = useState<boolean>(true);
  const [notifyAt, setNotifyAt] = useState<string>('80');

  const getBudgetForCategory = (categoryId: string): CategoryBudget | null => {
    return currentHousehold?.categoryBudgets[categoryId] || null;
  };

  const handleOpenEdit = (categoryId: string) => {
    setSelectedCategory(categoryId);
    const budget = getBudgetForCategory(categoryId);
    
    if (budget) {
      setAmount(String(budget.monthlyLimit));
      setEnabled(budget.enabled);
      setNotifyAt(String(budget.notifyAtPercentage || 80));
    } else {
      setAmount('');
      setEnabled(true);
      setNotifyAt('80');
    }
    
    setShowEditModal(true);
  };

  const handleSaveBudget = async () => {
    if (!amount.trim() || parseFloat(amount) <= 0) {
      Alert.alert('Chyba', 'Zadejte platnou částku');
      return;
    }

    const notifyPercent = parseFloat(notifyAt);
    if (notifyPercent < 0 || notifyPercent > 100) {
      Alert.alert('Chyba', 'Procento upozornění musí být mezi 0-100%');
      return;
    }

    try {
      const budget: CategoryBudget = {
        categoryId: selectedCategory,
        monthlyLimit: parseFloat(amount),
        currency: currency.code,
        enabled,
        notifyAtPercentage: notifyPercent,
      };
      
      await setCategoryBudget(selectedCategory, budget);
      
      const category = CATEGORIES.find(c => c.id === selectedCategory);
      Alert.alert(
        'Rozpočet uložen',
        `Měsíční limit pro "${category?.name}": ${parseFloat(amount).toLocaleString('cs-CZ')} ${currency.symbol}`
      );
      
      setShowEditModal(false);
    } catch (error) {
      Alert.alert('Chyba', 'Nepodařilo se uložit rozpočet');
      console.error(error);
    }
  };

  const handleRemoveBudget = async () => {
    Alert.alert(
      'Odstranit rozpočet?',
      'Opravdu chcete odstranit rozpočet pro tuto kategorii?',
      [
        { text: 'Zrušit', style: 'cancel' },
        {
          text: 'Odstranit',
          style: 'destructive',
          onPress: async () => {
            try {
              const budget: CategoryBudget = {
                categoryId: selectedCategory,
                monthlyLimit: 0,
                currency: currency.code,
                enabled: false,
              };
              await setCategoryBudget(selectedCategory, budget);
              setShowEditModal(false);
              Alert.alert('Hotovo', 'Rozpočet byl odstraněn');
            } catch (err) {
              Alert.alert('Chyba', 'Nepodařilo se odstranit rozpočet');
              console.error(err);
            }
          },
        },
      ]
    );
  };

  const getBudgetLabel = (budget: CategoryBudget | null): string => {
    if (!budget || !budget.enabled || budget.monthlyLimit === 0) {
      return 'Nenastaveno';
    }
    return `${budget.monthlyLimit.toLocaleString('cs-CZ')} ${currency.symbol}/měsíc`;
  };

  const totalMonthlyBudget = Object.values(currentHousehold?.categoryBudgets || {})
    .filter(b => b.enabled && b.monthlyLimit > 0)
    .reduce((sum, b) => sum + b.monthlyLimit, 0);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Rozpočty kategorií',
          headerShown: true,
        }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Měsíční rozpočty</Text>
          <Text style={styles.infoText}>
            Nastavte měsíční limity pro sdílené kategorie výdajů. Aplikace vás upozorní, když se blížíte k limitu nebo jej překročíte.
          </Text>
        </View>

        {totalMonthlyBudget > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <TrendingUp size={24} color="#8B5CF6" strokeWidth={2} />
              <Text style={styles.summaryTitle}>Celkový měsíční rozpočet</Text>
            </View>
            <Text style={styles.summaryAmount}>
              {totalMonthlyBudget.toLocaleString('cs-CZ')} {currency.symbol}
            </Text>
            <Text style={styles.summarySubtitle}>
              Součet všech aktivních rozpočtů
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kategorie</Text>
          {CATEGORIES.map(category => {
            const budget = getBudgetForCategory(category.id);
            const hasLimit = budget && budget.enabled && budget.monthlyLimit > 0;
            
            return (
              <TouchableOpacity
                key={category.id}
                style={styles.categoryCard}
                onPress={() => handleOpenEdit(category.id)}
              >
                <View style={styles.categoryLeft}>
                  <Text style={styles.categoryIcon}>{category.icon}</Text>
                  <View style={styles.categoryInfo}>
                    <Text style={styles.categoryName}>{category.name}</Text>
                    <Text style={[
                      styles.categoryBudget,
                      hasLimit && styles.categoryBudgetActive
                    ]}>
                      {getBudgetLabel(budget)}
                    </Text>
                  </View>
                </View>
                {hasLimit ? (
                  <View style={styles.activeBadge}>
                    <DollarSign size={16} color="#10B981" strokeWidth={2.5} />
                  </View>
                ) : (
                  <Plus size={20} color="#9CA3AF" strokeWidth={2} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {CATEGORIES.find(c => c.id === selectedCategory)?.name || 'Kategorie'}
              </Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <X size={24} color="#6B7280" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.switchRow}>
                <View style={styles.switchLeft}>
                  <Text style={styles.label}>Aktivní rozpočet</Text>
                  <Text style={styles.labelSubtitle}>
                    Sledovat a upozorňovat na překročení
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={setEnabled}
                  trackColor={{ false: '#E5E7EB', true: '#C4B5FD' }}
                  thumbColor={enabled ? '#8B5CF6' : '#9CA3AF'}
                />
              </View>

              <Text style={styles.label}>Měsíční limit ({currency.symbol})</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={text => {
                    const numericText = text.replace(/[^0-9.]/g, '');
                    setAmount(numericText);
                  }}
                  keyboardType="numeric"
                  placeholder="0"
                  editable={enabled}
                />
                <Text style={styles.currencySymbol}>{currency.symbol}</Text>
              </View>

              {enabled && (
                <>
                  <Text style={styles.label}>Upozornit při ({notifyAt}%)</Text>
                  <TextInput
                    style={styles.input}
                    value={notifyAt}
                    onChangeText={text => {
                      const numericText = text.replace(/[^0-9]/g, '');
                      const value = Math.min(100, Math.max(0, parseInt(numericText) || 0));
                      setNotifyAt(String(value));
                    }}
                    keyboardType="numeric"
                    placeholder="80"
                  />
                  <Text style={styles.helperText}>
                    Dostanete upozornění, když výdaje v této kategorii dosáhnou {notifyAt}% z limitu
                    {amount && parseFloat(amount) > 0 && ` (${((parseFloat(amount) * parseFloat(notifyAt)) / 100).toFixed(0)} ${currency.symbol})`}
                  </Text>
                </>
              )}

              {getBudgetForCategory(selectedCategory) && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={handleRemoveBudget}
                >
                  <Text style={styles.removeButtonText}>Odstranit rozpočet</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveBudget}
                disabled={!enabled && !getBudgetForCategory(selectedCategory)}
              >
                <Save size={20} color="#FFF" strokeWidth={2} />
                <Text style={styles.saveButtonText}>Uložit rozpočet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  infoBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1E40AF',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 14,
    color: '#3B82F6',
    lineHeight: 20,
  },
  summaryCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center' as const,
  },
  summaryHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
  },
  summaryAmount: {
    fontSize: 32,
    fontWeight: '800' as const,
    color: '#8B5CF6',
    marginBottom: 6,
  },
  summarySubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#1F2937',
    marginBottom: 12,
  },
  categoryCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  categoryLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    flex: 1,
  },
  categoryIcon: {
    fontSize: 28,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 3,
  },
  categoryBudget: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  categoryBudgetActive: {
    color: '#10B981',
    fontWeight: '600' as const,
  },
  activeBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D1FAE5',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end' as const,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#1F2937',
  },
  modalBody: {
    padding: 20,
    maxHeight: 500,
  },
  label: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 10,
    marginTop: 16,
  },
  labelSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  switchRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    marginBottom: 8,
  },
  switchLeft: {
    flex: 1,
    marginRight: 16,
  },
  inputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingRight: 16,
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: 18,
    color: '#1F2937',
    fontWeight: '600' as const,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#6B7280',
  },
  helperText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginTop: 8,
  },
  removeButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 14,
    marginTop: 24,
    alignItems: 'center' as const,
  },
  removeButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#DC2626',
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  saveButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
