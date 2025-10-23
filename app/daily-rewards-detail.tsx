import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Gift, Calendar, ChevronLeft, Sparkles } from 'lucide-react-native';
import { useDailyRewards } from '@/store/daily-rewards-store';

const rewardsData = [
  { day: 1, kesaky: 10, xp: 5, label: 'Den 1' },
  { day: 2, kesaky: 10, xp: 5, label: 'Den 2' },
  { day: 3, kesaky: 25, xp: 13, label: 'Den 3', milestone: '3 dny v řadě' },
  { day: 4, kesaky: 25, xp: 13, label: 'Den 4' },
  { day: 5, kesaky: 25, xp: 13, label: 'Den 5' },
  { day: 6, kesaky: 25, xp: 13, label: 'Den 6' },
  { day: 7, kesaky: 40, xp: 20, label: 'Den 7', milestone: '1 týden' },
  { day: 8, kesaky: 40, xp: 20, label: 'Den 8' },
  { day: 9, kesaky: 40, xp: 20, label: 'Den 9' },
  { day: 10, kesaky: 40, xp: 20, label: 'Den 10' },
  { day: 11, kesaky: 40, xp: 20, label: 'Den 11' },
  { day: 12, kesaky: 40, xp: 20, label: 'Den 12' },
  { day: 13, kesaky: 40, xp: 20, label: 'Den 13' },
  { day: 14, kesaky: 60, xp: 30, label: 'Den 14', milestone: '2 týdny' },
  { day: 15, kesaky: 60, xp: 30, label: 'Den 15' },
  { day: 16, kesaky: 60, xp: 30, label: 'Den 16' },
  { day: 17, kesaky: 60, xp: 30, label: 'Den 17' },
  { day: 18, kesaky: 60, xp: 30, label: 'Den 18' },
  { day: 19, kesaky: 60, xp: 30, label: 'Den 19' },
  { day: 20, kesaky: 60, xp: 30, label: 'Den 20' },
  { day: 21, kesaky: 80, xp: 40, label: 'Den 21', milestone: '3 týdny' },
  { day: 22, kesaky: 80, xp: 40, label: 'Den 22' },
  { day: 23, kesaky: 80, xp: 40, label: 'Den 23' },
  { day: 24, kesaky: 80, xp: 40, label: 'Den 24' },
  { day: 25, kesaky: 80, xp: 40, label: 'Den 25' },
  { day: 26, kesaky: 80, xp: 40, label: 'Den 26' },
  { day: 27, kesaky: 80, xp: 40, label: 'Den 27' },
  { day: 28, kesaky: 80, xp: 40, label: 'Den 28' },
  { day: 29, kesaky: 80, xp: 40, label: 'Den 29' },
  { day: 30, kesaky: 110, xp: 55, label: 'Den 30+', milestone: '1 měsíc!' },
];

export default function DailyRewardsDetailScreen() {
  const router = useRouter();
  const { currentStreak, totalKesaky, totalXp } = useDailyRewards();

  const RewardRow = ({ reward, isUnlocked }: { reward: typeof rewardsData[0], isUnlocked: boolean }) => (
    <View style={[
      styles.rewardRow,
      isUnlocked && styles.rewardRowUnlocked,
      reward.milestone && styles.rewardRowMilestone,
    ]}>
      <View style={styles.rewardLeft}>
        <View style={[
          styles.dayBadge,
          isUnlocked && styles.dayBadgeUnlocked,
          reward.milestone && styles.dayBadgeMilestone,
        ]}>
          <Text style={[
            styles.dayText,
            isUnlocked && styles.dayTextUnlocked,
            reward.milestone && styles.dayTextMilestone,
          ]}>
            {reward.day}
          </Text>
        </View>
        <View style={styles.rewardInfo}>
          <Text style={[
            styles.rewardLabel,
            isUnlocked && styles.rewardLabelUnlocked,
          ]}>
            {reward.label}
          </Text>
          {reward.milestone && (
            <Text style={[
              styles.milestoneText,
              isUnlocked && styles.milestoneTextUnlocked,
            ]}>
              {reward.milestone}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.rewardRight}>
        <View style={styles.rewardAmount}>
          <Text style={[
            styles.rewardValue,
            isUnlocked && styles.rewardValueUnlocked,
          ]}>
            {reward.kesaky}
          </Text>
          <Text style={[
            styles.rewardType,
            isUnlocked && styles.rewardTypeUnlocked,
          ]}>
            Kešáky
          </Text>
        </View>
        <View style={styles.rewardAmount}>
          <Text style={[
            styles.rewardValue,
            isUnlocked && styles.rewardValueUnlocked,
          ]}>
            {reward.xp}
          </Text>
          <Text style={[
            styles.rewardType,
            isUnlocked && styles.rewardTypeUnlocked,
          ]}>
            XP
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Denní odměny',
          headerStyle: {
            backgroundColor: '#FFD700',
          },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: {
            fontWeight: '700' as const,
          },
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <ChevronLeft size={24} color="#FFFFFF" />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#FFD700', '#FFA500']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Gift size={64} color="#FFFFFF" />
          <Text style={styles.headerTitle}>Systém denních odměn</Text>
          <Text style={styles.headerSubtitle}>
            Přihlas se každý den a získej kešáky a XP!
          </Text>

          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{currentStreak}</Text>
              <Text style={styles.statLabel}>Dnů v řadě</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalKesaky}</Text>
              <Text style={styles.statLabel}>Celkem kešáků</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalXp}</Text>
              <Text style={styles.statLabel}>Celkem XP</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.infoCard}>
            <View style={styles.infoIconContainer}>
              <Sparkles size={24} color="#FFA500" />
            </View>
            <View style={styles.infoText}>
              <Text style={styles.infoTitle}>Jak to funguje?</Text>
              <Text style={styles.infoDescription}>
                Přihlas se do aplikace každý den a vyzvedni si odměnu. Čím delší je tvoje série, tím více získáš! Pokud vynecháš den, série se restartuje.
              </Text>
            </View>
          </View>

          <View style={styles.milestonesContainer}>
            <View style={styles.milestoneItem}>
              <View style={styles.milestoneIcon}>
                <Calendar size={18} color="#4ECDC4" />
              </View>
              <Text style={styles.milestoneLabel}>Den 3: Bonus +15 kešáků</Text>
            </View>
            <View style={styles.milestoneItem}>
              <View style={styles.milestoneIcon}>
                <Calendar size={18} color="#4ECDC4" />
              </View>
              <Text style={styles.milestoneLabel}>Den 7: Bonus +30 kešáků</Text>
            </View>
            <View style={styles.milestoneItem}>
              <View style={styles.milestoneIcon}>
                <Calendar size={18} color="#4ECDC4" />
              </View>
              <Text style={styles.milestoneLabel}>Den 14: Bonus +50 kešáků</Text>
            </View>
            <View style={styles.milestoneItem}>
              <View style={styles.milestoneIcon}>
                <Calendar size={18} color="#4ECDC4" />
              </View>
              <Text style={styles.milestoneLabel}>Den 21: Bonus +70 kešáků</Text>
            </View>
            <View style={styles.milestoneItem}>
              <View style={styles.milestoneIcon}>
                <Calendar size={18} color="#4ECDC4" />
              </View>
              <Text style={styles.milestoneLabel}>Den 30+: Bonus +100 kešáků</Text>
            </View>
          </View>

          <View style={styles.rewardsSection}>
            <Text style={styles.sectionTitle}>Přehled odměn</Text>
            <View style={styles.rewardsList}>
              {rewardsData.map((reward) => (
                <RewardRow
                  key={reward.day}
                  reward={reward}
                  isUnlocked={currentStreak >= reward.day}
                />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  backButton: {
    marginLeft: 16,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingTop: 40,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    textAlign: 'center',
    marginBottom: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.9,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#FFFFFF',
    opacity: 0.3,
  },
  content: {
    padding: 20,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  infoIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF9E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#1A1A1A',
    marginBottom: 8,
  },
  infoDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  milestonesContainer: {
    backgroundColor: '#F0F9FF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  milestoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  milestoneIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  milestoneLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#4ECDC4',
  },
  rewardsSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#1A1A1A',
    marginBottom: 16,
  },
  rewardsList: {
    gap: 8,
  },
  rewardRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  rewardRowUnlocked: {
    borderColor: '#4ECDC4',
    backgroundColor: '#F0F9FF',
  },
  rewardRowMilestone: {
    borderWidth: 2,
  },
  rewardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dayBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  dayBadgeUnlocked: {
    backgroundColor: '#4ECDC4',
  },
  dayBadgeMilestone: {
    backgroundColor: '#FFD700',
  },
  dayText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#9CA3AF',
  },
  dayTextUnlocked: {
    color: '#FFFFFF',
  },
  dayTextMilestone: {
    color: '#FFFFFF',
  },
  rewardInfo: {
    flex: 1,
  },
  rewardLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#6B7280',
    marginBottom: 2,
  },
  rewardLabelUnlocked: {
    color: '#1A1A1A',
  },
  milestoneText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#9CA3AF',
  },
  milestoneTextUnlocked: {
    color: '#FFA500',
  },
  rewardRight: {
    flexDirection: 'row',
    gap: 16,
  },
  rewardAmount: {
    alignItems: 'center',
  },
  rewardValue: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  rewardValueUnlocked: {
    color: '#4ECDC4',
  },
  rewardType: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: '#9CA3AF',
  },
  rewardTypeUnlocked: {
    color: '#4ECDC4',
  },
});
