import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Trophy,
  Medal,
  Award,
  Users,
  TrendingUp,
  Star,
  Crown,
} from 'lucide-react-native';
import { useBuddyStore } from '@/store/buddy-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { Stack } from 'expo-router';
import { BackButton } from '@/components/BackButton';

interface LeaderboardUser {
  id: string;
  name: string;
  level: number;
  points: number;
  avatar: string;
  rank: number;
  weeklyGrowth: number;
  achievements: string[];
  isCurrentUser?: boolean;
}

const mockLeaderboardData: LeaderboardUser[] = [
  {
    id: '1',
    name: 'Petr Novák',
    level: 8,
    points: 1250,
    avatar: '👨‍💼',
    rank: 1,
    weeklyGrowth: 15,
    achievements: ['💰', '📈', '🎯', '⭐'],
  },
  {
    id: '2', 
    name: 'Anna Svobodová',
    level: 7,
    points: 1180,
    avatar: '👩‍💻',
    rank: 2,
    weeklyGrowth: 12,
    achievements: ['💰', '📈', '🎯'],
  },
  {
    id: '3',
    name: 'User',
    level: 1,
    points: 45,
    avatar: '🧑‍💼',
    rank: 8,
    weeklyGrowth: 8,
    achievements: ['💰'],
    isCurrentUser: true,
  },
  {
    id: '4',
    name: 'Martin Dvořák',
    level: 6,
    points: 980,
    avatar: '👨‍🎓',
    rank: 3,
    weeklyGrowth: 10,
    achievements: ['💰', '📈'],
  },
  {
    id: '5',
    name: 'Tereza Nová',
    level: 5,
    points: 850,
    avatar: '👩‍🎨',
    rank: 4,
    weeklyGrowth: 7,
    achievements: ['💰', '📈'],
  },
  {
    id: '6',
    name: 'Jakub Černý',
    level: 4,
    points: 720,
    avatar: '👨‍🔬',
    rank: 5,
    weeklyGrowth: 5,
    achievements: ['💰'],
  },
  {
    id: '7',
    name: 'Klára Veselá',
    level: 3,
    points: 580,
    avatar: '👩‍⚕️',
    rank: 6,
    weeklyGrowth: 3,
    achievements: ['💰'],
  },
  {
    id: '8',
    name: 'Tomáš Procházka',
    level: 2,
    points: 420,
    avatar: '👨‍🍳',
    rank: 7,
    weeklyGrowth: 2,
    achievements: ['💰'],
  },
];


export default function LeaderboardScreen() {
  const { level, points } = useBuddyStore();
  const { isDarkMode } = useSettingsStore();
  const { t } = useLanguageStore();
  const [selectedTab, setSelectedTab] = useState<'weekly' | 'monthly' | 'allTime'>('weekly');

  const achievements: Record<string, { name: string; description: string }> = {
    '💰': { name: t('leaderboardBadgeFirstSteps'), description: t('leaderboardBadgeFirstStepsDesc') },
    '📈': { name: t('leaderboardBadgeInvestor'), description: t('leaderboardBadgeInvestorDesc') },
    '🎯': { name: t('leaderboardBadgeTargeted'), description: t('leaderboardBadgeTargetedDesc') },
    '⭐': { name: t('leaderboardBadgeExpert'), description: t('leaderboardBadgeExpertDesc') },
    '👑': { name: t('leaderboardBadgeKing'), description: t('leaderboardBadgeKingDesc') },
  };

  // Update current user data with real data
  const leaderboardData = mockLeaderboardData.map(user => 
    user.isCurrentUser ? { ...user, level, points, name: t('leaderboardMe') } : user
  ).sort((a, b) => b.points - a.points).map((user, index) => ({ ...user, rank: index + 1 }));

  const currentUser = leaderboardData.find(user => user.isCurrentUser);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown color="#FFD700" size={24} />;
      case 2:
        return <Trophy color="#C0C0C0" size={24} />;
      case 3:
        return <Medal color="#CD7F32" size={24} />;
      default:
        return <Text style={styles.rankNumber}>{rank}</Text>;
    }
  };

  const LeaderboardItem = ({ user, index }: { user: LeaderboardUser; index: number }) => (
    <View style={[
      styles.leaderboardItem,
      { backgroundColor: isDarkMode ? '#374151' : 'white' },
      user.isCurrentUser && styles.currentUserItem
    ]}>
      <View style={styles.rankContainer}>
        {getRankIcon(user.rank)}
      </View>
      
      <View style={styles.avatarContainer}>
        <Text style={styles.avatar}>{user.avatar}</Text>
        {user.rank <= 3 && (
          <View style={styles.crownBadge}>
            <Star color="#FFD700" size={12} />
          </View>
        )}
      </View>
      
      <View style={styles.userInfo}>
        <Text style={[
          styles.userName,
          { color: isDarkMode ? 'white' : '#1F2937' },
          user.isCurrentUser && styles.currentUserName
        ]}>
          {user.name}
        </Text>
        <View style={styles.userStats}>
          <Text style={[styles.userLevel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
            Level {user.level}
          </Text>
          <Text style={styles.separator}>•</Text>
          <Text style={[styles.userPoints, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
            {user.points} {t('points')}
          </Text>
        </View>
        <View style={styles.achievementsContainer}>
          {user.achievements.map((achievement, idx) => (
            <Text key={idx} style={styles.achievementIcon}>{achievement}</Text>
          ))}
        </View>
      </View>
      
      <View style={styles.growthContainer}>
        <View style={styles.growthBadge}>
          <TrendingUp color="#10B981" size={12} />
          <Text style={styles.growthText}>+{user.weeklyGrowth}%</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen 
        options={{
          title: t('screenLeaderboard'),
          headerStyle: { backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF' },
          headerTintColor: isDarkMode ? '#FFFFFF' : '#000000',
          headerLeft: () => (
            <BackButton color={isDarkMode ? '#FFFFFF' : '#000000'} size={24} style={styles.backButton} />
          ),
        }}
      />
      
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Current User Stats */}
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.currentUserCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.currentUserContent}>
            <View style={styles.currentUserAvatar}>
              <Text style={styles.currentUserAvatarText}>🧑‍💼</Text>
            </View>
            <View style={styles.currentUserInfo}>
              <Text style={styles.currentUserTitle}>{t('progress')}</Text>
              <Text style={styles.currentUserRank}>#{currentUser?.rank || 8}</Text>
              <View style={styles.currentUserStats}>
                <View style={styles.statItem}>
                  <Award color="white" size={16} />
                  <Text style={styles.statText}>Level {level}</Text>
                </View>
                <View style={styles.statItem}>
                  <Star color="white" size={16} />
                  <Text style={styles.statText}>{points} {t('points')}</Text>
                </View>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[
              styles.tab,
              selectedTab === 'weekly' && styles.activeTab,
              { backgroundColor: isDarkMode ? '#374151' : 'white' }
            ]}
            onPress={() => setSelectedTab('weekly')}
          >
            <Text style={[
              styles.tabText,
              { color: isDarkMode ? '#D1D5DB' : '#6B7280' },
              selectedTab === 'weekly' && styles.activeTabText
            ]}>
              {t('week')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              selectedTab === 'monthly' && styles.activeTab,
              { backgroundColor: isDarkMode ? '#374151' : 'white' }
            ]}
            onPress={() => setSelectedTab('monthly')}
          >
            <Text style={[
              styles.tabText,
              { color: isDarkMode ? '#D1D5DB' : '#6B7280' },
              selectedTab === 'monthly' && styles.activeTabText
            ]}>
              {t('month')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              selectedTab === 'allTime' && styles.activeTab,
              { backgroundColor: isDarkMode ? '#374151' : 'white' }
            ]}
            onPress={() => setSelectedTab('allTime')}
          >
            <Text style={[
              styles.tabText,
              { color: isDarkMode ? '#D1D5DB' : '#6B7280' },
              selectedTab === 'allTime' && styles.activeTabText
            ]}>
              {t('hhTotal')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Top 3 Podium */}
        <View style={styles.podiumContainer}>
          <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            🏆 {t('hallOfFameTopPlayers')}
          </Text>
          <View style={styles.podium}>
            {/* 2nd Place */}
            <View style={styles.podiumPlace}>
              <LinearGradient
                colors={['#C0C0C0', '#A8A8A8']}
                style={[styles.podiumCard, styles.secondPlace]}
              >
                <Text style={styles.podiumAvatar}>{leaderboardData[1]?.avatar}</Text>
                <Text style={styles.podiumName}>{leaderboardData[1]?.name}</Text>
                <Text style={styles.podiumPoints}>{leaderboardData[1]?.points}</Text>
                <View style={styles.podiumRank}>
                  <Text style={styles.podiumRankText}>2</Text>
                </View>
              </LinearGradient>
            </View>
            
            {/* 1st Place */}
            <View style={styles.podiumPlace}>
              <LinearGradient
                colors={['#FFD700', '#FFA500']}
                style={[styles.podiumCard, styles.firstPlace]}
              >
                <View style={styles.crownContainer}>
                  <Crown color="white" size={20} />
                </View>
                <Text style={styles.podiumAvatar}>{leaderboardData[0]?.avatar}</Text>
                <Text style={styles.podiumName}>{leaderboardData[0]?.name}</Text>
                <Text style={styles.podiumPoints}>{leaderboardData[0]?.points}</Text>
                <View style={styles.podiumRank}>
                  <Text style={styles.podiumRankText}>1</Text>
                </View>
              </LinearGradient>
            </View>
            
            {/* 3rd Place */}
            <View style={styles.podiumPlace}>
              <LinearGradient
                colors={['#CD7F32', '#B8860B']}
                style={[styles.podiumCard, styles.thirdPlace]}
              >
                <Text style={styles.podiumAvatar}>{leaderboardData[2]?.avatar}</Text>
                <Text style={styles.podiumName}>{leaderboardData[2]?.name}</Text>
                <Text style={styles.podiumPoints}>{leaderboardData[2]?.points}</Text>
                <View style={styles.podiumRank}>
                  <Text style={styles.podiumRankText}>3</Text>
                </View>
              </LinearGradient>
            </View>
          </View>
        </View>

        {/* Full Leaderboard */}
        <View style={styles.leaderboardContainer}>
          <View style={styles.sectionHeader}>
            <BackButton
              color={isDarkMode ? '#D1D5DB' : '#6B7280'}
              size={20}
              style={styles.inlineBackButton}
              accessibilityLabel={t('back')}
              testID="leaderboard-back-inline"
            />
            <Users color={isDarkMode ? '#D1D5DB' : '#6B7280'} size={20} />
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('screenLeaderboard')}
            </Text>
          </View>
          
          {leaderboardData.map((user, index) => (
            <LeaderboardItem key={user.id} user={user} index={index} />
          ))}
        </View>

        {/* Achievements Section */}
        <View style={styles.achievementsSection}>
          <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            🏅 {t('achievements')}
          </Text>
          <View style={styles.achievementsList}>
            {Object.entries(achievements).map(([icon, achievement]) => (
              <View key={icon} style={[
                styles.achievementCard,
                { backgroundColor: isDarkMode ? '#374151' : 'white' }
              ]}>
                <Text style={styles.achievementCardIcon}>{icon}</Text>
                <View style={styles.achievementCardInfo}>
                  <Text style={[
                    styles.achievementCardName,
                    { color: isDarkMode ? 'white' : '#1F2937' }
                  ]}>
                    {achievement.name}
                  </Text>
                  <Text style={[
                    styles.achievementCardDescription,
                    { color: isDarkMode ? '#D1D5DB' : '#6B7280' }
                  ]}>
                    {achievement.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    padding: 8,
  },
  currentUserCard: {
    margin: 20,
    borderRadius: 20,
    padding: 20,
  },
  currentUserContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentUserAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  currentUserAvatarText: {
    fontSize: 24,
  },
  currentUserInfo: {
    flex: 1,
  },
  currentUserTitle: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    marginBottom: 4,
  },
  currentUserRank: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  currentUserStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#667eea',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: 'white',
  },
  podiumContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 16,
  },
  inlineBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  inlineBackText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  podium: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 8,
  },
  podiumPlace: {
    flex: 1,
  },
  podiumCard: {
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    position: 'relative',
  },
  firstPlace: {
    height: 140,
    marginBottom: 0,
  },
  secondPlace: {
    height: 120,
    marginBottom: 20,
  },
  thirdPlace: {
    height: 100,
    marginBottom: 40,
  },
  crownContainer: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
  },
  podiumAvatar: {
    fontSize: 24,
    marginBottom: 8,
  },
  podiumName: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
    marginBottom: 4,
  },
  podiumPoints: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
  },
  podiumRank: {
    position: 'absolute',
    bottom: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  podiumRankText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  leaderboardContainer: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  currentUserItem: {
    borderWidth: 2,
    borderColor: '#667eea',
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
    marginRight: 12,
  },
  rankNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6B7280',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    fontSize: 32,
  },
  crownBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  currentUserName: {
    color: '#667eea',
  },
  userStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  userLevel: {
    fontSize: 12,
  },
  separator: {
    fontSize: 12,
    color: '#D1D5DB',
    marginHorizontal: 6,
  },
  userPoints: {
    fontSize: 12,
  },
  achievementsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  achievementIcon: {
    fontSize: 14,
  },
  growthContainer: {
    alignItems: 'flex-end',
  },
  growthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  growthText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  achievementsSection: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  achievementsList: {
    gap: 12,
  },
  achievementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  achievementCardIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  achievementCardInfo: {
    flex: 1,
  },
  achievementCardName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  achievementCardDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
});