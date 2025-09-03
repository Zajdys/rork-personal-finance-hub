import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
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
} from 'lucide-react-native';
import { Stack } from 'expo-router';

interface FinancialGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  category: string;
  deadline: Date;
  type: 'saving' | 'spending_limit';
  icon: string;
  color: string;
}

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

const SAMPLE_GOALS: FinancialGoal[] = [
  {
    id: '1',
    title: 'Benzín do auta',
    targetAmount: 4000,
    currentAmount: 2800,
    category: 'Benzín',
    deadline: new Date(2024, 11, 31),
    type: 'spending_limit',
    icon: 'Fuel',
    color: '#F59E0B',
  },
  {
    id: '2',
    title: 'Jídlo na měsíc',
    targetAmount: 8200,
    currentAmount: 6500,
    category: 'Jídlo',
    deadline: new Date(2024, 11, 31),
    type: 'spending_limit',
    icon: 'Utensils',
    color: '#EF4444',
  },
  {
    id: '3',
    title: 'Dovolená',
    targetAmount: 50000,
    currentAmount: 32000,
    category: 'Spoření',
    deadline: new Date(2024, 5, 15),
    type: 'saving',
    icon: 'PiggyBank',
    color: '#06B6D4',
  },
];

export default function FinancialGoalsScreen() {
  const [goals, setGoals] = useState<FinancialGoal[]>(SAMPLE_GOALS);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);
  const [goalTitle, setGoalTitle] = useState<string>('');
  const [goalAmount, setGoalAmount] = useState<string>('');
  const [goalCategory, setGoalCategory] = useState<string>('Ostatní');
  const [goalType, setGoalType] = useState<'saving' | 'spending_limit'>('saving');

  const GoalCard = ({ goal }: { goal: FinancialGoal }) => {
    const progress = (goal.currentAmount / goal.targetAmount) * 100;
    const IconComponent = GOAL_CATEGORIES[goal.category as keyof typeof GOAL_CATEGORIES]?.icon || Target;
    const isOverLimit = goal.type === 'spending_limit' && goal.currentAmount > goal.targetAmount;
    
    return (
      <View style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <View style={styles.goalInfo}>
            <View style={[styles.goalIcon, { backgroundColor: goal.color + '20' }]}>
              <IconComponent color={goal.color} size={24} />
            </View>
            <View style={styles.goalDetails}>
              <Text style={styles.goalTitle}>{goal.title}</Text>
              <Text style={styles.goalCategory}>{goal.category}</Text>
            </View>
          </View>
          <View style={styles.goalActions}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => {
                setEditingGoal(goal);
                setGoalTitle(goal.title);
                setGoalAmount(goal.targetAmount.toString());
                setGoalCategory(goal.category);
                setGoalType(goal.type);
                setShowAddModal(true);
              }}
            >
              <Edit3 color="#6B7280" size={16} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => {
                Alert.alert(
                  'Smazat cíl',
                  `Opravdu chceš smazat cíl "${goal.title}"?`,
                  [
                    { text: 'Zrušit', style: 'cancel' },
                    { 
                      text: 'Smazat', 
                      style: 'destructive',
                      onPress: () => setGoals(prev => prev.filter(g => g.id !== goal.id))
                    }
                  ]
                );
              }}
            >
              <Trash2 color="#EF4444" size={16} />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.goalProgress}>
          <View style={styles.progressHeader}>
            <Text style={styles.currentAmount}>
              {goal.currentAmount.toLocaleString('cs-CZ')} Kč
            </Text>
            <Text style={styles.targetAmount}>
              {goal.type === 'spending_limit' ? 'limit' : 'cíl'}: {goal.targetAmount.toLocaleString('cs-CZ')} Kč
            </Text>
          </View>
          
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground}>
              <View 
                style={[
                  styles.progressBar, 
                  { 
                    width: `${Math.min(progress, 100)}%`, 
                    backgroundColor: isOverLimit ? '#EF4444' : goal.color
                  }
                ]} 
              />
            </View>
            <Text style={[
              styles.progressText,
              { color: isOverLimit ? '#EF4444' : goal.color }
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
      icon: goalCategory,
      color: GOAL_CATEGORIES[goalCategory as keyof typeof GOAL_CATEGORIES]?.color || '#6B7280',
    };

    if (editingGoal) {
      setGoals(prev => prev.map(g => g.id === editingGoal.id ? goalData : g));
    } else {
      setGoals(prev => [...prev, goalData]);
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
              setShowAddModal(true);
            }}
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
          <View style={styles.modalContainer}>
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
                    placeholder={goalType === 'saving' ? 'Dovolená' : 'Max za benzín'}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    {goalType === 'saving' ? 'Cílová částka' : 'Maximální částka'} (Kč)
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    value={goalAmount}
                    onChangeText={setGoalAmount}
                    placeholder="50000"
                    keyboardType="numeric"
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
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSaveGoal}
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
  addButtonContainer: {
    marginHorizontal: 20,
    marginTop: 20,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
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