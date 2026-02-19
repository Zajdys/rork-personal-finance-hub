import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Check,
  Info,
  Edit2,
  Plus,
} from 'lucide-react-native';
import { Stack, useRouter } from 'expo-router';
import { useLifeEvent } from '@/store/life-event-store';
import { LifeEventMode, LIFE_EVENT_MODES } from '@/types/life-event';
import { useFinanceStore } from '@/store/finance-store';

export default function LifeEventScreen() {
  const router = useRouter();
  const { state, setMode } = useLifeEvent();
  const { addFinancialGoal } = useFinanceStore();
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [selectedModeForInfo, setSelectedModeForInfo] = useState<LifeEventMode | null>(null);

  const handleModeSelect = async (mode: LifeEventMode) => {
    console.log('[LifeEvent] User selected mode:', mode);
    
    setSelectedModeForInfo(mode);
    setShowInfoModal(true);
  };

  const confirmModeChange = async () => {
    if (!selectedModeForInfo) return;
    
    console.log('[LifeEvent] Confirming mode change to:', selectedModeForInfo);
    await setMode(selectedModeForInfo);
    
    const modeInfo = LIFE_EVENT_MODES[selectedModeForInfo];
    
    if (selectedModeForInfo !== LifeEventMode.NONE && modeInfo.defaultGoals.length > 0) {
      console.log('[LifeEvent] Adding default goals for mode:', selectedModeForInfo);
      modeInfo.defaultGoals.forEach((goal) => {
        addFinancialGoal({
          id: `${selectedModeForInfo}-${Date.now()}-${Math.random()}`,
          title: goal.title,
          targetAmount: goal.targetAmount,
          currentAmount: 0,
          category: goal.category,
          deadline: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          type: goal.type,
        });
      });
    }
    
    setShowInfoModal(false);
    setSelectedModeForInfo(null);
    
    router.back();
  };

  const ModeCard = ({ mode }: { mode: LifeEventMode }) => {
    const modeInfo = LIFE_EVENT_MODES[mode];
    const isActive = state.activeMode === mode;

    return (
      <TouchableOpacity
        style={[
          styles.modeCard,
          isActive && styles.modeCardActive,
        ]}
        onPress={() => handleModeSelect(mode)}
        activeOpacity={0.7}
      >
        <View style={styles.modeCardContent}>
          <View style={styles.modeHeader}>
            <View style={[styles.modeIconContainer, { backgroundColor: modeInfo.color + '20' }]}>
              <Text style={styles.modeEmoji}>{modeInfo.emoji}</Text>
            </View>
            {isActive && (
              <View style={[styles.activeBadge, { backgroundColor: modeInfo.color }]}>
                <Check color="white" size={16} />
                <Text style={styles.activeBadgeText}>Aktivní</Text>
              </View>
            )}
          </View>
          
          <View style={styles.modeInfo}>
            <Text style={styles.modeTitle}>{modeInfo.title}</Text>
            <Text style={styles.modeDescription}>{modeInfo.description}</Text>
          </View>

          <View style={styles.modeBenefits}>
            {modeInfo.benefits.slice(0, 3).map((benefit, index) => (
              <View key={index} style={styles.benefitItem}>
                <View style={[styles.benefitDot, { backgroundColor: modeInfo.color }]} />
                <Text style={styles.benefitText} numberOfLines={1}>{benefit}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.selectButton, { borderColor: modeInfo.color }]}
            onPress={() => handleModeSelect(mode)}
          >
            <Text style={[styles.selectButtonText, { color: modeInfo.color }]}>
              {isActive ? 'Zůstat v režimu' : 'Vybrat režim'}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
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
            <Text style={styles.headerTitle}>Životní režim</Text>
            <Text style={styles.headerSubtitle}>Přizpůsob aplikaci své životní situaci</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.infoBox}>
          <Info color="#3B82F6" size={20} />
          <Text style={styles.infoText}>
            Vyber režim podle své aktuální životní situace. Aplikace pak upraví doporučení, metriky a notifikace.
          </Text>
        </View>

        <View style={styles.modesContainer}>
          <Text style={styles.sectionTitle}>Dostupné režimy</Text>
          
          <View style={styles.modesGrid}>
            {Object.values(LifeEventMode).map((mode) => (
              <ModeCard key={mode} mode={mode} />
            ))}
          </View>
        </View>

        <Modal
          visible={showInfoModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowInfoModal(false)}
        >
          {selectedModeForInfo && (
            <View style={styles.modalContainer}>
              <LinearGradient
                colors={[LIFE_EVENT_MODES[selectedModeForInfo].color, '#111827']}
                style={styles.modalHeader}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.modalHeaderContent}>
                  <TouchableOpacity
                    onPress={() => {
                      setShowInfoModal(false);
                      setSelectedModeForInfo(null);
                    }}
                    style={styles.closeButton}
                  >
                    <ArrowLeft color="white" size={24} />
                  </TouchableOpacity>
                  <View style={styles.modalHeaderTitle}>
                    <Text style={styles.modalEmoji}>{LIFE_EVENT_MODES[selectedModeForInfo].emoji}</Text>
                    <Text style={styles.modalTitle}>{LIFE_EVENT_MODES[selectedModeForInfo].title}</Text>
                  </View>
                  <View style={styles.modalHeaderSpacer} />
                </View>
              </LinearGradient>

              <ScrollView style={styles.modalContent}>
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Co se změní?</Text>
                  <Text style={styles.modalDescription}>
                    {LIFE_EVENT_MODES[selectedModeForInfo].description}
                  </Text>
                </View>

                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Výhody režimu</Text>
                  {LIFE_EVENT_MODES[selectedModeForInfo].benefits.map((benefit, index) => (
                    <View key={index} style={styles.modalBenefitItem}>
                      <View style={[styles.modalBenefitDot, { backgroundColor: LIFE_EVENT_MODES[selectedModeForInfo].color }]} />
                      <Text style={styles.modalBenefitText}>{benefit}</Text>
                    </View>
                  ))}
                </View>

                {LIFE_EVENT_MODES[selectedModeForInfo].defaultGoals.length > 0 && (
                  <View style={styles.modalSection}>
                    <View style={styles.modalSectionHeader}>
                      <Text style={styles.modalSectionTitle}>Doporučené cíle</Text>
                      <TouchableOpacity
                        style={styles.editGoalsButton}
                        onPress={() => {
                          setShowInfoModal(false);
                          router.push('/financial-goals' as any);
                        }}
                      >
                        <Edit2 color="#667eea" size={16} />
                        <Text style={styles.editGoalsButtonText}>Upravit</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.modalGoalsInfo}>
                      Tyto cíle ti pomůžou lépe spravovat finance v režimu {LIFE_EVENT_MODES[selectedModeForInfo].title}. Můžeš je upravit podle svých potřeb.
                    </Text>
                    {LIFE_EVENT_MODES[selectedModeForInfo].defaultGoals.map((goal, index) => (
                      <View key={index} style={styles.modalGoalItem}>
                        <View style={styles.modalGoalContent}>
                          <Text style={styles.modalGoalTitle}>{goal.title}</Text>
                          <Text style={styles.modalGoalType}>
                            {goal.type === 'saving' ? '💰 Spoření' : '📊 Limit'}
                          </Text>
                        </View>
                        <Text style={styles.modalGoalAmount}>
                          {goal.targetAmount.toLocaleString('cs-CZ')} Kč
                        </Text>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={styles.customizeGoalsButton}
                      onPress={() => {
                        setShowInfoModal(false);
                        router.push('/financial-goals' as any);
                      }}
                    >
                      <Plus color="#667eea" size={16} />
                      <Text style={styles.customizeGoalsButtonText}>
                        Přizpůsobit cíle pro tento režim
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Důležité</Text>
                  <View style={styles.modalWarning}>
                    <Text style={styles.modalWarningText}>
                      • Změna režimu nesmaže žádná existující data{'\n'}
                      • Režim lze kdykoli změnit nebo vypnout{'\n'}
                      • Ovlivňuje pouze doporučení a zobrazení
                    </Text>
                  </View>
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.confirmButton, { backgroundColor: LIFE_EVENT_MODES[selectedModeForInfo].color }]}
                  onPress={confirmModeChange}
                >
                  <Text style={styles.confirmButtonText}>
                    {state.activeMode === selectedModeForInfo ? 'Zůstat v režimu' : 'Aktivovat režim'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Modal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontWeight: 'bold' as const,
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#DBEAFE',
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 28,
    padding: 18,
    borderRadius: 16,
    gap: 14,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1E40AF',
    lineHeight: 20,
  },
  modesContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginBottom: 16,
  },
  modesGrid: {
    gap: 20,
  },
  modeCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modeCardActive: {
    borderColor: '#10B981',
    shadowOpacity: 0.15,
  },
  modeCardContent: {
    gap: 20,
  },
  modeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modeIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeEmoji: {
    fontSize: 32,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  activeBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600' as const,
  },
  modeInfo: {
    marginVertical: 4,
  },
  modeTitle: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginBottom: 4,
  },
  modeDescription: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
  },
  modeBenefits: {
    gap: 10,
    marginTop: 4,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  benefitDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  benefitText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    flex: 1,
  },
  selectButton: {
    marginTop: 4,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
  },
  selectButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
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
  modalHeaderTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  modalEmoji: {
    fontSize: 32,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: 'white',
  },
  modalHeaderSpacer: {
    width: 40,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalSection: {
    marginBottom: 24,
  },
  modalSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginBottom: 12,
  },
  modalDescription: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
  },
  modalBenefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  modalBenefitDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  modalBenefitText: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  modalGoalsInfo: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  modalSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  editGoalsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
  },
  editGoalsButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#667eea',
  },
  modalGoalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalGoalContent: {
    flex: 1,
    gap: 4,
  },
  modalGoalTitle: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: '#1F2937',
  },
  modalGoalType: {
    fontSize: 12,
    color: '#6B7280',
  },
  modalGoalAmount: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#10B981',
  },
  customizeGoalsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed' as const,
    marginTop: 8,
  },
  customizeGoalsButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#667eea',
  },
  modalWarning: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 12,
  },
  modalWarningText: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  confirmButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: 'white',
  },
});
