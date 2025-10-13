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
import { ArrowLeft, Target, CheckCircle, Clock, Trophy } from 'lucide-react-native';
import { useBuddyStore } from '@/store/buddy-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { Quest } from '@/types/gaming';

export default function QuestsScreen() {
  const router = useRouter();
  const { gamingStats, completeQuest } = useBuddyStore();
  const { isDarkMode } = useSettingsStore();
  const { language } = useLanguageStore();

  const dailyQuests = gamingStats.quests.filter(q => q.type === 'daily');
  const weeklyQuests = gamingStats.quests.filter(q => q.type === 'weekly');
  const monthlyQuests = gamingStats.quests.filter(q => q.type === 'monthly');
  const seasonalQuests = gamingStats.quests.filter(q => q.type === 'seasonal');

  const completedCount = gamingStats.quests.filter(q => q.completed).length;
  const totalCount = gamingStats.quests.length;

  const QuestCard = ({ quest }: { quest: Quest }) => {
    const progress = quest.maxProgress > 0 ? (quest.progress / quest.maxProgress) * 100 : 0;

    return (
      <TouchableOpacity
        style={[
          styles.questCard,
          { backgroundColor: isDarkMode ? '#374151' : 'white' },
          quest.completed && styles.questCardCompleted,
        ]}
        disabled={quest.completed}
      >
        <View style={[styles.questIcon, { backgroundColor: quest.color + '20' }]}>
          <Text style={styles.questEmoji}>{quest.icon}</Text>
        </View>

        <View style={styles.questContent}>
          <View style={styles.questHeader}>
            <Text
              style={[
                styles.questTitle,
                { color: isDarkMode ? 'white' : '#1F2937' },
                quest.completed && styles.questTitleCompleted,
              ]}
            >
              {quest.title}
            </Text>
            {quest.completed && <CheckCircle color="#10B981" size={20} />}
          </View>

          <Text style={[styles.questDescription, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
            {quest.description}
          </Text>

          {!quest.completed && (
            <>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: quest.color }]} />
              </View>
              <Text style={[styles.progressText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                {quest.progress} / {quest.maxProgress}
              </Text>
            </>
          )}

          <View style={styles.questRewards}>
            <View style={styles.rewardItem}>
              <Text style={styles.rewardText}>+{quest.rewardXp} XP</Text>
            </View>
            <View style={styles.rewardItem}>
              <Text style={styles.rewardText}>+{quest.rewardCoins} BC</Text>
            </View>
            {quest.expiresAt && (
              <View style={styles.expiryItem}>
                <Clock color="#EF4444" size={14} />
                <Text style={styles.expiryText}>
                  {new Date(quest.expiresAt).toLocaleDateString('cs-CZ')}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const QuestSection = ({ title, quests }: { title: string; quests: Quest[] }) => {
    if (quests.length === 0) return null;

    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
          {title}
        </Text>
        {quests.map((quest) => (
          <QuestCard key={quest.id} quest={quest} />
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: language === 'cs' ? 'Questy' : 'Quests',
          headerStyle: {
            backgroundColor: isDarkMode ? '#1F2937' : 'white',
          },
          headerTintColor: isDarkMode ? 'white' : '#1F2937',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <ArrowLeft color={isDarkMode ? 'white' : '#1F2937'} size={24} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Target color="white" size={48} />
          <Text style={styles.headerTitle}>
            {completedCount} / {totalCount}
          </Text>
          <Text style={styles.headerSubtitle}>
            {language === 'cs' ? 'Splněných questů' : 'Completed quests'}
          </Text>
        </LinearGradient>

        {totalCount === 0 ? (
          <View style={styles.emptyState}>
            <Trophy color="#9CA3AF" size={64} />
            <Text style={[styles.emptyStateTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {language === 'cs' ? 'Žádné questy' : 'No quests'}
            </Text>
            <Text style={[styles.emptyStateText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              {language === 'cs'
                ? 'Questy se objeví automaticky na základě tvé aktivity'
                : 'Quests will appear automatically based on your activity'}
            </Text>
          </View>
        ) : (
          <>
            <QuestSection
              title={language === 'cs' ? 'Denní questy' : 'Daily Quests'}
              quests={dailyQuests}
            />
            <QuestSection
              title={language === 'cs' ? 'Týdenní questy' : 'Weekly Quests'}
              quests={weeklyQuests}
            />
            <QuestSection
              title={language === 'cs' ? 'Měsíční questy' : 'Monthly Quests'}
              quests={monthlyQuests}
            />
            <QuestSection
              title={language === 'cs' ? 'Sezónní questy' : 'Seasonal Quests'}
              quests={seasonalQuests}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    padding: 8,
    marginLeft: 8,
  },
  header: {
    padding: 32,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 48,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 16,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
    marginTop: 8,
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  questCard: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  questCardCompleted: {
    opacity: 0.7,
  },
  questIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  questEmoji: {
    fontSize: 28,
  },
  questContent: {
    flex: 1,
  },
  questHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  questTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  questTitleCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.7,
  },
  questDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    marginBottom: 8,
  },
  questRewards: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rewardItem: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#667eea',
    borderRadius: 12,
  },
  rewardText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  expiryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expiryText: {
    fontSize: 12,
    color: '#EF4444',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
});
