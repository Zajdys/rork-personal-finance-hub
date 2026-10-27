import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User,
  Calendar,
  Crown,
  CreditCard,
  LogOut,
  Edit3,
  ExternalLink,
  RefreshCw,
} from 'lucide-react-native';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useAuth } from '@/store/auth-store';
import { usePremium } from '@/hooks/usePremium';
import {
  useRevenueCatStore,
  restorePurchases,
  hasPremiumAccess,
} from '@/store/revenuecat-store';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { safeGoBack } from '@/lib/safe-back';

export default function AccountScreen() {
  const { isDarkMode } = useSettingsStore();
  const { t } = useLanguageStore();
  const { user, logout, activateSubscription } = useAuth();
  const { isPremium, isHouseholdPremium } = usePremium();
  const rcPlan = useRevenueCatStore((s) => s.plan);
  const rcExpiresAt = useRevenueCatStore((s) => s.expiresAt);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [restoring, setRestoring] = useState(false);

  const handleEditProfile = () => {
    router.push('/edit-profile');
  };

  const handleTryPremium = () => {
    router.push('/choose-subscription');
  };

  const handleManageSubscription = () => {
    if (Platform.OS === 'ios') {
      void Linking.openURL('https://apps.apple.com/account/subscriptions');
    } else {
      void Linking.openURL('https://play.google.com/store/account/subscriptions');
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const info = await restorePurchases();
      if (info && hasPremiumAccess(info)) {
        await activateSubscription('yearly');
        Alert.alert(t('chooseSubscription.successTitle'), t('chooseSubscription.restored'));
      } else {
        Alert.alert('Info', t('chooseSubscription.noPrevious'));
      }
    } catch {
      Alert.alert(t('error'), t('chooseSubscription.restoreFailed'));
    } finally {
      setRestoring(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(t('account.logoutTitle'), t('account.logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('account.logoutTitle'),
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const isSharedOnly = isHouseholdPremium && !isPremium;
  const planName = rcPlan === 'yearly' ? t('account.planYearly') : t('account.planMonthly');
  const renewText = rcExpiresAt
    ? t('account.renewsOn', { date: new Date(rcExpiresAt).toLocaleDateString('cs-CZ') })
    : '';
  const subscriptionLabel = isPremium
    ? rcPlan && renewText
      ? t('account.premiumPlanLabel', { plan: planName, renew: renewText })
      : rcPlan
        ? `Premium · ${planName}`
        : 'Premium'
    : isSharedOnly
      ? t('account.premiumShared')
      : t('account.planFree');
  const badgeActive = isPremium || isSharedOnly;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC', paddingTop: insets.top },
      ]}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerTop}>
            <BackButton
              color="white"
              size={24}
              style={styles.backButton}
              onPress={() => safeGoBack('/(tabs)/profile')}
            />
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>{t('profileMyAccount')}</Text>
              <Text style={styles.headerSubtitle}>{t('profileAccountSubtitle')}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          <View style={[styles.accountCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
            <View style={styles.accountHeader}>
              <View style={styles.avatarContainer}>
                <LinearGradient
                  colors={['#667eea', '#764ba2']}
                  style={styles.avatar}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <User color="white" size={32} />
                </LinearGradient>
              </View>
              <View style={styles.accountInfo}>
                <Text style={[styles.accountName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {user?.name || t('account.userFallback')}
                </Text>
                <Text style={[styles.accountEmail, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                  {user?.email || t('account.unknownEmail')}
                </Text>
              </View>
              <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
                <Edit3 color="#667eea" size={20} />
              </TouchableOpacity>
            </View>

            <View style={styles.accountDetails}>
              <View style={styles.accountDetail}>
                <Calendar color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={16} />
                <Text
                  style={[styles.accountDetailText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}
                >
                  {t('account.memberSince', {
                    date: user?.registrationDate
                      ? new Date(user.registrationDate).toLocaleDateString('cs-CZ')
                      : t('account.unknown'),
                  })}
                </Text>
              </View>
            </View>
          </View>

          <View
            style={[styles.subscriptionCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
          >
            <View style={styles.subscriptionHeader}>
              <View style={styles.subscriptionIcon}>
                <Crown color="#F59E0B" size={24} />
              </View>
              <View style={styles.subscriptionInfo}>
                <Text
                  style={[styles.subscriptionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}
                >
                  {t('account.subscription')}
                </Text>
                <Text
                  style={[
                    styles.subscriptionSubtitle,
                    { color: isDarkMode ? '#9CA3AF' : '#6B7280' },
                  ]}
                >
                  {subscriptionLabel}
                </Text>
              </View>
              <View
                style={[
                  styles.subscriptionBadge,
                  { backgroundColor: badgeActive ? '#10B981' : '#6B7280' },
                ]}
              >
                <Text style={styles.subscriptionBadgeText}>
                  {badgeActive ? t('account.active') : t('account.planFree')}
                </Text>
              </View>
            </View>

            {!isSharedOnly ? (
              <TouchableOpacity
                style={styles.manageSubscriptionButton}
                onPress={isPremium ? handleManageSubscription : handleTryPremium}
              >
                <LinearGradient
                  colors={['#667eea', '#764ba2']}
                  style={styles.manageSubscriptionGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <CreditCard color="white" size={20} />
                  <Text style={styles.manageSubscriptionText}>
                    {isPremium ? t('account.manageSubscription') : t('account.tryPremium')}
                  </Text>
                  {isPremium ? <ExternalLink color="white" size={16} /> : null}
                </LinearGradient>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.restoreBtn, { borderColor: isDarkMode ? '#4B5563' : '#E5E7EB' }]}
              onPress={() => void handleRestore()}
              disabled={restoring}
            >
              {restoring ? (
                <ActivityIndicator color="#667eea" size="small" />
              ) : (
                <>
                  <RefreshCw color="#667eea" size={18} />
                  <Text style={[styles.restoreText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                    {t('chooseSubscription.restore')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.logoutButton, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
            onPress={handleLogout}
          >
            <View style={[styles.menuButtonIcon, { backgroundColor: '#FEE2E2' }]}>
              <LogOut color="#EF4444" size={20} />
            </View>
            <View style={styles.menuButtonText}>
              <Text style={styles.logoutTitle}>{t('account.logoutTitle')}</Text>
              <Text style={[styles.logoutSub, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                {t('account.logoutSubtitle')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  headerTitleContainer: { flex: 1 },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  accountCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    marginTop: -20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarContainer: { marginRight: 16 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: { flex: 1 },
  accountName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  accountEmail: { fontSize: 14 },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountDetails: { paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  accountDetail: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accountDetailText: { fontSize: 14 },
  subscriptionCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  subscriptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  subscriptionInfo: { flex: 1 },
  subscriptionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  subscriptionSubtitle: { fontSize: 13, lineHeight: 18 },
  subscriptionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  subscriptionBadgeText: { color: 'white', fontSize: 12, fontWeight: '700' },
  manageSubscriptionButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
  },
  manageSubscriptionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  manageSubscriptionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  restoreText: { fontSize: 15, fontWeight: '600' },
  logoutButton: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  menuButtonIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: { flex: 1 },
  logoutTitle: { fontSize: 16, fontWeight: '700', color: '#EF4444' },
  logoutSub: { fontSize: 13, marginTop: 2 },
});
