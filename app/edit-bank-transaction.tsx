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
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Save, Tag, FileText, Eye, EyeOff, Users } from 'lucide-react-native';
import { useBankStore } from '@/store/bank-store';
import { useSettingsStore } from '@/store/settings-store';
import { useFinanceStore } from '@/store/finance-store';
import { useHousehold } from '@/store/household-store';
import type { Visibility } from '@/types/household';

export default function EditBankTransactionScreen() {
  const { transactionId } = useLocalSearchParams();
  const router = useRouter();
  const { isDarkMode } = useSettingsStore();
  const { transactions, updateTransaction } = useBankStore();
  const { getAllCategories } = useFinanceStore();
  const { isInHousehold } = useHousehold();

  const transaction = transactions.find(t => t.id === transactionId);

  const [description, setDescription] = useState(transaction?.description || '');
  const [category, setCategory] = useState(transaction?.category || '');
  const [customCategory, setCustomCategory] = useState('');
  const [visibility, setVisibility] = useState<Visibility>(
    transaction?.householdVisibility || 'PRIVATE'
  );

  if (!transaction) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
        <Stack.Screen
          options={{
            title: 'Transakce nenalezena',
            headerShown: true,
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
      </SafeAreaView>
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
      householdVisibility: visibility,
    });

    Alert.alert('Úspěch', 'Transakce byla aktualizována', [
      { text: 'OK', onPress: () => router.back() }
    ]);
  };

  const getVisibilityLabel = (vis: Visibility): string => {
    switch (vis) {
      case 'PRIVATE':
        return 'Soukromé';
      case 'SHARED':
        return 'Sdílené';
      case 'SUMMARY_ONLY':
        return 'Jen součet';
      default:
        return 'Soukromé';
    }
  };

  const getVisibilityIcon = (vis: Visibility) => {
    switch (vis) {
      case 'PRIVATE':
        return <EyeOff size={20} color="#EF4444" strokeWidth={2} />;
      case 'SHARED':
        return <Eye size={20} color="#10B981" strokeWidth={2} />;
      case 'SUMMARY_ONLY':
        return <Users size={20} color="#F59E0B" strokeWidth={2} />;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen
        options={{
          title: 'Upravit transakci',
          headerShown: true,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ marginLeft: 0 }}
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

            <View style={[styles.divider, { backgroundColor: isDarkMode ? '#4B5563' : '#E5E7EB' }]} />

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

          {isInHousehold && (
            <View style={[styles.section, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
              <View style={styles.sectionHeader}>
                <Users color={isDarkMode ? '#D1D5DB' : '#6B7280'} size={20} />
                <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  Viditelnost v domácnosti
                </Text>
              </View>

              <Text style={[styles.visibilityDescription, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                Nastavte, jak bude tato transakce viditelná pro ostatní členy domácnosti.
              </Text>

              <View style={styles.visibilityOptions}>
                <TouchableOpacity
                  style={[
                    styles.visibilityCard,
                    {
                      backgroundColor: visibility === 'PRIVATE'
                        ? (isDarkMode ? '#7C2D12' : '#FEE2E2')
                        : (isDarkMode ? '#374151' : '#F9FAFB'),
                      borderColor: visibility === 'PRIVATE' ? '#EF4444' : (isDarkMode ? '#4B5563' : '#E5E7EB'),
                    }
                  ]}
                  onPress={() => setVisibility('PRIVATE')}
                >
                  <View style={styles.visibilityHeader}>
                    <EyeOff
                      size={24}
                      color={visibility === 'PRIVATE' ? '#EF4444' : (isDarkMode ? '#9CA3AF' : '#6B7280')}
                      strokeWidth={2}
                    />
                    <Text
                      style={[
                        styles.visibilityTitle,
                        {
                          color: visibility === 'PRIVATE'
                            ? '#EF4444'
                            : (isDarkMode ? '#D1D5DB' : '#1F2937')
                        }
                      ]}
                    >
                      Soukromé
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.visibilityText,
                      {
                        color: visibility === 'PRIVATE'
                          ? (isDarkMode ? '#FCA5A5' : '#DC2626')
                          : (isDarkMode ? '#9CA3AF' : '#6B7280')
                      }
                    ]}
                  >
                    Pouze vy vidíte tuto transakci
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.visibilityCard,
                    {
                      backgroundColor: visibility === 'SHARED'
                        ? (isDarkMode ? '#14532D' : '#D1FAE5')
                        : (isDarkMode ? '#374151' : '#F9FAFB'),
                      borderColor: visibility === 'SHARED' ? '#10B981' : (isDarkMode ? '#4B5563' : '#E5E7EB'),
                    }
                  ]}
                  onPress={() => setVisibility('SHARED')}
                >
                  <View style={styles.visibilityHeader}>
                    <Eye
                      size={24}
                      color={visibility === 'SHARED' ? '#10B981' : (isDarkMode ? '#9CA3AF' : '#6B7280')}
                      strokeWidth={2}
                    />
                    <Text
                      style={[
                        styles.visibilityTitle,
                        {
                          color: visibility === 'SHARED'
                            ? '#10B981'
                            : (isDarkMode ? '#D1D5DB' : '#1F2937')
                        }
                      ]}
                    >
                      Sdílené
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.visibilityText,
                      {
                        color: visibility === 'SHARED'
                          ? (isDarkMode ? '#6EE7B7' : '#059669')
                          : (isDarkMode ? '#9CA3AF' : '#6B7280')
                      }
                    ]}
                  >
                    Všichni členové vidí všechny detaily
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.visibilityCard,
                    {
                      backgroundColor: visibility === 'SUMMARY_ONLY'
                        ? (isDarkMode ? '#78350F' : '#FEF3C7')
                        : (isDarkMode ? '#374151' : '#F9FAFB'),
                      borderColor: visibility === 'SUMMARY_ONLY' ? '#F59E0B' : (isDarkMode ? '#4B5563' : '#E5E7EB'),
                    }
                  ]}
                  onPress={() => setVisibility('SUMMARY_ONLY')}
                >
                  <View style={styles.visibilityHeader}>
                    <Users
                      size={24}
                      color={visibility === 'SUMMARY_ONLY' ? '#F59E0B' : (isDarkMode ? '#9CA3AF' : '#6B7280')}
                      strokeWidth={2}
                    />
                    <Text
                      style={[
                        styles.visibilityTitle,
                        {
                          color: visibility === 'SUMMARY_ONLY'
                            ? '#F59E0B'
                            : (isDarkMode ? '#D1D5DB' : '#1F2937')
                        }
                      ]}
                    >
                      Jen součet
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.visibilityText,
                      {
                        color: visibility === 'SUMMARY_ONLY'
                          ? (isDarkMode ? '#FCD34D' : '#D97706')
                          : (isDarkMode ? '#9CA3AF' : '#6B7280')
                      }
                    ]}
                  >
                    Členové vidí jen částku a kategorii
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

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
    </SafeAreaView>
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
    alignItems: 'center' as const,
    marginBottom: 24,
  },
  headerLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  headerAmount: {
    fontSize: 40,
    fontWeight: 'bold' as const,
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
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
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
    fontStyle: 'italic' as const,
  },
  categoriesGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 16,
  },
  categoryCard: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
  },
  categoryIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  categoryName: {
    fontSize: 11,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  customCategorySection: {
    gap: 8,
  },
  customLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  visibilityDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  visibilityOptions: {
    gap: 12,
  },
  visibilityCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
  },
  visibilityHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 8,
  },
  visibilityTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  visibilityText: {
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 36,
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
    fontWeight: '600' as const,
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500' as const,
  },
  saveButton: {
    marginTop: 24,
    marginBottom: 40,
    borderRadius: 16,
    overflow: 'hidden' as const,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  saveButtonGradient: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 18,
    gap: 10,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold' as const,
    letterSpacing: -0.3,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600' as const,
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
    fontWeight: '600' as const,
  },
});
