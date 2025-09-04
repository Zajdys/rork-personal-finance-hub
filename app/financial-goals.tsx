import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Target,
  Plus,
  X,
  Edit3,
  Trash2,
  DollarSign,
  Calendar,
  TrendingUp,
  PiggyBank,
  Car,
  Home,
  Utensils,
  ShoppingBag,
  Fuel,
  RefreshCcw,
} from 'lucide-react-native';
import { Stack } from 'expo-router';
import { useFinanceStore, FinancialGoal, RecurrenceFrequency } from '@/store/finance-store';



const GOAL_CATEGORIES = {
  'Bydlení': { icon: Home, color: '#8B5CF6' },
  'Jídlo': { icon: Utensils, color: '#EF4444' },
  'Doprava': { icon: Car, color: '#10B981' },
  'Benzín': { icon: Fuel, color: '#F59E0B' },
  'Nákupy': { icon: ShoppingBag, color: '#EC4899' },
  'Spoření': { icon: PiggyBank, color: '#06B6D4' },
  'Investice': { icon: TrendingUp, color: '#8B5CF6' },
  'Ostatní': { icon: Target, color: '#6B7280' },
};


type TemplateGoal = { title: string; targetAmount: number; category: keyof typeof GOAL_CATEGORIES | 'Ostatní'; type: 'saving' | 'spending_limit'; recurring?: { isRecurring: boolean; frequency: RecurrenceFrequency; dayOfMonth?: number } };

const TEMPLATES: Array<{ id: string; title: string; description: string; color: string; goals: ReadonlyArray<TemplateGoal> }> = [
  {
    id: 'starter',
    title: 'Startér',
    description: 'Kompletní základ pro jednotlivce',
    color: '#10B981',
    goals: [
      { title: 'Nouzová rezerva 20 000 Kč', targetAmount: 20000, category: 'Spoření', type: 'saving' as const },
      { title: 'Nájem (měsíčně)', targetAmount: 12000, category: 'Bydlení', type: 'spending_limit' as const, recurring: { isRecurring: true, frequency: 'monthly' as RecurrenceFrequency, dayOfMonth: 1 } },
      { title: 'Energie a služby (měsíčně)', targetAmount: 2500, category: 'Bydlení', type: 'spending_limit' as const, recurring: { isRecurring: true, frequency: 'monthly' as RecurrenceFrequency, dayOfMonth: 15 } },
      { title: 'Internet/telefon (měsíčně)', targetAmount: 800, category: 'Bydlení', type: 'spending_limit' as const, recurring: { isRecurring: true, frequency: 'monthly' as RecurrenceFrequency, dayOfMonth: 10 } },
      { title: 'Jídlo (měsíční limit)', targetAmount: 6000, category: 'Jídlo', type: 'spending_limit' as const },
      { title: 'Doprava (MHD/benzín)', targetAmount: 1200, category: 'Doprava', type: 'spending_limit' as const },
      { title: 'Dovolená', targetAmount: 30000, category: 'Ostatní', type: 'saving' as const },
      { title: 'Rezerva na vybavení bytu', targetAmount: 10000, category: 'Bydlení', type: 'saving' as const },
    ],
  },
  {
    id: 'housing',
    title: 'Bydlení & hypotéka',
    description: 'Šablona pro nájem/hypotéku a provoz domácnosti',
    color: '#8B5CF6',
    goals: [
      { title: 'Hypotéka (měsíčně)', targetAmount: 18000, category: 'Bydlení', type: 'spending_limit' as const, recurring: { isRecurring: true, frequency: 'monthly' as RecurrenceFrequency, dayOfMonth: 15 } },
      { title: 'Energie (měsíčně)', targetAmount: 3500, category: 'Bydlení', type: 'spending_limit' as const, recurring: { isRecurring: true, frequency: 'monthly' as RecurrenceFrequency, dayOfMonth: 5 } },
      { title: 'Pojištění domácnosti/majetku (roční)', targetAmount: 3000, category: 'Bydlení', type: 'saving' as const },
      { title: 'FO fond (opravy bytu/domu)', targetAmount: 20000, category: 'Bydlení', type: 'saving' as const },
      { title: 'Internet/TV (měsíčně)', targetAmount: 900, category: 'Bydlení', type: 'spending_limit' as const, recurring: { isRecurring: true, frequency: 'monthly' as RecurrenceFrequency, dayOfMonth: 20 } },
      { title: 'Rezerva 3× měsíční náklady', targetAmount: 60000, category: 'Spoření', type: 'saving' as const },
      { title: 'Nákupy drogerie (měsíčně)', targetAmount: 1200, category: 'Nákupy', type: 'spending_limit' as const },
      { title: 'Jídlo (měsíčně)', targetAmount: 8000, category: 'Jídlo', type: 'spending_limit' as const },
    ],
  },
  {
    id: 'family',
    title: 'Rodinný rozpočet',
    description: 'Praktický plán pro domácnost se dvěma příjmy',
    color: '#6366F1',
    goals: [
      { title: 'Rezerva 6× měsíčních nákladů', targetAmount: 120000, category: 'Spoření', type: 'saving' as const },
      { title: 'Nájem (měsíčně)', targetAmount: 20000, category: 'Bydlení', type: 'spending_limit' as const, recurring: { isRecurring: true, frequency: 'monthly' as RecurrenceFrequency, dayOfMonth: 1 } },
      { title: 'Energie (měsíčně)', targetAmount: 4000, category: 'Bydlení', type: 'spending_limit' as const, recurring: { isRecurring: true, frequency: 'monthly' as RecurrenceFrequency, dayOfMonth: 10 } },
      { title: 'Jídlo (měsíční limit)', targetAmount: 10000, category: 'Jídlo', type: 'spending_limit' as const },
      { title: 'Auto: servis/pojistka (roční)', targetAmount: 15000, category: 'Doprava', type: 'spending_limit' as const, recurring: { isRecurring: true, frequency: 'yearly' as RecurrenceFrequency, dayOfMonth: 1 } },
      { title: 'Benzín (měsíčně)', targetAmount: 3000, category: 'Benzín', type: 'spending_limit' as const },
      { title: 'Dětské potřeby (měsíčně)', targetAmount: 2000, category: 'Nákupy', type: 'spending_limit' as const },
      { title: 'Dovolená', targetAmount: 40000, category: 'Ostatní', type: 'saving' as const },
    ],
  },
  {
    id: 'investor',
    title: 'Investiční růst',
    description: 'Dlouhodobé budování majetku a ochrana rizik',
    color: '#F59E0B',
    goals: [
      { title: 'Investiční kapitál', targetAmount: 100000, category: 'Investice', type: 'saving' as const },
      { title: 'Rezerva na daně', targetAmount: 20000, category: 'Ostatní', type: 'saving' as const },
      { title: 'Povinné výdaje (měsíční limit)', targetAmount: 15000, category: 'Ostatní', type: 'spending_limit' as const },
      { title: 'Zbytné výdaje (měsíční limit)', targetAmount: 4000, category: 'Ostatní', type: 'spending_limit' as const },
      { title: 'Dlouhodobé spoření (roční cíl)', targetAmount: 60000, category: 'Spoření', type: 'saving' as const },
    ],
  },
] as const;

export default function FinancialGoalsScreen() {
  const { 
    financialGoals: goals, 
    addFinancialGoal, 
    updateFinancialGoal, 
    deleteFinancialGoal, 
    loadData, 
    isLoaded 
  } = useFinanceStore();
  
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);
  const [goalTitle, setGoalTitle] = useState<string>('');
  const [goalAmount, setGoalAmount] = useState<string>('');
  const [goalCategory, setGoalCategory] = useState<string>('Ostatní');
  const [goalType, setGoalType] = useState<'saving' | 'spending_limit'>('saving');
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState<string>('1');

  useEffect(() => {
    if (!isLoaded) {
      loadData();
    }
  }, [isLoaded, loadData]);

  const deadlineDefault = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 12);
    return d;
  }, []);

  const applyTemplate = useCallback((templateId: string) => {
    const template = TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    Alert.alert(
      'Použít šablonu',
      `Nahradit aktuální cíle šablonou "${template.title}"?`,
      [
        { text: 'Zrušit', style: 'cancel' },
        {
          text: 'Použít',
          style: 'default',
          onPress: () => {
            try {
              goals.forEach(g => deleteFinancialGoal(g.id));
              template.goals.forEach((g, idx) => {
                const id = `${template.id}-${Date.now()}-${idx}`;
                const goalData: FinancialGoal = {
                  id,
                  title: g.title,
                  targetAmount: g.targetAmount,
                  currentAmount: 0,
                  category: g.category,
                  deadline: deadlineDefault,
                  type: g.type,
                  recurring: g.recurring,
                };
                addFinancialGoal(goalData);
              });
              Alert.alert('Hotovo', `Šablona "${template.title}" byla použita.`);
            } catch (e) {
              Alert.alert('Chyba', 'Nepodařilo se použít šablonu.');
              console.error(e);
            }
          }
        }
      ]
    );
  }, [goals, deleteFinancialGoal, addFinancialGoal, deadlineDefault]);

  const GoalCard = ({ goal }: { goal: FinancialGoal }) => {
    const progress = (goal.currentAmount / goal.targetAmount) * 100;
    const IconComponent = GOAL_CATEGORIES[(goal.category || 'Ostatní') as keyof typeof GOAL_CATEGORIES]?.icon || Target;
    const isOverLimit = goal.type === 'spending_limit' && goal.currentAmount > goal.targetAmount;
    const goalColor = GOAL_CATEGORIES[(goal.category || 'Ostatní') as keyof typeof GOAL_CATEGORIES]?.color || '#6B7280';
    
    return (
      <View style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <View style={styles.goalInfo}>
            <View style={[styles.goalIcon, { backgroundColor: goalColor + '20' }]}>
              <IconComponent color={goalColor} size={24} />
            </View>
            <View style={styles.goalDetails}>
              <Text style={styles.goalTitle}>{goal.title}</Text>
              <Text style={styles.goalCategory}>{goal.category || 'Ostatní'}</Text>
            </View>
          </View>
          <View style={styles.goalActions}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => {
                setEditingGoal(goal);
                setGoalTitle(goal.title);
                setGoalAmount(goal.targetAmount.toString());
                setGoalCategory(goal.category || 'Ostatní');
                setGoalType(goal.type);
                setIsRecurring(Boolean(goal.recurring?.isRecurring));
                setFrequency((goal.recurring?.frequency ?? 'monthly') as RecurrenceFrequency);
                setDayOfMonth(goal.recurring?.dayOfMonth ? String(goal.recurring.dayOfMonth) : '1');
                setShowAddModal(true);
              }}
            >
              <Edit3 color="#6B7280" size={16} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, styles.deleteButton]}
              onPress={() => {
                console.log('Delete button pressed for goal:', goal.id, goal.title);
                Alert.alert(
                  'Smazat cíl',
                  `Opravdu chceš smazat cíl "${goal.title}"?`,
                  [
                    { text: 'Zrušit', style: 'cancel' },
                    { 
                      text: 'Smazat', 
                      style: 'destructive',
                      onPress: async () => {
                        console.log('Deleting goal:', goal.id);
                        try {
                          deleteFinancialGoal(goal.id);
                          console.log('Goal deleted successfully');
                          Alert.alert('Úspěch! 🗑️', `Cíl "${goal.title}" byl smazán.`);
                        } catch (error) {
                          console.error('Error deleting goal:', error);
                          Alert.alert('Chyba', 'Nepodařilo se smazat cíl. Zkus to znovu.');
                        }
                      }
                    }
                  ]
                );
              }}
              testID={`delete-goal-${goal.id}`}
            >
              <Trash2 color="#EF4444" size={18} />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.goalProgress}>
          <View style={styles.progressHeader}>
            <Text style={styles.currentAmount}>
              {goal.currentAmount.toLocaleString('cs-CZ')} Kč
            </Text>
            <Text style={styles.targetAmount}>
              {goal.type === 'spending_limit' ? (goal.recurring?.isRecurring ? 'částka k úhradě' : 'limit') : 'cíl'}: {goal.targetAmount.toLocaleString('cs-CZ')} Kč
            </Text>
          </View>
          
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground}>
              <View 
                style={[
                  styles.progressBar, 
                  { 
                    width: `${Math.min(progress, 100)}%`, 
                    backgroundColor: isOverLimit ? '#EF4444' : goalColor
                  }
                ]} 
              />
            </View>
            <Text style={[
              styles.progressText,
              { color: isOverLimit ? '#EF4444' : goalColor }
            ]}>
              {Math.round(progress)}%
            </Text>
          </View>
          
          {isOverLimit && (
            <Text style={styles.overLimitText}>
              ⚠️ Překročil jsi limit o {(goal.currentAmount - goal.targetAmount).toLocaleString('cs-CZ')} Kč
            </Text>
          )}
          
          {goal.type === 'saving' && progress < 100 && (
            <Text style={styles.remainingText}>
              Zbývá: {(goal.targetAmount - goal.currentAmount).toLocaleString('cs-CZ')} Kč
            </Text>
          )}

          {goal.recurring?.isRecurring && (
            <View style={styles.recurringChip}>
              <Calendar color={goalColor} size={14} />
              <Text style={[styles.recurringText, { color: goalColor }]}>
                {goal.recurring.frequency === 'monthly' ? 'měsíčně' : 'ročně'}{goal.recurring.dayOfMonth ? `, den ${goal.recurring.dayOfMonth}` : ''}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const handleSaveGoal = () => {
    if (!goalTitle || !goalAmount) {
      Alert.alert('Chyba', 'Vyplň všechna pole');
      return;
    }

    const amount = parseFloat(goalAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Chyba', 'Zadej platnou částku');
      return;
    }

    const goalData: FinancialGoal = {
      id: editingGoal?.id || Date.now().toString(),
      title: goalTitle,
      targetAmount: amount,
      currentAmount: editingGoal?.currentAmount || 0,
      category: goalCategory,
      deadline: new Date(2024, 11, 31),
      type: goalType,
      recurring: isRecurring ? { isRecurring: true, frequency, dayOfMonth: Number(dayOfMonth) || 1 } : undefined,
    };

    if (editingGoal) {
      updateFinancialGoal(editingGoal.id, goalData);
    } else {
      addFinancialGoal(goalData);
    }

    setGoalTitle('');
    setGoalAmount('');
    setGoalCategory('Ostatní');
    setGoalType('saving');
    setEditingGoal(null);
    setShowAddModal(false);
    
    Alert.alert(
      'Úspěch! 🎯',
      `Cíl "${goalTitle}" byl ${editingGoal ? 'upraven' : 'přidán'}.`
    );
  };

  return (
    <>
      <Stack.Screen 
        options={{
          title: 'Finanční cíle',
          headerStyle: { backgroundColor: '#667eea' },
          headerTintColor: 'white',
          headerTitleStyle: { fontWeight: 'bold' },
        }} 
      />
      
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.headerTitle}>Finanční cíle</Text>
          <Text style={styles.headerSubtitle}>Nastav si cíle a sleduj pokrok</Text>
        </LinearGradient>

        {/* Quick Templates */}
        <View style={styles.templatesContainer}>
          <Text style={styles.sectionLabel}>Rychlé šablony</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {TEMPLATES.map(t => (
              <TouchableOpacity
                key={t.id}
                style={[styles.templateCard, { borderColor: t.color }]}
                onPress={() => applyTemplate(t.id)}
                testID={`apply-template-${t.id}`}
              >
                <LinearGradient
                  colors={[t.color, '#111827']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.templateGradient}
                >
                  <Text style={styles.templateTitle}>{t.title}</Text>
                  <Text style={styles.templateDesc}>{t.description}</Text>
                  <View style={styles.templateBadgesRow}>
                    {t.goals.map((g, i) => (
                      <View key={i} style={styles.templateBadge}>
                        <Text style={styles.templateBadgeText}>{g.title}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.templateApply}>Použít</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Add Goal Button */}
        <View style={styles.addButtonContainer}>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => {
              setEditingGoal(null);
              setGoalTitle('');
              setGoalAmount('');
              setGoalCategory('Ostatní');
              setGoalType('saving');
              setIsRecurring(false);
              setFrequency('monthly');
              setDayOfMonth('1');
              setShowAddModal(true);
            }}
            testID="open-add-goal"
          >
            <LinearGradient
              colors={['#10B981', '#059669']}
              style={styles.addButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Plus color="white" size={20} />
              <Text style={styles.addButtonText}>Přidat nový cíl</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Goals List */}
        <View style={styles.goalsContainer}>
          {goals.length === 0 ? (
            <View style={styles.emptyState}>
              <Target color="#9CA3AF" size={48} />
              <Text style={styles.emptyStateTitle}>Žádné cíle</Text>
              <Text style={styles.emptyStateText}>
                Přidej svůj první finanční cíl a začni sledovat pokrok
              </Text>
            </View>
          ) : (
            goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))
          )}
        </View>

        {/* Add/Edit Goal Modal */}
        <Modal
          visible={showAddModal}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <View style={styles.modalContainer} testID="goal-modal">
            <LinearGradient
              colors={['#10B981', '#059669']}
              style={styles.modalHeader}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.modalHeaderContent}>
                <TouchableOpacity
                  onPress={() => {
                    setShowAddModal(false);
                    setEditingGoal(null);
                  }}
                  style={styles.closeButton}
                >
                  <X color="white" size={24} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>
                  {editingGoal ? 'Upravit cíl' : 'Nový cíl'}
                </Text>
                <View style={styles.modalProgress} />
              </View>
            </LinearGradient>

            <ScrollView style={styles.modalContent}>
              {/* Goal Type Selector */}
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    goalType === 'saving' && styles.typeButtonActive
                  ]}
                  onPress={() => setGoalType('saving')}
                >
                  <PiggyBank color={goalType === 'saving' ? 'white' : '#10B981'} size={20} />
                  <Text style={[
                    styles.typeButtonText,
                    goalType === 'saving' && styles.typeButtonTextActive
                  ]}>Spoření</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    goalType === 'spending_limit' && styles.typeButtonActive
                  ]}
                  onPress={() => setGoalType('spending_limit')}
                >
                  <DollarSign color={goalType === 'spending_limit' ? 'white' : '#EF4444'} size={20} />
                  <Text style={[
                    styles.typeButtonText,
                    goalType === 'spending_limit' && styles.typeButtonTextActive
                  ]}>Limit výdajů</Text>
                </TouchableOpacity>
              </View>

              {/* Form Fields */}
              <View style={styles.formContainer}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Název cíle</Text>
                  <TextInput
                    style={styles.textInput}
                    value={goalTitle}
                    onChangeText={setGoalTitle}
                    placeholder={goalType === 'saving' ? 'Dovolená' : 'Nájem / Hypotéka / Předplatné'}
                    testID="goal-title-input"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    {goalType === 'saving' ? 'Cílová částka' : (isRecurring ? 'Částka k úhradě' : 'Maximální částka')} (Kč)
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    value={goalAmount}
                    onChangeText={setGoalAmount}
                    placeholder="50000"
                    keyboardType="numeric"
                    testID="goal-amount-input"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Kategorie</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categorySelector}>
                    {Object.entries(GOAL_CATEGORIES).map(([category, { icon: IconComponent, color }]) => (
                      <TouchableOpacity
                        key={category}
                        style={[
                          styles.categoryButton,
                          goalCategory === category && styles.categoryButtonActive,
                          { borderColor: color }
                        ]}
                        onPress={() => setGoalCategory(category)}
                        testID={`select-category-${category}`}
                      >
                        <IconComponent 
                          color={goalCategory === category ? 'white' : color} 
                          size={20} 
                        />
                        <Text style={[
                          styles.categoryButtonText,
                          goalCategory === category && styles.categoryButtonTextActive
                        ]}>
                          {category}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {goalType === 'spending_limit' && (
                  <View style={styles.recurringContainer}>
                    <View style={styles.recurringHeader}>
                      <View style={styles.recurringHeaderLeft}>
                        <RefreshCcw color="#10B981" size={18} />
                        <Text style={styles.recurringLabel}>Pravidelná platba</Text>
                      </View>
                      <Switch
                        value={isRecurring}
                        onValueChange={(v) => setIsRecurring(v)}
                        testID="toggle-recurring"
                      />
                    </View>

                    {isRecurring && (
                      <View style={styles.recurringFields}>
                        <View style={styles.frequencyRow}>
                          <TouchableOpacity
                            style={[styles.freqButton, frequency === 'monthly' && styles.freqButtonActive]}
                            onPress={() => setFrequency('monthly')}
                            testID="freq-monthly"
                          >
                            <Calendar color={frequency === 'monthly' ? 'white' : '#374151'} size={16} />
                            <Text style={[styles.freqButtonText, frequency === 'monthly' && styles.freqButtonTextActive]}>Měsíčně</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.freqButton, frequency === 'yearly' && styles.freqButtonActive]}
                            onPress={() => setFrequency('yearly')}
                            testID="freq-yearly"
                          >
                            <Calendar color={frequency === 'yearly' ? 'white' : '#374151'} size={16} />
                            <Text style={[styles.freqButtonText, frequency === 'yearly' && styles.freqButtonTextActive]}>Ročně</Text>
                          </TouchableOpacity>
                        </View>

                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>Den v měsíci</Text>
                          <TextInput
                            style={styles.textInput}
                            value={dayOfMonth}
                            onChangeText={setDayOfMonth}
                            keyboardType="numeric"
                            placeholder="1"
                            testID="day-of-month-input"
                          />
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSaveGoal}
                testID="save-goal"
              >
                <LinearGradient
                  colors={['#10B981', '#059669']}
                  style={styles.submitButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.submitButtonText}>
                    {editingGoal ? 'Uložit změny' : 'Přidat cíl'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 20,
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
  templatesContainer: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#111827',
    marginBottom: 12,
  },
  templateCard: {
    width: 260,
    marginRight: 12,
    borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: '#111827',
  },
  templateGradient: {
    padding: 16,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  templateTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  templateDesc: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginBottom: 8,
  },
  templateBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  templateBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 6,
  },
  templateBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
  templateApply: {
    color: 'white',
    fontSize: 12,
    opacity: 0.9,
  },
  addButtonContainer: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 24,
  },
  addButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  addButtonGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
  goalsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  goalCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  goalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  goalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  goalDetails: {
    flex: 1,
  },
  goalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  goalCategory: {
    fontSize: 12,
    color: '#6B7280',
  },
  goalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
  },
  goalProgress: {
    gap: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currentAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  targetAmount: {
    fontSize: 14,
    color: '#6B7280',
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBarBackground: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right',
  },
  recurringChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: '#F3F4F6',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginTop: 6,
  },
  recurringText: {
    fontSize: 12,
    fontWeight: '600',
  },
  overLimitText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  remainingText: {
    fontSize: 12,
    color: '#6B7280',
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
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 12,
  },
  typeButton: {
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
  typeButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 6,
  },
  typeButtonTextActive: {
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
  categorySelector: {
    flexDirection: 'row',
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'white',
    borderRadius: 20,
    borderWidth: 2,
    marginRight: 8,
  },
  categoryButtonActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  categoryButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 4,
  },
  categoryButtonTextActive: {
    color: 'white',
  },
  recurringContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    gap: 12,
  },
  recurringHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recurringHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recurringLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  recurringFields: {
    gap: 12,
  },
  frequencyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  freqButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  freqButtonActive: {
    backgroundColor: '#10B981',
  },
  freqButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  freqButtonTextActive: {
    color: 'white',
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
});


