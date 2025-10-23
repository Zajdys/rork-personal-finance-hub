import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Gift, Sparkles, Calendar, TrendingUp } from 'lucide-react-native';
import { useDailyRewards } from '@/store/daily-rewards-store';

const { width } = Dimensions.get('window');

export function DailyRewardModal() {
  const { showModal, canClaimToday, currentStreak, claimReward, closeModal } = useDailyRewards();
  const [claimed, setClaimed] = useState<boolean>(false);
  const [rewardData, setRewardData] = useState<{ kesaky: number; xp: number; streak: number; isNewStreak: boolean } | null>(null);
  const scaleAnim = useState(new Animated.Value(0))[0];

  React.useEffect(() => {
    if (showModal) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
    } else {
      scaleAnim.setValue(0);
    }
  }, [showModal, scaleAnim]);

  const handleClaim = async () => {
    const result = await claimReward();
    if (result) {
      setRewardData(result);
      setClaimed(true);
    }
  };

  const handleClose = () => {
    setClaimed(false);
    setRewardData(null);
    closeModal();
  };

  if (!showModal) return null;

  return (
    <Modal
      visible={showModal}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <BlurView intensity={80} style={styles.overlay}>
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {!claimed ? (
            <>
              <View style={styles.iconContainer}>
                <Gift size={64} color="#FFD700" strokeWidth={2} />
                <Sparkles size={32} color="#FFA500" style={styles.sparkle} />
              </View>

              <Text style={styles.title}>Denní odměna!</Text>
              
              {canClaimToday && (
                <>
                  <Text style={styles.subtitle}>
                    Vyzvedni si své kešáky a pokračuj ve své sérii
                  </Text>

                  <View style={styles.streakContainer}>
                    <Calendar size={20} color="#4ECDC4" />
                    <Text style={styles.streakText}>
                      {currentStreak > 0 ? `${currentStreak} dní v řadě` : 'Začni sérii!'}
                    </Text>
                  </View>

                  <View style={styles.rewardPreview}>
                    <View style={styles.rewardItem}>
                      <Text style={styles.rewardAmount}>
                        {currentStreak >= 30 ? '110' : currentStreak >= 21 ? '80' : currentStreak >= 14 ? '60' : currentStreak >= 7 ? '40' : currentStreak >= 3 ? '25' : '10'}
                      </Text>
                      <Text style={styles.rewardLabel}>Kešáky</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.rewardItem}>
                      <Text style={styles.rewardAmount}>
                        {currentStreak >= 30 ? '55' : currentStreak >= 21 ? '40' : currentStreak >= 14 ? '30' : currentStreak >= 7 ? '20' : currentStreak >= 3 ? '13' : '5'}
                      </Text>
                      <Text style={styles.rewardLabel}>XP</Text>
                    </View>
                  </View>

                  <TouchableOpacity style={styles.claimButton} onPress={handleClaim}>
                    <Text style={styles.claimButtonText}>Vyzvednout odměnu</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                <Text style={styles.closeButtonText}>Zavřít</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.iconContainer}>
                <TrendingUp size={64} color="#4CAF50" strokeWidth={2} />
              </View>

              <Text style={styles.title}>Odměna vyzvednuta!</Text>
              
              {rewardData && (
                <>
                  {rewardData.isNewStreak && (
                    <View style={styles.warningContainer}>
                      <Text style={styles.warningText}>
                        Tvoje série byla resetována! Začni znovu.
                      </Text>
                    </View>
                  )}

                  <View style={styles.rewardSummary}>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryAmount}>+{rewardData.kesaky}</Text>
                      <Text style={styles.summaryLabel}>Kešáky</Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryAmount}>+{rewardData.xp}</Text>
                      <Text style={styles.summaryLabel}>XP</Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryAmount}>{rewardData.streak}</Text>
                      <Text style={styles.summaryLabel}>Den v řadě</Text>
                    </View>
                  </View>

                  <Text style={styles.nextRewardText}>
                    Přijď zítra pro další odměnu!
                  </Text>
                </>
              )}

              <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneButtonText}>Pokračovat</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    width: width - 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  iconContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  sparkle: {
    position: 'absolute',
    top: -8,
    right: -8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 24,
  },
  streakText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4ECDC4',
  },
  rewardPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9E6',
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderRadius: 16,
    marginBottom: 24,
    gap: 24,
  },
  rewardItem: {
    alignItems: 'center',
  },
  rewardAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFA500',
    marginBottom: 4,
  },
  rewardLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: '#FFD700',
  },
  claimButton: {
    backgroundColor: '#4ECDC4',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    marginBottom: 12,
    width: '100%',
    shadowColor: '#4ECDC4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  claimButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  closeButton: {
    paddingVertical: 12,
  },
  closeButtonText: {
    fontSize: 16,
    color: '#999',
    fontWeight: '500',
  },
  warningContainer: {
    backgroundColor: '#FFF3CD',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FFE69C',
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
    fontWeight: '500',
  },
  rewardSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 24,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#4CAF50',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  nextRewardText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  doneButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '100%',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  doneButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
