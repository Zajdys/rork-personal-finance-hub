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
} from 'react-native';
import { Stack } from 'expo-router';
import { StackHeaderBackButton } from '@/components/BackButton';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Percent, Users, X, Save } from 'lucide-react-native';
import { useHousehold } from '@/store/household-store';
import { useLanguageStore } from '@/store/language-store';
import type { SplitRule } from '@/types/household';

const CATEGORIES = [
  { id: 'Bydlení', icon: '🏠', nameKey: 'housing' as const },
  { id: 'Jídlo', icon: '🍽️', nameKey: 'food' as const },
  { id: 'Doprava', icon: '🚗', nameKey: 'transport' as const },
  { id: 'Zábava', icon: '🎬', nameKey: 'entertainment' as const },
  { id: 'Energie', icon: '⚡', nameKey: 'hhCatUtilities' as const },
  { id: 'Nákupy', icon: '🛒', nameKey: 'shopping' as const },
  { id: 'Zdraví', icon: '💊', nameKey: 'hhCatHealth' as const },
  { id: 'Vzdělání', icon: '📚', nameKey: 'education' as const },
];

export default function HouseholdSplitsScreen() {
  const { currentHousehold, setDefaultSplit } = useHousehold();
  const { t } = useLanguageStore();
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [splitType, setSplitType] = useState<'EQUAL' | 'WEIGHTED'>('EQUAL');
  const [weights, setWeights] = useState<Record<string, string>>({});

  const members = currentHousehold?.members.filter(m => m.joinStatus === 'ACTIVE') || [];

  const getSplitForCategory = (categoryId: string): SplitRule | null => {
    return currentHousehold?.defaultSplits[categoryId] || null;
  };

  const handleOpenEdit = (categoryId: string) => {
    setSelectedCategory(categoryId);
    const split = getSplitForCategory(categoryId);
    
    if (split) {
      setSplitType(split.type === 'EQUAL' ? 'EQUAL' : 'WEIGHTED');
      if (split.weights) {
        const stringWeights: Record<string, string> = {};
        Object.entries(split.weights).forEach(([userId, weight]) => {
          stringWeights[userId] = String(Math.round(weight * 100));
        });
        setWeights(stringWeights);
      }
    } else {
      setSplitType('EQUAL');
      const defaultWeights: Record<string, string> = {};
      members.forEach(m => {
        defaultWeights[m.userId] = '50';
      });
      setWeights(defaultWeights);
    }
    
    setShowEditModal(true);
  };

  const getCategoryDisplayName = (categoryId: string): string => {
    const category = CATEGORIES.find(c => c.id === categoryId);
    return category ? t(category.nameKey) : categoryId;
  };

  const handleSaveSplit = async () => {
    if (splitType === 'WEIGHTED') {
      const total = Object.values(weights).reduce((sum, w) => sum + (parseFloat(w) || 0), 0);
      if (Math.abs(total - 100) > 0.1) {
        Alert.alert(t('error'), t('hhSplitPercentSum', { total: total.toFixed(0) }));
        return;
      }
    }

    try {
      const splitRule: SplitRule = {
        type: splitType,
        weights: splitType === 'WEIGHTED' ? 
          Object.fromEntries(
            Object.entries(weights).map(([userId, w]) => [userId, parseFloat(w) / 100])
          ) : undefined,
      };
      
      await setDefaultSplit(selectedCategory, splitRule);
      
      Alert.alert(
        t('hhSplitSaved'),
        t('hhSplitSavedDetail', {
          name: getCategoryDisplayName(selectedCategory),
          mode: splitType === 'EQUAL' ? t('hhSplitModeEqual') : t('hhSplitModeCustom'),
        })
      );
      
      setShowEditModal(false);
    } catch (error) {
      Alert.alert(t('error'), t('hhSplitSaveFailed'));
      console.error(error);
    }
  };

  const getSplitLabel = (split: SplitRule | null): string => {
    if (!split) return t('hhSplitNotSet');
    if (split.type === 'EQUAL') return t('hhSplitEqual5050');
    if (split.weights) {
      const percentages = Object.entries(split.weights)
        .map(([userId, weight]) => {
          const member = members.find(m => m.userId === userId);
          return `${member?.userName || '?'}: ${Math.round(weight * 100)}%`;
        })
        .join(', ');
      return percentages || t('hhSplitCustomRatios');
    }
    return t('hhSplitCustomRatios');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: t('screenExpenseSplits'),
          headerShown: true,
          headerLeft: ({ tintColor }) => (
            <StackHeaderBackButton tintColor={tintColor ?? 'white'} />
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>{t('hhSplitHowTitle')}</Text>
          <Text style={styles.infoText}>
            {t('hhSplitHowText', {
              equal: t('hhSplitEqual'),
              custom: t('hhSplitCustomRatios'),
            })}
          </Text>
        </View>

        <View style={styles.membersCard}>
          <View style={styles.membersHeader}>
            <Users size={20} color="#8B5CF6" strokeWidth={2} />
            <Text style={styles.membersTitle}>{t('hhSplitMembers')}</Text>
          </View>
          {members.map(member => (
            <View key={member.userId} style={styles.memberRow}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {member.userName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.memberName}>{member.userName}</Text>
              <Text style={styles.memberRole}>
                {member.role === 'OWNER' ? t('hhSplitOwner') : t('hhSplitPartner')}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('hhSplitRulesForCategories')}</Text>
          {CATEGORIES.map(category => {
            const split = getSplitForCategory(category.id);
            
            return (
              <TouchableOpacity
                key={category.id}
                style={styles.categoryCard}
                onPress={() => handleOpenEdit(category.id)}
              >
                <View style={styles.categoryLeft}>
                  <Text style={styles.categoryIcon}>{category.icon}</Text>
                  <View style={styles.categoryInfo}>
                    <Text style={styles.categoryName}>{getCategoryDisplayName(category.id)}</Text>
                    <Text style={styles.categorySplit}>{getSplitLabel(split)}</Text>
                  </View>
                </View>
                <Percent size={20} color="#9CA3AF" strokeWidth={2} />
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
                {getCategoryDisplayName(selectedCategory) || t('category')}
              </Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <X size={24} color="#6B7280" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.label}>{t('hhSplitMethod')}</Text>
              <View style={styles.segmentControl}>
                <TouchableOpacity
                  style={[
                    styles.segment,
                    splitType === 'EQUAL' && styles.segmentActive,
                  ]}
                  onPress={() => setSplitType('EQUAL')}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      splitType === 'EQUAL' && styles.segmentTextActive,
                    ]}
                  >
                    {t('hhSplitEqual')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segment,
                    splitType === 'WEIGHTED' && styles.segmentActive,
                  ]}
                  onPress={() => setSplitType('WEIGHTED')}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      splitType === 'WEIGHTED' && styles.segmentTextActive,
                    ]}
                  >
                    {t('hhSplitCustomRatios')}
                  </Text>
                </TouchableOpacity>
              </View>

              {splitType === 'EQUAL' && (
                <View style={styles.equalInfo}>
                  <Text style={styles.equalText}>
                    {t('hhSplitEqualInfo')}
                  </Text>
                  {members.length === 2 && (
                    <Text style={styles.equalExample}>{t('hhSplitEqualExample')}</Text>
                  )}
                </View>
              )}

              {splitType === 'WEIGHTED' && (
                <View style={styles.weightsSection}>
                  <Text style={styles.label}>{t('hhSplitMemberPercents')}</Text>
                  {members.map(member => (
                    <View key={member.userId} style={styles.weightRow}>
                      <View style={styles.weightLeft}>
                        <View style={styles.memberAvatar}>
                          <Text style={styles.memberAvatarText}>
                            {member.userName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.weightName}>{member.userName}</Text>
                      </View>
                      <View style={styles.weightInput}>
                        <TextInput
                          style={styles.input}
                          value={weights[member.userId] || '0'}
                          onChangeText={text => {
                            const numericText = text.replace(/[^0-9]/g, '');
                            setWeights({ ...weights, [member.userId]: numericText });
                          }}
                          keyboardType="numeric"
                          placeholder="0"
                        />
                        <Text style={styles.percentSymbol}>%</Text>
                      </View>
                    </View>
                  ))}
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>{t('hhSplitTotal')}</Text>
                    <Text style={[
                      styles.totalValue,
                      {
                        color: Math.abs(
                          Object.values(weights).reduce((sum, w) => sum + (parseFloat(w) || 0), 0) - 100
                        ) < 0.1 ? '#10B981' : '#EF4444'
                      }
                    ]}>
                      {Object.values(weights).reduce((sum, w) => sum + (parseFloat(w) || 0), 0).toFixed(0)}%
                    </Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveSplit}
              >
                <Save size={20} color="#FFF" strokeWidth={2} />
                <Text style={styles.saveButtonText}>{t('hhSplitSave')}</Text>
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
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1E40AF',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#3B82F6',
    lineHeight: 20,
  },
  bold: {
    fontWeight: '600' as const,
  },
  membersCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 24,
  },
  membersHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 16,
  },
  membersTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
  },
  memberRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    gap: 12,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#8B5CF6',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  memberAvatarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#1F2937',
    flex: 1,
  },
  memberRole: {
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
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  categoryLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    flex: 1,
  },
  categoryIcon: {
    fontSize: 22,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 2,
  },
  categorySplit: {
    fontSize: 13,
    color: '#6B7280',
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
    maxHeight: '85%',
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
  },
  label: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 12,
  },
  segmentControl: {
    flexDirection: 'row' as const,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center' as const,
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: '#FFF',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#6B7280',
  },
  segmentTextActive: {
    color: '#8B5CF6',
  },
  equalInfo: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
  },
  equalText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 8,
  },
  equalExample: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#8B5CF6',
    textAlign: 'center' as const,
  },
  weightsSection: {
    gap: 12,
  },
  weightRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 8,
  },
  weightLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    flex: 1,
  },
  weightName: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: '#1F2937',
  },
  weightInput: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1F2937',
    width: 80,
    textAlign: 'right' as const,
  },
  percentSymbol: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#6B7280',
  },
  totalRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingTop: 16,
    marginTop: 16,
    borderTopWidth: 2,
    borderTopColor: '#E5E7EB',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#1F2937',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '700' as const,
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
