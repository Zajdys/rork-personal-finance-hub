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
import { Eye, EyeOff, Hash, Plus, X } from 'lucide-react-native';
import { useHousehold } from '@/store/household-store';
import { useLanguageStore } from '@/store/language-store';
import type { Visibility } from '@/types/household';
import { AsyncButton } from '@/components/AsyncButton';
import { useAsyncAction } from '@/hooks/use-async-action';

const CATEGORIES = [
  { id: 'housing', icon: '🏠', nameKey: 'housing' as const },
  { id: 'food', icon: '🍽️', nameKey: 'hhCatFood' as const },
  { id: 'transport', icon: '🚗', nameKey: 'transport' as const },
  { id: 'entertainment', icon: '🎬', nameKey: 'entertainment' as const },
  { id: 'utilities', icon: '⚡', nameKey: 'hhCatUtilities' as const },
  { id: 'shopping', icon: '🛒', nameKey: 'shopping' as const },
  { id: 'health', icon: '💊', nameKey: 'hhCatHealth' as const },
  { id: 'education', icon: '📚', nameKey: 'education' as const },
  { id: 'gifts', icon: '🎁', nameKey: 'hhCatGifts' as const },
  { id: 'hobbies', icon: '🎨', nameKey: 'hhCatHobbies' as const },
];

export default function HouseholdPoliciesScreen() {
  const { policies, createPolicy } = useHousehold();
  const { t } = useLanguageStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedVisibility, setSelectedVisibility] = useState<Visibility>('SHARED');
  const [customTag, setCustomTag] = useState('');
  const [scopeType, setScopeType] = useState<'CATEGORY' | 'TAG'>('CATEGORY');
  const [isEditingExisting, setIsEditingExisting] = useState(false);

  const visibilityOptions = [
    { value: 'SHARED' as Visibility, label: t('visibilityShared'), icon: Eye, color: '#10B981' },
    { value: 'SUMMARY_ONLY' as Visibility, label: t('visibilitySummaryOnly'), icon: Hash, color: '#F59E0B' },
    { value: 'PRIVATE' as Visibility, label: t('visibilityPrivate'), icon: EyeOff, color: '#6B7280' },
  ];

  const { run: handleAddPolicy } = useAsyncAction(async () => {
    if (scopeType === 'CATEGORY' && !selectedCategory) {
      Alert.alert(t('error'), t('hhPolicySelectCategory'));
      return;
    }
    if (scopeType === 'TAG' && !customTag.trim()) {
      Alert.alert(t('error'), t('hhPolicyEnterTag'));
      return;
    }

    try {
      await createPolicy(
        scopeType,
        scopeType === 'CATEGORY' ? selectedCategory : customTag,
        selectedVisibility,
        0
      );
      
      if (!isEditingExisting) {
        Alert.alert(
          t('hhPolicyAdded'),
          t('hhPolicyAddedDetail', {
            scope: scopeType === 'CATEGORY' ? t('hhPolicyScopeCategory') : t('hhPolicyScopeTag'),
            name: scopeType === 'CATEGORY' ? getCategoryLabel(selectedCategory) : customTag,
            visibility: getVisibilityLabel(selectedVisibility),
          })
        );
      }
      
      setShowAddModal(false);
      setSelectedCategory('');
      setCustomTag('');
      setSelectedVisibility('SHARED');
      setIsEditingExisting(false);
    } catch (error) {
      Alert.alert(t('error'), t('hhPolicyAddFailed'));
      console.error(error);
    }
  });

  const getPolicyVisibility = (categoryId: string): Visibility | null => {
    const policy = policies.find(p => p.scope.type === 'CATEGORY' && p.scope.id === categoryId);
    return policy?.visibility || null;
  };

  const getCategoryLabel = (categoryId: string): string => {
    const category = CATEGORIES.find(c => c.id === categoryId);
    return category ? `${category.icon} ${t(category.nameKey)}` : categoryId;
  };

  const getCategoryDisplayName = (categoryId: string): string => {
    const category = CATEGORIES.find(c => c.id === categoryId);
    return category ? t(category.nameKey) : categoryId;
  };

  const getVisibilityLabel = (visibility: Visibility): string => {
    switch (visibility) {
      case 'SHARED':
        return t('visibilityShared');
      case 'SUMMARY_ONLY':
        return t('visibilitySummaryOnly');
      case 'PRIVATE':
        return t('visibilityPrivate');
      default:
        return visibility;
    }
  };

  const getVisibilityBadgeLabel = (visibility: Visibility): string => {
    switch (visibility) {
      case 'SHARED':
        return t('visibilityShared');
      case 'SUMMARY_ONLY':
        return t('hhPolicySummaries');
      case 'PRIVATE':
        return t('visibilityPrivate');
      default:
        return visibility;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: t('screenSharingRules'),
          headerShown: true,
          headerLeft: ({ tintColor }) => (
            <StackHeaderBackButton tintColor={tintColor ?? 'white'} />
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>{t('hhPolicyHowTitle')}</Text>
          <Text style={styles.infoText}>
            {t('hhPolicyHowText', {
              shared: t('visibilityShared'),
              summary: t('visibilitySummaryOnly'),
              private: t('visibilityPrivate'),
            })}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('hhPolicyByCategory')}</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => {
                setScopeType('CATEGORY');
                setShowAddModal(true);
              }}
            >
              <Plus size={18} color="#8B5CF6" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {CATEGORIES.map(category => {
            const visibility = getPolicyVisibility(category.id);
            const isGift = category.id === 'gifts';
            
            const handleCategoryPress = () => {
              if (isGift) return;
              setSelectedCategory(category.id);
              setSelectedVisibility(visibility || 'SHARED');
              setIsEditingExisting(!!visibility);
              setScopeType('CATEGORY');
              setShowAddModal(true);
            };
            
            return (
              <TouchableOpacity
                key={category.id}
                style={styles.policyCard}
                onPress={handleCategoryPress}
                disabled={isGift}
                activeOpacity={isGift ? 1 : 0.7}
              >
                <View style={styles.policyLeft}>
                  <Text style={styles.categoryIcon}>{category.icon}</Text>
                  <Text style={styles.categoryName}>{getCategoryDisplayName(category.id)}</Text>
                </View>
                <View style={styles.policyRight}>
                  {isGift && (
                    <View style={[styles.badge, { backgroundColor: '#FEE2E2' }]}>
                      <EyeOff size={14} color="#DC2626" strokeWidth={2} />
                      <Text style={[styles.badgeText, { color: '#DC2626' }]}>{t('hhPolicyAutoPrivate')}</Text>
                    </View>
                  )}
                  {!isGift && visibility && (
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor:
                            visibility === 'SHARED'
                              ? '#D1FAE5'
                              : visibility === 'SUMMARY_ONLY'
                              ? '#FEF3C7'
                              : '#F3F4F6',
                        },
                      ]}
                    >
                      {visibility === 'SHARED' && <Eye size={14} color="#10B981" strokeWidth={2} />}
                      {visibility === 'SUMMARY_ONLY' && (
                        <Hash size={14} color="#F59E0B" strokeWidth={2} />
                      )}
                      {visibility === 'PRIVATE' && (
                        <EyeOff size={14} color="#6B7280" strokeWidth={2} />
                      )}
                      <Text
                        style={[
                          styles.badgeText,
                          {
                            color:
                              visibility === 'SHARED'
                                ? '#10B981'
                                : visibility === 'SUMMARY_ONLY'
                                ? '#F59E0B'
                                : '#6B7280',
                          },
                        ]}
                      >
                        {getVisibilityBadgeLabel(visibility)}
                      </Text>
                    </View>
                  )}
                  {!isGift && !visibility && (
                    <View style={styles.unsetButton}>
                      <Text style={styles.noPolicy}>{t('hhPolicyNotSet')}</Text>
                      <Text style={styles.tapHint}>→</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {policies.filter(p => p.scope.type === 'TAG').length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('hhPolicyByTags')}</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => {
                  setScopeType('TAG');
                  setShowAddModal(true);
                }}
              >
                <Plus size={18} color="#8B5CF6" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {policies
              .filter(p => p.scope.type === 'TAG')
              .map(policy => (
                <View key={policy.id} style={styles.policyCard}>
                  <View style={styles.policyLeft}>
                    <Hash size={20} color="#8B5CF6" strokeWidth={2} />
                    <Text style={styles.categoryName}>{policy.scope.id}</Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor:
                          policy.visibility === 'SHARED'
                            ? '#D1FAE5'
                            : policy.visibility === 'SUMMARY_ONLY'
                            ? '#FEF3C7'
                            : '#F3F4F6',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        {
                          color:
                            policy.visibility === 'SHARED'
                              ? '#10B981'
                              : policy.visibility === 'SUMMARY_ONLY'
                              ? '#F59E0B'
                              : '#6B7280',
                        },
                      ]}
                    >
                      {getVisibilityBadgeLabel(policy.visibility)}
                    </Text>
                  </View>
                </View>
              ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('hhPolicyAddRule')}</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <X size={24} color="#6B7280" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.label}>{t('hhPolicyRuleType')}</Text>
              <View style={styles.segmentControl}>
                <TouchableOpacity
                  style={[
                    styles.segment,
                    scopeType === 'CATEGORY' && styles.segmentActive,
                  ]}
                  onPress={() => setScopeType('CATEGORY')}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      scopeType === 'CATEGORY' && styles.segmentTextActive,
                    ]}
                  >
                    {t('hhPolicyCategory')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segment,
                    scopeType === 'TAG' && styles.segmentActive,
                  ]}
                  onPress={() => setScopeType('TAG')}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      scopeType === 'TAG' && styles.segmentTextActive,
                    ]}
                  >
                    {t('hhPolicyTag')}
                  </Text>
                </TouchableOpacity>
              </View>

              {scopeType === 'CATEGORY' ? (
                <>
                  <Text style={styles.label}>{t('hhPolicyCategory')}</Text>
                  <ScrollView style={styles.categoryList}>
                    {CATEGORIES.map(category => (
                      <TouchableOpacity
                        key={category.id}
                        style={[
                          styles.categoryOption,
                          selectedCategory === category.id && styles.categoryOptionActive,
                        ]}
                        onPress={() => setSelectedCategory(category.id)}
                      >
                        <Text style={styles.categoryIcon}>{category.icon}</Text>
                        <Text style={styles.categoryOptionText}>{getCategoryDisplayName(category.id)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              ) : (
                <>
                  <Text style={styles.label}>{t('hhPolicyTagName')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('hhPolicyTagPlaceholder')}
                    value={customTag}
                    onChangeText={setCustomTag}
                    autoCapitalize="none"
                  />
                </>
              )}

              <Text style={styles.label}>{t('hhPolicyVisibility')}</Text>
              <View style={styles.visibilityOptions}>
                {visibilityOptions.map(option => {
                  const Icon = option.icon;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.visibilityOption,
                        selectedVisibility === option.value && styles.visibilityOptionActive,
                        {
                          borderColor:
                            selectedVisibility === option.value ? option.color : '#E5E7EB',
                          backgroundColor:
                            selectedVisibility === option.value
                              ? option.color + '15'
                              : '#FFF',
                        },
                      ]}
                      onPress={() => setSelectedVisibility(option.value)}
                    >
                      <Icon size={20} color={option.color} strokeWidth={2} />
                      <Text style={styles.visibilityLabel}>{option.label}</Text>
                      {selectedVisibility === option.value && (
                        <View style={styles.checkmark}>
                          <Text style={{ color: option.color, fontSize: 18, fontWeight: '700' }}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.modalFooter}>
              <AsyncButton
                variant="primary"
                label={t('hhPolicySaveRule')}
                loadingLabel={t('hhNotifSaving')}
                onPress={handleAddPolicy}
                style={styles.saveButton}
                contentStyle={{ paddingVertical: 14 }}
                textStyle={styles.saveButtonText}
              />
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  policyCard: {
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
  policyLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    flex: 1,
  },
  categoryIcon: {
    fontSize: 24,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
  },
  policyRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  badge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  unsetButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  noPolicy: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic' as const,
  },
  tapHint: {
    fontSize: 16,
    color: '#8B5CF6',
    fontWeight: '600' as const,
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
    marginTop: 16,
  },
  segmentControl: {
    flexDirection: 'row' as const,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
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
  categoryList: {
    maxHeight: 250,
  },
  categoryOption: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    marginBottom: 8,
    gap: 12,
  },
  categoryOptionActive: {
    borderColor: '#8B5CF6',
    backgroundColor: '#F3F4F6',
  },
  categoryOptionText: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '500' as const,
  },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1F2937',
  },
  visibilityOptions: {
    gap: 12,
  },
  visibilityOption: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  visibilityOptionActive: {
  },
  checkmark: {
    marginLeft: 'auto' as const,
  },
  visibilityLabel: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: '#1F2937',
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
