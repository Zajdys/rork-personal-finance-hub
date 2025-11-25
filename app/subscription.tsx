import React, { useState, useEffect } from 'react';
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
  ArrowLeft,
  Calendar,
  DollarSign,
  Tag,
  Check,
  Trash2,
} from 'lucide-react-native';
import { useFinanceStore, EXPENSE_CATEGORIES } from '@/store/finance-store';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useSettingsStore } from '@/store/settings-store';

export default function EditSubscriptionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { subscriptions, updateSubscription, deleteSubscription } = useFinanceStore();
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const router = useRouter();
  const currentCurrency = getCurrentCurrency();

  const subscription = subscriptions.find((s) => s.id === id);

  const [name, setName] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Služby');
  const [dayOfMonth, setDayOfMonth] = useState<string>('1');

  useEffect(() => {
    if (subscription) {
      setName(subscription.name);
      setAmount(subscription.amount.toString());
      setSelectedCategory(subscription.category);
      setDayOfMonth(subscription.dayOfMonth.toString());
    }
  }, [subscription]);

  if (!subscription) {
    return (
      <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            Předplatné nenalezeno
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButtonError}>
            <Text style={styles.backButtonErrorText}>Zpět</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Chyba', 'Zadej název předplatného');
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Chyba', 'Zadej platnou částku');
      return;
    }

    const parsedDay = parseInt(dayOfMonth);
    if (isNaN(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      Alert.alert('Chyba', 'Zadej platný den v měsíci (1-31)');
      return;
    }

    updateSubscription(id!, {
      name: name.trim(),
      amount: parsedAmount,
      category: selectedCategory,
      dayOfMonth: parsedDay,
    });

    Alert.alert('Hotovo', 'Předplatné bylo aktualizováno', [
      {
        text: 'OK',
        onPress: () => router.back(),
      },
    ]);
  };

  const handleDelete = () => {
    Alert.alert(
      'Smazat předplatné',
      'Opravdu chceš smazat toto předplatné?',
      [
        {
          text: 'Zrušit',
          style: 'cancel',
        },
        {
          text: 'Smazat',
          style: 'destructive',
          onPress: () => {
            deleteSubscription(id!);
            router.back();
          },
        },
      ]
    );
  };

  const categories = Object.keys(EXPENSE_CATEGORIES);

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <LinearGradient
        colors={['#667eea', '#764ba2']}
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
            <Text style={styles.headerTitle}>Upravit předplatné</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={[styles.card, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
            <View style={styles.inputGroup}>
              <View style={styles.inputLabel}>
                <Tag color="#667eea" size={20} />
                <Text style={[styles.labelText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  Název
                </Text>
              </View>
              <TextInput
                style={[styles.input, { 
                  backgroundColor: isDarkMode ? '#374151' : '#F3F4F6',
                  color: isDarkMode ? 'white' : '#1F2937'
                }]}
                value={name}
                onChangeText={setName}
                placeholder="např. Netflix, Spotify..."
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputLabel}>
                <DollarSign color="#667eea" size={20} />
                <Text style={[styles.labelText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  Měsíční částka
                </Text>
              </View>
              <View style={styles.amountInputContainer}>
                <TextInput
                  style={[styles.input, { 
                    backgroundColor: isDarkMode ? '#374151' : '#F3F4F6',
                    color: isDarkMode ? 'white' : '#1F2937',
                    flex: 1
                  }]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                  keyboardType="numeric"
                />
                <Text style={[styles.currencyText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  {currentCurrency.symbol}
                </Text>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.inputLabel}>
                <Calendar color="#667eea" size={20} />
                <Text style={[styles.labelText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  Den platby v měsíci
                </Text>
              </View>
              <TextInput
                style={[styles.input, { 
                  backgroundColor: isDarkMode ? '#374151' : '#F3F4F6',
                  color: isDarkMode ? 'white' : '#1F2937'
                }]}
                value={dayOfMonth}
                onChangeText={setDayOfMonth}
                placeholder="1-31"
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
            <View style={styles.inputLabel}>
              <Tag color="#667eea" size={20} />
              <Text style={[styles.labelText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                Kategorie
              </Text>
            </View>
            
            <View style={styles.categoriesGrid}>
              {categories.map((category) => {
                const categoryInfo = EXPENSE_CATEGORIES[category as keyof typeof EXPENSE_CATEGORIES];
                const isSelected = selectedCategory === category;
                
                return (
                  <TouchableOpacity
                    key={category}
                    style={[
                      styles.categoryButton,
                      {
                        backgroundColor: isSelected 
                          ? '#667eea' 
                          : isDarkMode ? '#374151' : '#F3F4F6',
                      }
                    ]}
                    onPress={() => setSelectedCategory(category)}
                  >
                    <Text style={styles.categoryEmoji}>{categoryInfo.icon}</Text>
                    <Text style={[
                      styles.categoryText,
                      { color: isSelected ? 'white' : isDarkMode ? '#D1D5DB' : '#1F2937' }
                    ]}>
                      {category}
                    </Text>
                    {isSelected && (
                      <Check color="white" size={16} style={styles.checkIcon} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
          >
            <LinearGradient
              colors={['#10B981', '#059669']}
              style={styles.saveButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Check color="white" size={20} />
              <Text style={styles.saveButtonText}>Uložit změny</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
          >
            <Trash2 color="#EF4444" size={20} />
            <Text style={styles.deleteButtonText}>Smazat předplatné</Text>
          </TouchableOpacity>
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
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  content: {
    padding: 20,
  },
  card: {
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
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  labelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1F2937',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  currencyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  categoryEmoji: {
    fontSize: 16,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  checkIcon: {
    marginLeft: 4,
  },
  saveButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  saveButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 20,
  },
  backButtonError: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#667eea',
    borderRadius: 12,
  },
  backButtonErrorText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
