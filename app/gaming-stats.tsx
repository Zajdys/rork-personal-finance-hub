import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Award,
  Target,
  Trophy,
  Zap,
  Flame,

  TrendingUp,
  Calendar,
  Star,
} from 'lucide-react-native';
import { useBuddyStore } from '@/store/buddy-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useRouter, Stack } from 'expo-router';
import { StackHeaderBackButton } from '@/components/BackButton';

export default function GamingStatsScreen() {
  const { gamingStats, getBuddyScore } = useBuddyStore();
  const { isDarkMode } = useSettingsStore();
  const { t } = useLanguageStore();
  const router = useRouter();

  const buddyScore = getBuddyScore();
  const personalityType = gamingStats.personality.type;
  const personalityLabel = personalityType === 'analyst'
    ? t('gamingPersonalityAnalyst')
    : personalityType === 'motivator'
    ? t('gamingPersonalityMotivator')
    : t('gamingPersonalityBalanced');

  const getSeasonIcon = (theme: string) => {
    switch (theme) {
      case 'spring_clean': return '🌱';
      case 'summer_save': return '☀️';
      case 'invest_autumn': return '🍂';
      case 'winter_shield': return '❄️';
      default: return '🌟';
    }
  };

  const getSeasonColors = (theme: string): [string, string] => {
    switch (theme) {
      case 'spring_clean': return ['#10B981', '#059669'];
      case 'summer_save': return ['#F59E0B', '#D97706'];
      case 'invest_autumn': return ['#EF4444', '#DC2626'];
      case 'winter_shield': return ['#3B82F6', '#2563EB'];
      default: return ['#667eea', '#764ba2'];
    }
  };

  const StatCard = ({ icon: Icon, title, value, subtitle, color, onPress }: any) => (
    <TouchableOpacity 
      style={[styles.statCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Icon color={color} size={32} />
      <Text style={[styles.statValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
        {title}
      </Text>
      {subtitle && (
        <Text style={[styles.statSubtitle, { color: isDarkMode ? '#9CA3AF' : '#9CA3AF' }]}>
          {subtitle}
        </Text>
      )}
    </TouchableOpacity>
  );

  const InfoCard = ({ title, value, color }: any) => (
    <View style={styles.infoCard}>
      <LinearGradient
        colors={color}
        style={styles.infoGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.infoValue}>{value}</Text>
        <Text style={styles.infoTitle}>{title}</Text>
      </LinearGradient>
    </View>
  );

  return (
    <>
      <Stack.Screen 
        options={{
          headerShown: true,
          title: t('screenGamingStats'),
          headerStyle: {
            backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
          },
          headerTintColor: isDarkMode ? '#FFFFFF' : '#1F2937',
          headerLeft: ({ tintColor }) => (
            <StackHeaderBackButton tintColor={tintColor ?? (isDarkMode ? '#FFFFFF' : '#1F2937')} />
          ),
          headerShadowVisible: false,
        }}
      />
      <ScrollView 
        style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>
              {t('gamingStatsTitle')}
            </Text>
            <Text style={styles.headerSubtitle}>
              {t('gamingStatsSubtitle')}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.scoresContainer}>
          <InfoCard
            title="Buddy Score"
            value={buddyScore}
            color={['#F59E0B', '#D97706']}
          />
          <InfoCard
            title="Level"
            value={gamingStats.level}
            color={['#8B5CF6', '#7C3AED']}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {t('gamingMainStats')}
          </Text>
          <View style={styles.statsGrid}>
            <StatCard
              icon={Award}
              title={t('screenBadges')}
              value={gamingStats.badges.length}
              subtitle={t('gamingUnlocked')}
              color="#667eea"
              onPress={() => router.push('/badges')}
            />
            <StatCard
              icon={Target}
              title={t('screenQuests')}
              value={gamingStats.quests.filter(q => q.completed).length}
              subtitle={t('gamingCompleted')}
              color="#10B981"
              onPress={() => router.push('/quests')}
            />
            <StatCard
              icon={Flame}
              title="Streak"
              value={gamingStats.streak}
              subtitle={t('gamingDaysInRow')}
              color="#EF4444"
            />
            <StatCard
              icon={Zap}
              title={t('gamingCoins')}
              value={gamingStats.coins}
              subtitle={t('gamingCurrency')}
              color="#8B5CF6"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {t('gamingAdvancedStats')}
          </Text>
          <View style={styles.statsGrid}>
            <StatCard
              icon={TrendingUp}
              title={t('gamingTotalXp')}
              value={gamingStats.xp}
              color="#10B981"
            />
            <StatCard
              icon={Star}
              title="Lifetime XP"
              value={gamingStats.lifetimeXp}
              color="#F59E0B"
            />
            <StatCard
              icon={Calendar}
              title={t('gamingLongestStreak')}
              value={gamingStats.longestStreak}
              subtitle={t('gamingDays')}
              color="#EF4444"
            />
            <StatCard
              icon={Trophy}
              title={t('gamingHallOfFame')}
              value={t('viewAll')}
              color="#F59E0B"
              onPress={() => router.push('/hall-of-fame')}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {t('gamingPersonalityType')}
          </Text>
          <View style={[styles.personalityCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
            <Flame color="#EF4444" size={32} />
            <View style={styles.personalityContent}>
              <Text style={[styles.personalityLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                {t('gamingPersonalityType')}
              </Text>
              <Text style={[styles.personalityValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                {personalityLabel}
              </Text>
              <Text style={[styles.personalityDescription, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                {personalityType === 'analyst'
                  ? t('gamingPersonalityAnalystDesc')
                  : personalityType === 'motivator'
                  ? t('gamingPersonalityMotivatorDesc')
                  : t('gamingPersonalityBalancedDesc')
                }
              </Text>
            </View>
            <View style={styles.personalityBonus}>
              <Text style={[styles.bonusValue, { color: '#10B981' }]}>
                +{(gamingStats.personality.xpBonus * 100).toFixed(0)}%
              </Text>
              <Text style={[styles.bonusLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                XP Bonus
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {t('gamingMembership')}
          </Text>
          <View style={[styles.membershipCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
            <Calendar color="#667eea" size={24} />
            <View style={styles.membershipContent}>
              <Text style={[styles.membershipLabel, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                {t('gamingMemberSince')}
              </Text>
              <Text style={[styles.membershipValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                {new Date(gamingStats.memberSince).toLocaleDateString('cs-CZ')}
              </Text>
            </View>
          </View>
        </View>

        {gamingStats.currentSeason && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('gamingCurrentSeason')}
            </Text>
            <View style={[styles.seasonCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <LinearGradient
                colors={getSeasonColors(gamingStats.currentSeason.theme)}
                style={styles.seasonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.seasonIcon}>{getSeasonIcon(gamingStats.currentSeason.theme)}</Text>
                <Text style={styles.seasonName}>{gamingStats.currentSeason.name}</Text>
                <Text style={styles.seasonDescription}>{gamingStats.currentSeason.description}</Text>
              </LinearGradient>
            </View>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    textAlign: 'center',
  },
  scoresContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: -16,
    marginBottom: 24,
    gap: 12,
  },
  infoCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  infoGradient: {
    padding: 20,
    alignItems: 'center',
  },
  infoValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    opacity: 0.9,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  statSubtitle: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  personalityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  personalityContent: {
    flex: 1,
    marginLeft: 16,
  },
  personalityLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  personalityValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  personalityDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  personalityBonus: {
    alignItems: 'center',
  },
  bonusValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  bonusLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  membershipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  membershipContent: {
    marginLeft: 16,
  },
  membershipLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  membershipValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  seasonCard: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  seasonGradient: {
    padding: 24,
    alignItems: 'center',
  },
  seasonIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  seasonName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  seasonDescription: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    textAlign: 'center',
  },
});
