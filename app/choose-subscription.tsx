import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Pressable,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CheckCircle,
  Star,
  RefreshCw,
} from 'lucide-react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useAuth } from '@/store/auth-store';
import { useTheme } from '@/hooks/use-theme';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BackButton } from '@/components/BackButton';
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '@/constants/legal-urls';
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  getCustomerInfo,
  hasPremiumAccess,
  loginUser,
  isAnnualPackage,
  getIntroOfferLabel,
  hasRevenueCatApiKey,
  presentAppleCodeRedemptionSheet,
  useRevenueCatStore,
  PurchasesPackage,
} from '@/store/revenuecat-store';
import { useRegisterIntentStore } from '@/store/register-intent-store';
import { suppressNextTabsRedirect } from '@/lib/nav-guards';

function formatMoneyFromProduct(price: number, priceString: string, currencyCode?: string): string {
  if (typeof priceString === 'string' && priceString.trim()) return priceString;
  try {
    return new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency: currencyCode || 'CZK',
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return String(price);
  }
}

function monthlyEquivalent(annualPrice: number): number {
  return annualPrice / 12;
}

function savingsPercent(monthlyPrice: number, annualPrice: number): number | null {
  if (!(monthlyPrice > 0) || !(annualPrice > 0)) return null;
  const fullYear = monthlyPrice * 12;
  if (!(fullYear > 0)) return null;
  const pct = Math.round((1 - annualPrice / fullYear) * 100);
  return pct > 0 ? pct : null;
}

export default function ChooseSubscriptionScreen() {
  const { isDarkMode } = useSettingsStore();
  const { colors } = useTheme();
  const { t } = useLanguageStore();
  const { user, activateSubscription } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    from?: string;
    feature?: string;
    reason?: string;
    remaining?: string;
    used?: string;
    limit?: string;
  }>();

  const offeringsQuery = useQuery({
    queryKey: ['rc-offerings'],
    queryFn: getOfferings,
  });

  useQuery({
    queryKey: ['rc-customer-info'],
    queryFn: getCustomerInfo,
  });

  const fromRegisterPremium = params.from === 'register-premium';

  const leavePaywall = React.useCallback(() => {
    if (fromRegisterPremium) {
      useRegisterIntentStore.getState().markPremiumPaywallSeen();
      suppressNextTabsRedirect();
      router.replace('/welcome-tour');
      return;
    }
    if (params.from === 'welcome') {
      router.replace('/(tabs)');
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [fromRegisterPremium, params.from, router]);

  const purchaseMutation = useMutation({
    mutationFn: purchasePackage,
    onSuccess: async (customerInfo) => {
      if (customerInfo && hasPremiumAccess(customerInfo)) {
        await activateSubscription('yearly');
        queryClient.invalidateQueries({ queryKey: ['rc-customer-info'] });
        queryClient.invalidateQueries({ queryKey: ['household-premium'] });
        Alert.alert(
          t('chooseSubscription.successTitle'),
          t('chooseSubscription.activated'),
          [{ text: 'OK', onPress: leavePaywall }],
        );
      }
    },
    onError: (error: any) => {
      console.error('[Paywall] Purchase error:', error);
      Alert.alert(t('error'), t('chooseSubscription.purchaseFailed'));
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restorePurchases,
    onSuccess: async (customerInfo) => {
      if (customerInfo && hasPremiumAccess(customerInfo)) {
        await activateSubscription('yearly');
        queryClient.invalidateQueries({ queryKey: ['rc-customer-info'] });
        queryClient.invalidateQueries({ queryKey: ['household-premium'] });
        Alert.alert(
          t('chooseSubscription.successTitle'),
          t('chooseSubscription.restored'),
          [{ text: 'OK', onPress: leavePaywall }],
        );
      } else {
        Alert.alert('Info', t('chooseSubscription.noPrevious'));
      }
    },
    onError: (error: any) => {
      console.error('[Paywall] Restore error:', error);
      Alert.alert(t('error'), t('chooseSubscription.restoreFailed'));
    },
  });

  React.useEffect(() => {
    if (user?.id) {
      void loginUser(user.id);
    }
  }, [user?.id]);

  const packages = offeringsQuery.data?.current?.availablePackages ?? [];
  const isLoading =
    offeringsQuery.isLoading || purchaseMutation.isPending || restoreMutation.isPending;

  const sortedPackages = useMemo(() => {
    const list = [...packages];
    list.sort((a, b) => Number(isAnnualPackage(b)) - Number(isAnnualPackage(a)));
    return list;
  }, [packages]);

  const monthlyPkg = sortedPackages.find((p) => !isAnnualPackage(p));
  const annualPkg = sortedPackages.find((p) => isAnnualPackage(p));
  const monthlyPriceNum = Number(monthlyPkg?.product?.price ?? 0);
  const annualPriceNum = Number(annualPkg?.product?.price ?? 0);
  const savePct = savingsPercent(monthlyPriceNum, annualPriceNum);

  const reasonBlurb = useMemo(() => {
    if (params.reason === 'unlimited_imports' || params.feature === 'unlimited_imports') {
      const remaining = Number(params.remaining);
      if (Number.isFinite(remaining) && remaining <= 0) {
        return t('premium.importLimitExhausted', {
          limit: params.limit || '2',
        });
      }
      if (Number.isFinite(remaining) && remaining > 0) {
        return t('premium.importLimitPaywallRemaining', {
          limit: params.limit || '2',
          remaining: String(remaining),
        });
      }
      return t('premium.importLimitPaywall');
    }
    return null;
  }, [params.feature, params.reason, params.remaining, params.limit, t]);

  const planFeatures = useMemo(
    () => [
      t('chooseSubscription.benefitHousehold'),
      t('chooseSubscription.benefitImports'),
      t('chooseSubscription.benefitFio'),
      t('chooseSubscription.benefitSubs'),
      t('chooseSubscription.benefitSave'),
      t('chooseSubscription.benefitInvest'),
    ],
    [t],
  );

  const renderBenefits = () => (
    <View style={styles.features}>
      {planFeatures.map((feature, index) => (
        <View key={index} style={styles.feature}>
          <CheckCircle color="#10B981" size={16} />
          <Text style={[styles.featureText, { color: colors.text }]}>{feature}</Text>
        </View>
      ))}
    </View>
  );

  const handleSelectPackage = (pkg: PurchasesPackage) => {
    Alert.alert(
      t('chooseSubscription.confirmTitle'),
      t('chooseSubscription.confirmMessage', { title: pkg.product.title }),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('confirm'), onPress: () => purchaseMutation.mutate(pkg) },
      ],
    );
  };

  const handleContinueFree = () => {
    leavePaywall();
  };

  const showRedeemCode =
    Platform.OS === 'ios' && hasRevenueCatApiKey();

  const handleRedeemCode = async () => {
    try {
      await presentAppleCodeRedemptionSheet();
    } catch (e) {
      console.warn('[Paywall] Code redemption sheet failed', e);
    } finally {
      void useRevenueCatStore.getState().refreshPremium(user?.id);
      queryClient.invalidateQueries({ queryKey: ['rc-customer-info'] });
      queryClient.invalidateQueries({ queryKey: ['household-premium'] });
    }
  };

  const renderPackageCard = (pkg: PurchasesPackage) => {
    const isAnnual = isAnnualPackage(pkg);
    const product = pkg.product;
    const priceString = formatMoneyFromProduct(
      Number(product?.price ?? 0),
      String(product?.priceString ?? ''),
      product?.currencyCode,
    );
    const intro = getIntroOfferLabel(pkg);
    const eqMonthly =
      isAnnual && annualPriceNum > 0
        ? formatMoneyFromProduct(
            monthlyEquivalent(annualPriceNum),
            '',
            product?.currencyCode,
          )
        : null;

    let highlightLine: string | null = null;
    if (isAnnual && eqMonthly) {
      highlightLine = t('chooseSubscription.annualHighlight', {
        yearly: priceString,
        monthly: eqMonthly,
        save: savePct != null ? String(savePct) : '33',
      });
    }

    let introLine: string | null = null;
    if (intro.hasFreeTrial && intro.priceAfter) {
      const days = intro.periodDays ?? 14;
      introLine = isAnnual
        ? t('chooseSubscription.trialThenYearly', { days: String(days), price: intro.priceAfter })
        : t('chooseSubscription.trialThenMonthly', { days: String(days), price: intro.priceAfter });
    }

    return (
      <View
        key={pkg.identifier}
        style={[
          styles.planCard,
          {
            backgroundColor: isDarkMode ? '#1F2937' : 'white',
            borderColor: isAnnual ? '#667eea' : 'transparent',
          },
        ]}
      >
        {isAnnual ? (
          <View style={[styles.badge, { backgroundColor: '#F59E0B' }]}>
            <Star color="white" size={14} fill="white" />
            <Text style={styles.badgeText}>{t('chooseSubscription.bestValue')}</Text>
          </View>
        ) : null}

        <View style={styles.planHeader}>
          <Text style={[styles.planName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {isAnnual ? t('account.planYearly') : t('account.planMonthly')}
          </Text>
          <View style={styles.priceContainer}>
            <Text style={[styles.price, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {priceString}
            </Text>
            <Text style={[styles.period, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              /{isAnnual ? t('chooseSubscription.perYear') : t('chooseSubscription.perMonth')}
            </Text>
          </View>
        </View>

        {highlightLine ? (
          <Text style={[styles.highlight, { color: isDarkMode ? '#C4B5FD' : '#667eea' }]}>
            {highlightLine}
          </Text>
        ) : null}

        {introLine ? (
          <Text style={[styles.introLine, { color: isDarkMode ? '#A7F3D0' : '#059669' }]}>
            {introLine}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.selectButton, isAnnual && styles.popularButton]}
          onPress={() => handleSelectPackage(pkg)}
          disabled={isLoading}
        >
          <LinearGradient
            colors={isAnnual ? ['#667eea', '#764ba2'] : ['#10B981', '#059669']}
            style={styles.selectButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {purchaseMutation.isPending ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text style={styles.selectButtonText}>
                {intro.hasFreeTrial
                  ? t('premium.tryFreeTrial')
                  : t('chooseSubscription.selectPlan')}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={[styles.autoRenewText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
          {t('chooseSubscription.autoRenew', {
            price: priceString,
            period: isAnnual
              ? t('chooseSubscription.perYear')
              : t('chooseSubscription.perMonth'),
          })}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <BackButton
            color="white"
            size={24}
            style={styles.backButton}
            onPress={leavePaywall}
          />
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{t('screenChooseSubscription')}</Text>
            <Text style={styles.headerSubtitle}>{t('chooseSubscription.subtitle')}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {reasonBlurb ? (
            <Text style={[styles.reasonBlurb, { color: isDarkMode ? '#FDE68A' : '#92400E' }]}>
              {reasonBlurb}
            </Text>
          ) : null}

          {offeringsQuery.isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#667eea" />
              <Text style={[styles.loadingText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                {t('chooseSubscription.loading')}
              </Text>
            </View>
          ) : sortedPackages.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
              <Text
                style={[
                  styles.emptyText,
                  { color: isDarkMode ? '#FDE68A' : '#92400E', fontWeight: '700', marginBottom: 16 },
                ]}
              >
                {t('chooseSubscription.comingSoon')}
              </Text>
              {renderBenefits()}
            </View>
          ) : (
            <>
              <View
                style={[
                  styles.benefitsCard,
                  { backgroundColor: isDarkMode ? '#1F2937' : 'white' },
                ]}
              >
                {renderBenefits()}
              </View>
              {sortedPackages.map(renderPackageCard)}
            </>
          )}

          <TouchableOpacity
            style={[styles.restoreButton, { borderColor: isDarkMode ? '#374151' : '#E5E7EB' }]}
            onPress={() => restoreMutation.mutate()}
            disabled={isLoading}
          >
            {restoreMutation.isPending ? (
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

          {showRedeemCode ? (
            <TouchableOpacity
              style={styles.redeemCodeButton}
              onPress={() => void handleRedeemCode()}
              disabled={isLoading}
            >
              <Text style={[styles.redeemCodeText, { color: isDarkMode ? '#C4B5FD' : '#667eea' }]}>
                {t('chooseSubscription.redeemCode')}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.continueFree} onPress={handleContinueFree}>
            <Text style={[styles.continueFreeText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              {t('chooseSubscription.continueFree')}
            </Text>
          </TouchableOpacity>

          <View style={styles.legalLinksRow}>
            <Pressable onPress={() => void Linking.openURL(TERMS_OF_USE_URL)}>
              <Text style={[styles.legalLink, { color: '#667eea' }]}>
                {t('chooseSubscription.termsLink')}
              </Text>
            </Pressable>
            <Text style={{ color: isDarkMode ? '#6B7280' : '#9CA3AF' }}>·</Text>
            <Pressable onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}>
              <Text style={[styles.legalLink, { color: '#667eea' }]}>
                {t('chooseSubscription.privacyLink')}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  headerGradient: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
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
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    marginTop: 4,
  },
  content: {
    padding: 20,
  },
  reasonBlurb: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 16,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  emptyCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'stretch',
    marginBottom: 16,
  },
  benefitsCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  planCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  badge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold' as const,
    color: 'white',
  },
  planHeader: {
    marginBottom: 12,
  },
  planName: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 36,
    fontWeight: 'bold' as const,
    color: '#1F2937',
  },
  period: {
    fontSize: 16,
    color: '#6B7280',
    marginLeft: 4,
  },
  highlight: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 20,
  },
  introLine: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  features: {
    width: '100%',
    alignSelf: 'stretch',
    gap: 12,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
  },
  featureText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'left',
    color: '#6B7280',
  },
  selectButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  popularButton: {
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  selectButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  selectButtonText: {
    fontSize: 17,
    fontWeight: 'bold' as const,
    color: 'white',
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  restoreText: {
    fontSize: 15,
    fontWeight: '500' as const,
  },
  redeemCodeButton: {
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 4,
  },
  redeemCodeText: {
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  continueFree: {
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  continueFreeText: {
    fontSize: 15,
    fontWeight: '600',
  },
  autoRenewText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
    textAlign: 'center',
  },
  legalLinksRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginBottom: 32,
  },
  legalLink: {
    fontSize: 14,
    fontWeight: '600' as const,
    textDecorationLine: 'underline',
  },
});
