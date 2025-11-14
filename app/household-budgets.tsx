import React, { useState, useEffect } from 'react';
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
import { DollarSign, Plus, X, Save, TrendingUp, Trash2 } from 'lucide-react-native';
import { useHousehold } from '@/store/household-store';
import { useSettingsStore } from '@/store/settings-store';
import type { CategoryBudget } from '@/types/household';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_CATEGORIES = [
  { id: 'housing', name: 'Bydlení (Nájem)', icon: '🏠' },
  { id: 'food', name: 'Jídlo', icon: '🍽️' },
  { id: 'transport', name: 'Doprava', icon: '🚗' },
  { id: 'entertainment', name: 'Zábava', icon: '🎬' },
  { id: 'utilities', name: 'Energie', icon: '⚡' },
  { id: 'shopping', name: 'Nákupy', icon: '🛒' },
  { id: 'health', name: 'Zdraví', icon: '💊' },
  { id: 'education', name: 'Vzdělání', icon: '📚' },
];

interface CustomCategoryType {
  id: string;
  name: string;
  icon: string;
}

export default function HouseholdBudgetsScreen() {
  const { currentHousehold, setCategoryBudget } = useHousehold();
  const { getCurrentCurrency } = useSettingsStore();
  const currency = getCurrentCurrency();

  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [enabled, setEnabled] = useState<boolean>(true);
  const [notifyAt, setNotifyAt] = useState<string>('80');
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(true);
  const [customCategories, setCustomCategories] = useState<CustomCategoryType[]>([]);
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [newCategoryIcon, setNewCategoryIcon] = useState<string>('📦');

  useEffect(() => {
    loadCustomCategories();
  }, []);

  const loadCustomCategories = async () => {
    try {
      const stored = await AsyncStorage.getItem('household_custom_categories');
      if (stored) {
        setCustomCategories(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load custom categories:', error);
    }
  };

  const saveCustomCategories = async (categories: CustomCategoryType[]) => {
    try {
      await AsyncStorage.setItem('household_custom_categories', JSON.stringify(categories));
      setCustomCategories(categories);
    } catch (error) {
      console.error('Failed to save custom categories:', error);
    }
  };

  const allCategories = [...DEFAULT_CATEGORIES, ...customCategories];

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
      setNotificationsEnabled(budget.notifyAtPercentage !== undefined && budget.notifyAtPercentage > 0);
    } else {
      setAmount('');
      setEnabled(true);
      setNotifyAt('80');
      setNotificationsEnabled(true);
    }
    
    setShowEditModal(true);
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert('Chyba', 'Zadejte název kategorie');
      return;
    }

    const newCategory: CustomCategoryType = {
      id: `custom_${Date.now()}`,
      name: newCategoryName.trim(),
      icon: newCategoryIcon || '📦',
    };

    await saveCustomCategories([...customCategories, newCategory]);
    setNewCategoryName('');
    setNewCategoryIcon('📦');
    setShowAddCategoryModal(false);
    Alert.alert('Hotovo', `Kategorie "${newCategory.name}" byla přidána`);
  };

  const handleDeleteCustomCategory = async (categoryId: string) => {
    const category = customCategories.find(c => c.id === categoryId);
    if (!category) return;

    Alert.alert(
      'Smazat kategorii?',
      `Opravdu chcete smazat kategorii "${category.name}"? Rozpočet pro tuto kategorii bude také odstraněn.`,
      [
        { text: 'Zrušit', style: 'cancel' },
        {
          text: 'Smazat',
          style: 'destructive',
          onPress: async () => {
            const budget: CategoryBudget = {
              categoryId,
              monthlyLimit: 0,
              currency: currency.code,
              enabled: false,
            };
            await setCategoryBudget(categoryId, budget);
            await saveCustomCategories(customCategories.filter(c => c.id !== categoryId));
            Alert.alert('Hotovo', 'Kategorie byla smazána');
          },
        },
      ]
    );
  };

  const handleSaveBudget = async () => {
    if (!amount.trim() || parseFloat(amount) <= 0) {
      Alert.alert('Chyba', 'Zadejte platnou částku');
      return;
    }

    const notifyPercent = notificationsEnabled ? parseFloat(notifyAt) : 0;
    if (notificationsEnabled && (notifyPercent < 1 || notifyPercent > 100)) {
      Alert.alert('Chyba', 'Procento upozornění musí být mezi 1-100%');
      return;
    }

    try {
      const budget: CategoryBudget = {
        categoryId: selectedCategory,
        monthlyLimit: parseFloat(amount),
        currency: currency.code,
        enabled,
        notifyAtPercentage: notificationsEnabled ? notifyPercent : undefined,
      };
      
      await setCategoryBudget(selectedCategory, budget);
      
      const category = allCategories.find(c => c.id === selectedCategory);
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
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Kategorie</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddCategoryModal(true)}
            >
              <Plus size={18} color="#8B5CF6" strokeWidth={2.5} />
              <Text style={styles.addButtonText}>Přidat vlastní</Text>
            </TouchableOpacity>
          </View>
          {allCategories.map(category => {
            const budget = getBudgetForCategory(category.id);
            const hasLimit = budget && budget.enabled && budget.monthlyLimit > 0;
            
            const isCustom = customCategories.some(c => c.id === category.id);
            
            return (
              <View key={category.id} style={styles.categoryCardWrapper}>
                <TouchableOpacity
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
                {isCustom && (
                  <TouchableOpacity
                    style={styles.deleteCustomButton}
                    onPress={() => handleDeleteCustomCategory(category.id)}
                  >
                    <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {allCategories.find(c => c.id === selectedCategory)?.name || 'Kategorie'}
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
                  <View style={styles.switchRow}>
                    <View style={styles.switchLeft}>
                      <Text style={styles.label}>Upozornění na limit</Text>
                      <Text style={styles.labelSubtitle}>
                        Upozornit při dosažení určitého procenta
                      </Text>
                    </View>
                    <Switch
                      value={notificationsEnabled}
                      onValueChange={setNotificationsEnabled}
                      trackColor={{ false: '#E5E7EB', true: '#C4B5FD' }}
                      thumbColor={notificationsEnabled ? '#8B5CF6' : '#9CA3AF'}
                    />
                  </View>

                  {notificationsEnabled && (
                    <>
                      <Text style={styles.label}>Upozornit při ({notifyAt}%)</Text>
                      <TextInput
                        style={styles.input}
                        value={notifyAt}
                        onChangeText={text => {
                          const numericText = text.replace(/[^0-9]/g, '');
                          const value = Math.min(100, Math.max(1, parseInt(numericText) || 80));
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

      <Modal visible={showAddCategoryModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nová kategorie</Text>
              <TouchableOpacity onPress={() => setShowAddCategoryModal(false)}>
                <X size={24} color="#6B7280" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.label}>Název kategorie</Text>
              <TextInput
                style={styles.input}
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                placeholder="např. Domácí mazlíčci"
                autoFocus
              />

              <Text style={styles.label}>Ikona (emoji)</Text>
              <TextInput
                style={styles.input}
                value={newCategoryIcon}
                onChangeText={setNewCategoryIcon}
                placeholder="📦"
                maxLength={2}
              />
              <Text style={styles.helperText}>
                Vložte emoji, které reprezentuje vaši kategorii (např. 🐕 pro domácí mazlíčky)
              </Text>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleAddCategory}
              >
                <Plus size={20} color="#FFF" strokeWidth={2} />
                <Text style={styles.saveButtonText}>Přidat kategorii</Text>
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
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#1F2937',
  },
  addButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#8B5CF6',
  },
  categoryCardWrapper: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 8,
  },
  categoryCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    flex: 1,
  },
  deleteCustomButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
