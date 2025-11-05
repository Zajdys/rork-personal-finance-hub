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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Save, Trash2, Calendar, Tag, FileText } from 'lucide-react-native';
import { useBankStore } from '@/store/bank-store';
import { useSettingsStore } from '@/store/settings-store';
import { useFinanceStore, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/store/finance-store';

export default function EditBankTransactionScreen() {
  const { transactionId } = useLocalSearchParams();
  const router = useRouter();
  const { isDarkMode } = useSettingsStore();
  const { transactions, updateTransaction } = useBankStore();
  const { getAllCategories } = useFinanceStore();

  const transaction = transactions.find(t => t.id === transactionId);

  const [description, setDescription] = useState(transaction?.description || '');
  const [category, setCategory] = useState(transaction?.category || '');
  const [customCategory, setCustomCategory] = useState('');

  if (!transaction) {
    return (
      <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
        <Stack.Screen
          options={{
            title: 'Transakce nenalezena',
            headerStyle: { backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF' },
            headerTintColor: isDarkMode ? '#FFFFFF' : '#000000',
          }}
        />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
            Transakce nenalezena
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Zpět</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const allCategories = getAllCategories(transaction.type);
  const categoryKeys = Object.keys(allCategories);

  const handleSave = () => {
    const finalCategory = customCategory.trim() || category;

    if (!finalCategory) {
      Alert.alert('Chyba', 'Musíte vybrat nebo zadat kategorii');
      return;
    }

    updateTransaction(transaction.id, {
      description: description.trim(),
      category: finalCategory,
    });

    Alert.alert('Úspěch', 'Transakce byla aktualizována', [
      { text: 'OK', onPress: () => router.back() }
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen
        options={{
          title: 'Upravit transakci',
          headerStyle: {
            backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
          },
          headerTintColor: isDarkMode ? '#FFFFFF' : '#000000',
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ marginLeft: 16 }}
            >
              <ArrowLeft color={isDarkMode ? '#FFFFFF' : '#000000'} size={24} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <LinearGradient
            colors={transaction.type === 'income' ? ['#10B981', '#059669'] : ['#EF4444', '#DC2626']}
            style={styles.headerCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.headerLabel}>
              {transaction.type === 'income' ? 'Příjem' : 'Výdaj'}
            </Text>
            <Text style={styles.headerAmount}>
              {transaction.amount.toLocaleString('cs-CZ')} Kč
            </Text>
            <Text style={styles.headerDate}>
              {new Date(transaction.date).toLocaleDateString('cs-CZ', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
              })}
            </Text>
          </LinearGradient>

          <View style={[styles.section, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
            <View style={styles.sectionHeader}>
              <FileText color={isDarkMode ? '#D1D5DB' : '#6B7280'} size={20} />
              <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                Popis transakce
              </Text>
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDarkMode ? '#374151' : '#F9FAFB',
                  color: isDarkMode ? 'white' : '#1F2937',
                  borderColor: isDarkMode ? '#4B5563' : '#E5E7EB',
                }
              ]}
              value={description}
              onChangeText={setDescription}
              placeholder="Zadejte popis transakce"
              placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
            />
            <Text style={[styles.hint, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              Původní: {transaction.description}
            </Text>
          </View>

          <View style={[styles.section, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
            <View style={styles.sectionHeader}>
              <Tag color={isDarkMode ? '#D1D5DB' : '#6B7280'} size={20} />
              <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                Kategorie
              </Text>
            </View>

            <View style={styles.categoriesGrid}>
              {categoryKeys.map((cat) => {
                const isSelected = category === cat && !customCategory;
                const { icon, color } = allCategories[cat];
                
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryCard,
                      {
                        backgroundColor: isSelected
                          ? color + '20'
                          : isDarkMode ? '#374151' : '#F9FAFB',
                        borderColor: isSelected ? color : (isDarkMode ? '#4B5563' : '#E5E7EB'),
                      }
                    ]}
                    onPress={() => {
                      setCategory(cat);
                      setCustomCategory('');
                    }}
                  >
                    <Text style={styles.categoryIcon}>{icon}</Text>
                    <Text
                      style={[
                        styles.categoryName,
                        { color: isSelected ? color : (isDarkMode ? '#D1D5DB' : '#6B7280') }
                      ]}
                      numberOfLines={2}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.divider} />

            <View style={styles.customCategorySection}>
              <Text style={[styles.customLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                Vlastní kategorie
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDarkMode ? '#374151' : '#F9FAFB',
                    color: isDarkMode ? 'white' : '#1F2937',
                    borderColor: customCategory ? '#667eea' : (isDarkMode ? '#4B5563' : '#E5E7EB'),
                  }
                ]}
                value={customCategory}
                onChangeText={(text) => {
                  setCustomCategory(text);
                  if (text.trim()) {
                    setCategory('');
                  }
                }}
                placeholder="Zadejte vlastní kategorii"
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
              />
            </View>

            {transaction.category && (
              <Text style={[styles.hint, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                Původní: {transaction.category}
              </Text>
            )}
          </View>

          {transaction.counterpartyName && (
            <View style={[styles.infoCard, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
              <Text style={[styles.infoLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                Protistrana
              </Text>
              <Text style={[styles.infoValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                {transaction.counterpartyName}
              </Text>
            </View>
          )}

          {transaction.counterpartyAccount && (
            <View style={[styles.infoCard, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
              <Text style={[styles.infoLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                Číslo účtu protistrany
              </Text>
              <Text style={[styles.infoValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                {transaction.counterpartyAccount}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
          >
            <LinearGradient
              colors={['#667eea', '#764ba2']}
              style={styles.saveButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Save color="white" size={20} />
              <Text style={styles.saveButtonText}>Uložit změny</Text>
            </LinearGradient>
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
  content: {
    padding: 20,
  },
  headerCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  headerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerAmount: {
    fontSize: 40,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
    letterSpacing: -1,
  },
  headerDate: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  section: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: -0.3,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 2,
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  categoryCard: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  categoryIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  categoryName: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 16,
  },
  customCategorySection: {
    gap: 8,
  },
  customLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  saveButton: {
    marginTop: 24,
    marginBottom: 40,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  saveButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    gap: 10,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: -0.3,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
