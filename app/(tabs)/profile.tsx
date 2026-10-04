import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  RefreshControl,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import { StatusBar } from 'expo-status-bar';
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
  Sparkles,
  CreditCard,
  Users,
  UsersRound,
  PiggyBank,
  Building2,
  Lock,
  FileText,
  Pencil,
  EyeOff,
} from 'lucide-react-native';

import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { appLocale } from '@/lib/app-locale';
import { useAuth } from '@/store/auth-store';
import { useFinanceStore } from '@/store/finance-store';
import { fetchUserProfileFromSupabase } from '@/lib/user-profile-supabase';
import { computeProfileRecommendations } from '@/lib/financial-recommendations';
import { formatMoneyWithSymbol } from '@/lib/format-money';
import { yyyyMmLocalToday } from '@/lib/transaction-date';
import { CollapsingGradientHeader } from '@/components/CollapsingGradientHeader';

import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';
import { TERMS_OF_USE_URL } from '@/constants/legal-urls';

const HEADER_COLLAPSED_BODY = 44;
const HEADER_EXPANDED_BODY = 88;

function profileInitials(firstName: string, lastName: string, fallbackName: string, email: string): string {
  const f = firstName.trim();
  const l = lastName.trim();
  if (f && l) return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  const fb = fallbackName.trim();
  if (fb.length >= 2) return fb.slice(0, 2).toUpperCase();
  if (fb.length === 1) return fb.toUpperCase();
  const local = email.split('@')[0] ?? '';
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  return local.charAt(0).toUpperCase() || '?';
}

export default function ProfileScreen() {
  const { user } = useAuth();
  const { theme, userProfile, setUserProfile, getCurrentCurrency } = useSettingsStore();
  const appCurrency = getCurrentCurrency();
  const transactions = useFinanceStore((s) => s.transactions);
  const { colors } = useTheme();
  const { t, language } = useLanguageStore();
  const router = useRouter();
  const numberLocale = appLocale(language);
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const headerMin = insets.top + HEADER_COLLAPSED_BODY;
  const headerMax = insets.top + HEADER_EXPANDED_BODY;
  const scrollDistance = Math.max(1, headerMax - headerMin);
  const isIOS = Platform.OS === 'ios';
  const scrollYInsetOffset = isIOS ? headerMax : 0;
  const scrollY = useSharedValue(isIOS ? -headerMax : 0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const collapsingHeaderStyle = useAnimatedStyle(() => {
    const y = scrollY.value + scrollYInsetOffset;
    return {
      height: interpolate(y, [0, scrollDistance], [headerMax, headerMin], Extrapolation.CLAMP),
    };
  });
  const headerGradientFadeStyle = useAnimatedStyle(() => {
    const y = scrollY.value + scrollYInsetOffset;
    return { opacity: interpolate(y, [0, scrollDistance], [1, 0], Extrapolation.CLAMP) };
  });
  const headerHairlineStyle = useAnimatedStyle(() => {
    const y = scrollY.value + scrollYInsetOffset;
    return {
      opacity: interpolate(y, [scrollDistance * 0.65, scrollDistance], [0, 1], Extrapolation.CLAMP),
    };
  });
  const largeGreetingStyle = useAnimatedStyle(() => {
    const y = scrollY.value + scrollYInsetOffset;
    return {
      opacity: interpolate(y, [0, scrollDistance * 0.55], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(y, [0, scrollDistance], [0, -12], Extrapolation.CLAMP) },
      ],
    };
  });
  const compactTitleStyle = useAnimatedStyle(() => {
    const y = scrollY.value + scrollYInsetOffset;
    return {
      opacity: interpolate(y, [scrollDistance * 0.4, scrollDistance * 0.85], [0, 1], Extrapolation.CLAMP),
    };
  });

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      const row = await fetchUserProfileFromSupabase(user.id);
      if (row) {
        setUserProfile({
          firstName: row.first_name ?? '',
          lastName: row.last_name ?? '',
          avatarUrl: row.avatar_url ?? null,
        });
      }
    } catch (e) {
      console.warn('[profile] load', e);
    }
  }, [user?.id, setUserProfile]);

  useFocusRefresh(loadProfile);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadProfile();
    } finally {
      setRefreshing(false);
    }
  }, [loadProfile]);

  const recommendations = useMemo(
    () => computeProfileRecommendations(transactions, yyyyMmLocalToday()),
    [transactions],
  );

  const getThemeDisplayName = () => {
    switch (theme) {
      case 'light':
        return t('themeLightShort');
      case 'dark':
        return t('themeDarkShort');
      case 'auto':
        return t('themeAutoShort');
      default:
        return t('themeLightShort');
    }
  };

  const MenuButton = ({ icon: Icon, title, subtitle, onPress }: any) => (
    <TouchableOpacity style={[styles.menuButton, { backgroundColor: colors.card }]} onPress={onPress}>
      <View style={styles.menuButtonContent}>
        <View style={[styles.menuButtonIcon, { backgroundColor: colors.muted }]}>
          <Icon color={colors.primary} size={24} />
        </View>
        <View style={styles.menuButtonText}>
          <Text style={[styles.menuButtonTitle, { color: colors.text }]}>{title}</Text>
          {subtitle && (
            <Text style={[styles.menuButtonSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
          )}
        </View>
        <ChevronRight color={colors.textSecondary} size={20} />
      </View>
    </TouchableOpacity>
  );

  const displayName =
    [userProfile.firstName, userProfile.lastName].filter(Boolean).join(' ').trim() ||
    user?.name ||
    `MoneyBuddy ${t('user')}`;
  const initials = profileInitials(
    userProfile.firstName,
    userProfile.lastName,
    user?.name ?? '',
    user?.email ?? '',
  );

  const RecommendationCard = ({
    title,
    value,
    subtitle,
    color,
    onPress,
  }: {
    title: string;
    value: string;
    subtitle: string;
    color: readonly [string, string];
    onPress?: () => void;
  }) => (
    <TouchableOpacity
      style={styles.recommendationCard}
      onPress={onPress}
      activeOpacity={onPress ? 0.88 : 1}
      disabled={!onPress}
    >
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
    </TouchableOpacity>
  );

  return (
    <View style={[styles.rootFill, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <CollapsingGradientHeader
        heightStyle={collapsingHeaderStyle}
        gradientOpacityStyle={headerGradientFadeStyle}
        hairlineOpacityStyle={headerHairlineStyle}
        expandedOpacityStyle={largeGreetingStyle}
        collapsedOpacityStyle={compactTitleStyle}
        insetsTop={insets.top}
        backgroundColor={colors.background}
        borderColor={colors.border}
        gradientColors={[colors.gradientStart, colors.gradientEnd]}
        collapsedTitle={t('profile')}
        expandedContent={
          <View style={styles.profileExpandedRow}>
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>{initials}</Text>
            </View>
            <View style={styles.profileExpandedText}>
              <Text style={styles.profileDisplayName} numberOfLines={1}>
                {displayName}
              </Text>
              {user?.email ? (
                <Text style={styles.profileEmail} numberOfLines={1}>
                  {user.email}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.editIconBtn}
              onPress={() => router.push('/edit-profile')}
              accessibilityRole="button"
              accessibilityLabel={t('profileEditProfile')}
              hitSlop={10}
            >
              <Pencil color="white" size={20} />
            </TouchableOpacity>
          </View>
        }
      />

      <Animated.ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        showsVerticalScrollIndicator={false}
        bounces
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentInset={isIOS ? { top: headerMax } : undefined}
        contentOffset={isIOS ? { x: 0, y: -headerMax } : undefined}
        scrollIndicatorInsets={isIOS ? { top: headerMax } : undefined}
        contentInsetAdjustmentBehavior={isIOS ? 'never' : undefined}
        contentContainerStyle={{
          paddingTop: isIOS ? 24 : headerMin + 24,
          paddingBottom: 32,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor="#FFFFFF"
            colors={['#FFFFFF', colors.primary]}
            progressBackgroundColor={colors.primary}
            progressViewOffset={Platform.OS === 'android' ? headerMax : undefined}
          />
        }
      >
        {!isIOS ? <View style={{ height: scrollDistance }} collapsable={false} /> : null}

        {recommendations.visible ? (
          <View style={styles.recommendationsContainer}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('financialRecommendations')}
            </Text>
            <Text style={[styles.recommendationBasis, { color: colors.textSecondary }]}>
              {t('profileRecBasedOnAvg')}
            </Text>
            <View style={styles.recommendationsGrid}>
              <RecommendationCard
                title={t('profileRecSetAside')}
                value={formatMoneyWithSymbol(recommendations.setAside, numberLocale, appCurrency.symbol)}
                subtitle={t('profileRecSetAsideHint')}
                color={['#8B5CF6', '#7C3AED'] as const}
                onPress={() => router.push('/investment-detail')}
              />
              <RecommendationCard
                title={t('emergencyFundReserve')}
                value={formatMoneyWithSymbol(
                  recommendations.reserveTarget,
                  numberLocale,
                  appCurrency.symbol,
                )}
                subtitle={t('profileRecReserveHint')}
                color={['#10B981', '#059669'] as const}
                onPress={() => router.push('/reserve-detail')}
              />
            </View>
          </View>
        ) : null}

        <View style={styles.menuContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profileSectionFinance')}</Text>

          <MenuButton
            icon={PiggyBank}
            title={t('piggyBankFeature')}
            subtitle={t('profileSaveSubtitle')}
            onPress={() => router.push('/save')}
          />

          <MenuButton
            icon={UsersRound}
            title={t('splitGroups')}
            subtitle={t('profileSplitGroupsSubtitle')}
            onPress={() => router.push('/split-groups')}
          />

          <MenuButton
            icon={Sparkles}
            title={t('financialGoals')}
            subtitle={t('profileGoalsSubtitle')}
            onPress={() => router.push('/financial-goals')}
          />

          <MenuButton
            icon={CreditCard}
            title={t('profileMyLiabilities')}
            subtitle={t('profileLoansSubtitle')}
            onPress={() => router.push('/loans')}
          />
        </View>

        <View style={styles.menuContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profileSectionHousehold')}</Text>

          <MenuButton
            icon={Users}
            title={t('profileHouseholdSettings')}
            subtitle={t('profileHouseholdSubtitle')}
            onPress={() => router.push('/(tabs)/household')}
          />

          <MenuButton
            icon={Bell}
            title={t('profileNotificationSettings')}
            subtitle={t('profileHouseholdBillsSubtitle')}
            onPress={() => router.push('/household-notification-settings')}
          />
        </View>

        <View style={styles.menuContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profileSectionAccount')}</Text>

          <MenuButton
            icon={User}
            title={t('profileMyAccount')}
            subtitle={t('profileAccountSubtitle')}
            onPress={() => router.push('/account')}
          />

          <MenuButton
            icon={Building2}
            title={t('bankAccountsTitle')}
            subtitle={t('bankAccountsSubtitle')}
            onPress={() => router.push('/bank-accounts')}
          />
        </View>

        <View style={styles.menuContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('settings')}</Text>

          <MenuButton
            icon={Globe}
            title={t('language')}
            subtitle={language === 'cs' ? t('languageCs') : t('languageEn')}
            onPress={() => router.push('/language-settings')}
          />

          <MenuButton
            icon={DollarSign}
            title={t('appCurrency')}
            subtitle={`${appCurrency.name} (${appCurrency.code})`}
            onPress={() => router.push('/currency-settings')}
          />

          <MenuButton
            icon={Palette}
            title={t('theme')}
            subtitle={getThemeDisplayName()}
            onPress={() => router.push('/theme-settings')}
          />

          <MenuButton
            icon={Bell}
            title={t('notifications')}
            subtitle={t('profileNotificationsSubtitle')}
            onPress={() => router.push('/notifications-settings')}
          />

          <MenuButton
            icon={EyeOff}
            title={t('hiddenSubsTitle')}
            subtitle={t('dashboardDetectedHint')}
            onPress={() => router.push('/hidden-subscription-suggestions')}
          />

          <MenuButton
            icon={Lock}
            title={t('privacySecurity')}
            subtitle={t('profilePrivacySubtitle')}
            onPress={() => router.push('/privacy-settings')}
          />

          <MenuButton
            icon={Shield}
            title={t('privacyPolicy')}
            subtitle={t('privacyPolicySubtitle')}
            onPress={() => router.push('/privacy-policy')}
          />

          <MenuButton
            icon={FileText}
            title={t('termsOfUse')}
            subtitle={t('termsOfUseSubtitle')}
            onPress={() => {
              void Linking.openURL(TERMS_OF_USE_URL);
            }}
          />

          <MenuButton
            icon={HelpCircle}
            title={t('helpSupport')}
            subtitle={t('profileHelpSubtitle')}
            onPress={() => router.push('/help-support')}
          />

          <MenuButton
            icon={Settings}
            title={t('generalSettings')}
            subtitle={t('generalSettingsSubtitle')}
            onPress={() => router.push('/general-settings')}
          />
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootFill: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  profileExpandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  profileExpandedText: {
    flex: 1,
    minWidth: 0,
  },
  profileDisplayName: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
  },
  profileEmail: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  editIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  menuContainer: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  menuButton: {
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
    marginBottom: 2,
  },
  menuButtonSubtitle: {
    fontSize: 14,
  },
  recommendationsContainer: {
    marginHorizontal: 20,
    marginBottom: 32,
  },
  recommendationBasis: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 12,
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
    minHeight: 140,
    justifyContent: 'center',
  },
  recommendationValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
    textAlign: 'center',
  },
  recommendationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  recommendationSubtitle: {
    fontSize: 11,
    color: 'white',
    opacity: 0.85,
    textAlign: 'center',
    lineHeight: 15,
  },
});
