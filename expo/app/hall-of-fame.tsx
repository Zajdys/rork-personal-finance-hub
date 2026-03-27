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
import { ArrowLeft, Trophy, Award, Medal, Crown } from 'lucide-react-native';
import { useBuddyStore } from '@/store/buddy-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { HallOfFameEntry } from '@/types/gaming';

export default function HallOfFameScreen() {
  const router = useRouter();
  const { gamingStats, getBuddyScore } = useBuddyStore();
  const { isDarkMode } = useSettingsStore();
  const { language } = useLanguageStore();

  const mockEntries: HallOfFameEntry[] = [
    {
      userId: '1',
      username: 'FinančníGuru',
      buddyScore: 15420,
      level: 42,
      badges: 28,
      epicBadges: 5,
      legacyBadges: 2,
      seasonId: 'season_2025_q1',
      rank: 1,
      avatarFrame: 'spring_gold_frame',
    },
    {
      userId: '2',
      username: 'InvestorPro',
      buddyScore: 14850,
      level: 39,
      badges: 25,
      epicBadges: 4,
      legacyBadges: 2,
      seasonId: 'season_2025_q1',
      rank: 2,
    },
    {
      userId: '3',
      username: 'BudgetMaster',
      buddyScore: 13920,
      level: 37,
      badges: 23,
      epicBadges: 4,
      legacyBadges: 1,
      seasonId: 'season_2025_q1',
      rank: 3,
    },
  ];

  const currentUserScore = getBuddyScore();
  const currentUserRank = mockEntries.length + 1;

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown color="#F59E0B" size={32} />;
      case 2:
        return <Medal color="#9CA3AF" size={28} />;
      case 3:
        return <Medal color="#CD7F32" size={28} />;
      default:
        return <Trophy color="#667eea" size={24} />;
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return ['#F59E0B', '#D97706'];
      case 2:
        return ['#9CA3AF', '#6B7280'];
      case 3:
        return ['#CD7F32', '#A0522D'];
      default:
        return ['#667eea', '#764ba2'];
    }
  };

  const LeaderboardEntry = ({ entry, isCurrentUser = false }: { entry: HallOfFameEntry; isCurrentUser?: boolean }) => (
    <View
      style={[
        styles.entryCard,
        { backgroundColor: isDarkMode ? '#374151' : 'white' },
        isCurrentUser && styles.currentUserCard,
      ]}
    >
      <View style={styles.rankContainer}>
        {getRankIcon(entry.rank)}
        <Text style={[styles.rankText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
          #{entry.rank}
        </Text>
      </View>

      <View style={styles.entryContent}>
        <Text style={[styles.username, { color: isDarkMode ? 'white' : '#1F2937' }]}>
          {entry.username}
          {isCurrentUser && ' (Ty)'}
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              {language === 'cs' ? 'Level' : 'Level'}
            </Text>
            <Text style={[styles.statValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {entry.level}
            </Text>
          </View>

          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              {language === 'cs' ? 'Odznaky' : 'Badges'}
            </Text>
            <Text style={[styles.statValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {entry.badges}
            </Text>
          </View>

          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              {language === 'cs' ? 'Epic' : 'Epic'}
            </Text>
            <Text style={[styles.statValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {entry.epicBadges}
            </Text>
          </View>

          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              {language === 'cs' ? 'Legacy' : 'Legacy'}
            </Text>
            <Text style={[styles.statValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {entry.legacyBadges}
            </Text>
          </View>
        </View>

        <View style={styles.scoreContainer}>
          <Text style={[styles.scoreLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
            Buddy Score
          </Text>
          <Text style={[styles.scoreValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {entry.buddyScore.toLocaleString('cs-CZ')}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: language === 'cs' ? 'Síň slávy' : 'Hall of Fame',
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
          colors={['#F59E0B', '#D97706']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Trophy color="white" size={64} />
          <Text style={styles.headerTitle}>
            {language === 'cs' ? 'Síň slávy' : 'Hall of Fame'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {language === 'cs' ? 'Top 1% hráčů sezóny' : 'Top 1% players of the season'}
          </Text>
        </LinearGradient>

        <View style={styles.currentUserSection}>
          <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {language === 'cs' ? 'Tvoje pozice' : 'Your position'}
          </Text>
          <LeaderboardEntry
            entry={{
              userId: 'current',
              username: 'MoneyBuddy User',
              buddyScore: currentUserScore,
              level: gamingStats.level,
              badges: gamingStats.badges.length,
              epicBadges: gamingStats.badges.filter(b => {
                const badge = gamingStats.badges.find(gb => gb.badgeId === b.badgeId);
                return badge;
              }).length,
              legacyBadges: 0,
              seasonId: 'season_2025_q1',
              rank: currentUserRank,
            }}
            isCurrentUser
          />
        </View>

        <View style={styles.leaderboardSection}>
          <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {language === 'cs' ? 'Žebříček' : 'Leaderboard'}
          </Text>
          {mockEntries.map((entry) => (
            <LeaderboardEntry key={entry.userId} entry={entry} />
          ))}
        </View>

        <View style={styles.infoSection}>
          <Award color="#667eea" size={32} />
          <Text style={[styles.infoTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {language === 'cs' ? 'Jak se dostat do Síně slávy?' : 'How to get into Hall of Fame?'}
          </Text>
          <Text style={[styles.infoText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
            {language === 'cs'
              ? 'Získej co nejvíce Buddy Score během sezóny. Top 1% hráčů získá exkluzivní rám avatara a zápis do Síně slávy!'
              : 'Earn as much Buddy Score as possible during the season. Top 1% players will get an exclusive avatar frame and Hall of Fame entry!'}
          </Text>
        </View>
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
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 16,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
    marginTop: 8,
    textAlign: 'center',
  },
  currentUserSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  leaderboardSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  entryCard: {
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
  currentUserCard: {
    borderWidth: 2,
    borderColor: '#667eea',
  },
  rankContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    minWidth: 60,
  },
  rankText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
  },
  entryContent: {
    flex: 1,
  },
  username: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  scoreContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  infoSection: {
    margin: 20,
    padding: 24,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    borderRadius: 16,
    alignItems: 'center',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
});
