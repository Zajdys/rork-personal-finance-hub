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
  User,
  Settings,
  Bell,
  Shield,
  HelpCircle,
  Globe,
  DollarSign,
  Palette,
  ChevronRight,
  Eye,
  Sparkles,
  CreditCard,
  Users,
  Zap,
} from 'lucide-react-native';

import { useFinanceStore } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';

import { useRouter } from 'expo-router';
import { useLifeEvent } from '@/store/life-event-store';



export default function ProfileScreen() {
  const { totalTransactions, totalIncome } = useFinanceStore();
  const { isDarkMode, getCurrentCurrency, theme } = useSettingsStore();
  const { t, language } = useLanguageStore();
  const { getModeInfo, isActive } = useLifeEvent();
  const router = useRouter();
  
  const currentCurrency = getCurrentCurrency();
  const getThemeDisplayName = () => {
    switch (theme) {
      case 'light': return 'Světlé';
      case 'dark': return 'Tmavé';
      case 'auto': return 'Automatické';
      default: return 'Světlé';
    }
  };



  const MenuButton = ({ icon: Icon, title, subtitle, onPress }: any) => (
    <TouchableOpacity style={styles.menuButton} onPress={onPress}>
      <View style={styles.menuButtonContent}>
        <View style={styles.menuButtonIcon}>
          <Icon color="#667eea" size={24} />
        </View>
        <View style={styles.menuButtonText}>
          <Text style={styles.menuButtonTitle}>{title}</Text>
          {subtitle && <Text style={styles.menuButtonSubtitle}>{subtitle}</Text>}
        </View>
        <ChevronRight color="#9CA3AF" size={20} />
      </View>
    </TouchableOpacity>
  );

  const RecommendationCard = ({ title, value, subtitle, color }: any) => (
    <View style={styles.recommendationCard}>
      <LinearGradient
        colors={color}
        style={styles.recommendationGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.recommendationValue}>{value}</Text>
        <Text style={styles.recommendationTitle}>{title}</Text>
        <Text style={styles.recommendationSubtitle}>{subtitle}</Text>
      </LinearGradient>
    </View>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.profileInfo}>
          <View style={styles.avatar}>
            <User color="white" size={32} />
          </View>
          <View style={styles.profileText}>
            <Text style={styles.profileName}>MoneyBuddy {t('user')}</Text>
            <Text style={styles.profileLevel}>Personal Finance</Text>
          </View>
        </View>
      </LinearGradient>



      {/* Financial Recommendations */}
      <View style={styles.recommendationsContainer}>
        <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>{t('financialRecommendations')}</Text>
        <View style={styles.recommendationsGrid}>
          <RecommendationCard
            title={t('invest')}
            value={`${Math.round(totalIncome * 0.15).toLocaleString('cs-CZ')} Kč`}
            subtitle={`15${t('monthlyIncomePercent')}`}
            color={['#8B5CF6', '#7C3AED']}
          />
          <RecommendationCard
            title={t('emergencyFundReserve')}
            value={`${Math.round(totalIncome * 0.2).toLocaleString('cs-CZ')} Kč`}
            subtitle={`20${t('monthlyIncomePercent')}`}
            color={['#10B981', '#059669']}
          />
        </View>
      </View>



      {/* Features */}
      <View style={styles.menuContainer}>
        <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>{language === 'cs' ? 'Funkce' : 'Features'}</Text>
        
        <MenuButton
          icon={User}
          title="Můj účet"
          subtitle={language === 'cs' ? 'Správa profilu a předplatného' : 'Profile and subscription management'}
          onPress={() => router.push('/account')}
        />
        

        <MenuButton
          icon={Users}
          title={language === 'cs' ? 'Nastavení domácnosti' : 'Household Settings'}
          subtitle={language === 'cs' ? 'Správa partnerů a bilance' : 'Manage partners and balance'}
          onPress={() => router.push('/household')}
        />
        
        <MenuButton
          icon={Zap}
          title={language === 'cs' ? 'Životní režim' : 'Life-Event Mode'}
          subtitle={isActive ? `${getModeInfo().emoji} ${getModeInfo().title}` : (language === 'cs' ? 'Přizpůsob aplikaci své situaci' : 'Adapt app to your life situation')}
          onPress={() => router.push('/life-event')}
        />
        
        <MenuButton
          icon={Sparkles}
          title={t('financialGoals')}
          subtitle={language === 'cs' ? 'Nastav si cíle a sleduj pokrok' : 'Set goals and track progress'}
          onPress={() => router.push('/financial-goals')}
        />
        
        <MenuButton
          icon={CreditCard}
          title="Moje závazky"
          subtitle={language === 'cs' ? 'Správa úvěrů a hypoték' : 'Manage loans and mortgages'}
          onPress={() => router.push('/loans')}
        />
        
        <MenuButton
          icon={Sparkles}
          title="AI Hledač půjček"
          subtitle={language === 'cs' ? 'Najdi nejlepší nabídky na trhu' : 'Find the best offers on the market'}
          onPress={() => router.push('/loan-finder')}
        />
        
        <MenuButton
          icon={Eye}
          title="Náhled Landing Page"
          subtitle={language === 'cs' ? 'Podívej se, jak vypadá úvodní stránka' : 'See how the landing page looks'}
          onPress={() => router.push('/landing-preview')}
        />
      </View>

      {/* Settings */}
      <View style={styles.menuContainer}>
        <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>{t('settings')}</Text>
        
        <MenuButton
          icon={Globe}
          title={t('language')}
          subtitle={language === 'cs' ? 'Čeština' : 'English'}
          onPress={() => router.push('/language-settings')}
        />
        
        <MenuButton
          icon={DollarSign}
          title={t('currency')}
          subtitle="CZK (Koruna česká)"
          onPress={() => router.push('/currency-settings')}
        />
        
        <MenuButton
          icon={Palette}
          title={t('theme')}
          subtitle={language === 'cs' ? 'Světlé' : 'Light'}
          onPress={() => router.push('/theme-settings')}
        />
        
        <MenuButton
          icon={Bell}
          title={t('notifications')}
          subtitle={language === 'cs' ? 'Správa upozornění a tipů' : 'Manage alerts and tips'}
          onPress={() => router.push('/notifications-settings')}
        />
        
        <MenuButton
          icon={Shield}
          title={t('privacySecurity')}
          subtitle={t('protectData')}
          onPress={() => router.push('/privacy-settings')}
        />
        
        <MenuButton
          icon={Settings}
          title={t('generalSettings')}
          subtitle={t('additionalOptions')}
          onPress={() => router.push('/general-settings')}
        />
        
        <MenuButton
          icon={HelpCircle}
          title={t('help')}
          subtitle={t('faqContact')}
          onPress={() => router.push('/help-support')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  profileLevel: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
  },
  levelProgress: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
  },
  progressPoints: {
    fontSize: 12,
    color: 'white',
    opacity: 0.8,
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'white',
    borderRadius: 3,
  },
  statsContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 24,
    gap: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  statIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  statContent: {
    flex: 1,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: '#1F2937',
    marginBottom: 2,
  },
  statTitle: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: '#6B7280',
  },
  achievementsContainer: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  achievementsList: {
    gap: 12,
  },
  achievementCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  achievementCardLocked: {
    opacity: 0.6,
  },
  achievementIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  achievementContent: {
    flex: 1,
  },
  achievementTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  achievementTitleLocked: {
    color: '#9CA3AF',
  },
  achievementDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  achievementDescriptionLocked: {
    color: '#D1D5DB',
  },
  achievementBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuContainer: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  menuButton: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  menuButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  menuButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  menuButtonText: {
    flex: 1,
  },
  menuButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  menuButtonSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  recommendationsContainer: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  recommendationsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  recommendationCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  recommendationGradient: {
    padding: 20,
    alignItems: 'center',
  },
  recommendationValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  recommendationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginBottom: 2,
  },
  recommendationSubtitle: {
    fontSize: 12,
    color: 'white',
    opacity: 0.8,
    textAlign: 'center',
  },
  dailyRewardsCard: {
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 0,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#FFA500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  dailyRewardsGradient: {
    padding: 24,
  },
  dailyRewardsBigTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#FFFFFF',
    marginBottom: 16,
  },
  dailyRewardsContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dailyRewardsLeft: {
    flex: 1,
  },
  dailyRewardsStats: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 24,
  },
  dailyRewardsStat: {
    alignItems: 'flex-start',
  },
  dailyRewardsValue: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: '#FFFFFF',
    lineHeight: 32,
  },
  dailyRewardsLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#FFFFFF',
    opacity: 0.9,
    marginTop: 2,
  },
  dailyRewardsDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#FFFFFF',
    opacity: 0.3,
  },
  dailyRewardsRight: {
    marginLeft: 8,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
    alignSelf: 'flex-start',
  },
  streakText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
});