import React, { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Sparkles,
  Users,
  Upload,
  RefreshCw,
  Repeat,
  Target,
  TrendingUp,
  X,
} from 'lucide-react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useLanguageStore } from '@/store/language-store';
import { useAuth } from '@/store/auth-store';
import { useTheme } from '@/hooks/use-theme';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  checkIntroEligibility,
  formatRcProductPrice,
  PurchasesPackage,
} from '@/store/revenuecat-store';
import { useRegisterIntentStore } from '@/store/register-intent-store';
import { usePremiumBannerStore } from '@/store/premium-banner-store';
import { suppressNextTabsRedirect } from '@/lib/nav-guards';

const STICKY_CTA_BLOCK = 132;

function savingsPercent(monthlyPrice: number, annualPrice: number): number | null {
  if (!(monthlyPrice > 0) || !(annualPrice > 0)) return null;
  const fullYear = monthlyPrice * 12;
  if (!(fullYear > 0)) return null;
  const pct = Math.round((1 - annualPrice / fullYear) * 100);
  return pct > 0 ? pct : null;
}

/** Měsíční ekvivalent roční ceny (price / 12), cs-CZ včetně desetin. */
function formatMonthlyFromAnnual(annualPrice: number, currencyCode?: string | null): string {
  const monthly = Number(annualPrice) / 12;
  const code = String(currencyCode ?? 'CZK').trim().toUpperCase() || 'CZK';
  try {
    return new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(monthly);
  } catch {
    return `${monthly.toFixed(2).replace('.', ',')} Kč`;
  }
}

type BenefitItem = {
  key: string;
  Icon: typeof Users;
  color: string;
  bg: string;
};

const BENEFITS: BenefitItem[] = [
  { key: 'chooseSubscription.benefitHousehold', Icon: Users, color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)' },
  { key: 'chooseSubscription.benefitImports', Icon: Upload, color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
  { key: 'chooseSubscription.benefitFio', Icon: RefreshCw, color: '#06B6D4', bg: 'rgba(6,182,212,0.15)' },
  { key: 'chooseSubscription.benefitSubs', Icon: Repeat, color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  { key: 'chooseSubscription.benefitSave', Icon: Target, color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  { key: 'chooseSubscription.benefitInvest', Icon: TrendingUp, color: '#EC4899', bg: 'rgba(236,72,153,0.15)' },
];

export default function ChooseSubscriptionScreen() {
  const { colors } = useTheme();
  const { t } = useLanguageStore();
  const { user, activateSubscription } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    from?: string;
    feature?: string;
    reason?: string;
    remaining?: string;
    used?: string;
    limit?: string;
  }>();

  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [trialEligible, setTrialEligible] = useState(false);

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

  const finishPremiumSuccess = React.useCallback(
    async (kind: 'purchase' | 'restore') => {
      await activateSubscription('yearly');
      queryClient.invalidateQueries({ queryKey: ['rc-customer-info'] });
      queryClient.invalidateQueries({ queryKey: ['household-premium'] });
      if (kind === 'purchase') {
        usePremiumBannerStore.getState().show();
      }
      if (fromRegisterPremium) {
        useRegisterIntentStore.getState().markPremiumPaywallSeen();
        suppressNextTabsRedirect();
        router.replace('/welcome-tour');
        return;
      }
      router.replace('/(tabs)');
    },
    [activateSubscription, fromRegisterPremium, queryClient, router],
  );

  const purchaseMutation = useMutation({
    mutationFn: purchasePackage,
    onSuccess: async (customerInfo) => {
      if (customerInfo && hasPremiumAccess(customerInfo)) {
        await finishPremiumSuccess('purchase');
      }
    },
    onError: (error: any) => {
      if (error?.userCancelled || error?.code === '1' || error?.code === 1) return;
      console.error('[Paywall] Purchase error:', error);
      Alert.alert(t('error'), t('chooseSubscription.purchaseFailed'));
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restorePurchases,
    onSuccess: async (customerInfo) => {
      if (customerInfo && hasPremiumAccess(customerInfo)) {
        await finishPremiumSuccess('restore');
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
  const isBusy = purchaseMutation.isPending || restoreMutation.isPending;

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

  useEffect(() => {
    if (selectedPackageId) return;
    if (annualPkg?.identifier) {
      setSelectedPackageId(annualPkg.identifier);
      return;
    }
    if (sortedPackages[0]?.identifier) {
      setSelectedPackageId(sortedPackages[0].identifier);
    }
  }, [annualPkg, sortedPackages, selectedPackageId]);

  const selectedPkg =
    sortedPackages.find((p) => p.identifier === selectedPackageId) ?? annualPkg ?? sortedPackages[0] ?? null;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!selectedPkg) {
        setTrialEligible(false);
        return;
      }
      const intro = getIntroOfferLabel(selectedPkg);
      const productId = String(selectedPkg.product?.identifier ?? '');
      let eligible = false;
      if (productId) {
        eligible = await checkIntroEligibility(productId);
      }
      if (!cancelled) {
        setTrialEligible(Boolean(intro.hasFreeTrial || eligible));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedPkg]);

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

  const selectedPriceLabel = useMemo(() => {
    if (!selectedPkg) return '';
    const product = selectedPkg.product;
    const priceString = formatRcProductPrice(
      Number(product?.price ?? 0),
      product?.priceString,
      product?.currencyCode,
    );
    return isAnnualPackage(selectedPkg)
      ? t('chooseSubscription.pricePerYear', { price: priceString })
      : t('chooseSubscription.pricePerMonth', { price: priceString });
  }, [selectedPkg, t]);

  const showTrialCta = trialEligible;
  const stickyBottom = Math.max(insets.bottom, 12);
  const scrollPadBottom = STICKY_CTA_BLOCK + stickyBottom + 16;

  const handlePurchase = () => {
    if (!selectedPkg || isBusy) return;
    purchaseMutation.mutate(selectedPkg);
  };

  const renderPlanCard = (pkg: PurchasesPackage) => {
    const isAnnual = isAnnualPackage(pkg);
    const product = pkg.product;
    const selected = pkg.identifier === selectedPackageId;
    const priceString = formatRcProductPrice(
      Number(product?.price ?? 0),
      product?.priceString,
      product?.currencyCode,
    );
    const rightPrice = isAnnual
      ? t('chooseSubscription.pricePerYear', { price: priceString })
      : t('chooseSubscription.pricePerMonth', { price: priceString });
    const monthlyEq =
      isAnnual && Number(product?.price ?? 0) > 0
        ? formatMonthlyFromAnnual(Number(product.price), product?.currencyCode)
        : null;

    return (
      <TouchableOpacity
        key={pkg.identifier}
        style={[
          styles.planCard,
          {
            backgroundColor: colors.card,
            borderColor: selected ? colors.primary : colors.border,
            borderWidth: selected ? 2 : 1,
          },
        ]}
        onPress={() => setSelectedPackageId(pkg.identifier)}
        activeOpacity={0.88}
        disabled={isBusy}
      >
        {isAnnual && savePct != null ? (
          <View style={[styles.saveBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.saveBadgeText}>
              {t('chooseSubscription.saveBadge', { pct: String(savePct) })}
            </Text>
          </View>
        ) : null}

        <View style={styles.planCardInner}>
          <View
            style={[
              styles.radioOuter,
              { borderColor: selected ? colors.primary : colors.border },
            ]}
          >
            {selected ? <View style={[styles.radioInner, { backgroundColor: colors.primary }]} /> : null}
          </View>

          <View style={styles.planTextCol}>
            <Text style={[styles.planName, { color: colors.text }]}>
              {isAnnual ? t('chooseSubscription.planYearly') : t('chooseSubscription.planMonthly')}
            </Text>
            {monthlyEq ? (
              <Text style={[styles.planSub, { color: colors.textSecondary }]}>
                {t('chooseSubscription.monthlyEquiv', { price: monthlyEq })}
              </Text>
            ) : null}
          </View>

          <Text style={[styles.planPriceRight, { color: colors.text }]}>{rightPrice}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.topBarSpacer} />
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.muted }]}
          onPress={leavePaywall}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        >
          <X color={colors.text} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollPadBottom }]}
      >
        <View style={styles.hero}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            style={styles.heroIconCircle}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Sparkles color="#FFFFFF" size={28} />
          </LinearGradient>
          <Text style={[styles.heroTitle, { color: colors.text }]}>
            {t('chooseSubscription.heroTitle')}
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
            {t('chooseSubscription.heroSubtitle')}
          </Text>
        </View>

        {reasonBlurb ? (
          <Text style={[styles.reasonBlurb, { color: colors.warning }]}>{reasonBlurb}</Text>
        ) : null}

        <View style={styles.benefits}>
          {BENEFITS.map(({ key, Icon, color, bg }) => (
            <View key={key} style={styles.benefitRow}>
              <View style={[styles.benefitIcon, { backgroundColor: bg }]}>
                <Icon color={color} size={16} />
              </View>
              <Text style={[styles.benefitText, { color: colors.text }]} numberOfLines={1}>
                {t(key as 'chooseSubscription.benefitHousehold')}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.plansSection}>
          {offeringsQuery.isLoading ? (
            <>
              <View style={[styles.skeletonCard, { backgroundColor: colors.muted }]} />
              <View style={[styles.skeletonCard, { backgroundColor: colors.muted }]} />
            </>
          ) : sortedPackages.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.warning }]}>
                {t('chooseSubscription.comingSoon')}
              </Text>
            </View>
          ) : (
            sortedPackages.map(renderPlanCard)
          )}
        </View>

        {sortedPackages.length > 0 ? (
          <Text style={[styles.autoRenewText, { color: colors.textSecondary }]}>
            {t('chooseSubscription.autoRenew')}
          </Text>
        ) : null}

        <View style={styles.legalLinksRow}>
          <Pressable onPress={() => restoreMutation.mutate()} disabled={isBusy}>
            {restoreMutation.isPending ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={[styles.legalLink, { color: colors.textSecondary }]}>
                {t('chooseSubscription.restoreShort')}
              </Text>
            )}
          </Pressable>
          <Text style={{ color: colors.textSecondary }}>·</Text>
          <Pressable onPress={() => void Linking.openURL(TERMS_OF_USE_URL)}>
            <Text style={[styles.legalLink, { color: colors.textSecondary }]}>
              {t('chooseSubscription.termsShort')}
            </Text>
          </Pressable>
          <Text style={{ color: colors.textSecondary }}>·</Text>
          <Pressable onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}>
            <Text style={[styles.legalLink, { color: colors.textSecondary }]}>
              {t('chooseSubscription.privacyShort')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {sortedPackages.length > 0 ? (
        <View
          style={[
            styles.stickyPanel,
            {
              paddingBottom: stickyBottom,
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handlePurchase}
            disabled={isBusy || !selectedPkg}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              style={styles.ctaGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {purchaseMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.ctaText}>
                  {showTrialCta
                    ? t('chooseSubscription.ctaStartTrial')
                    : t('chooseSubscription.ctaContinue')}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
          <Text style={[styles.finePrint, { color: colors.textSecondary }]}>
            {showTrialCta
              ? t('chooseSubscription.finePrintTrial', { price: selectedPriceLabel })
              : t('chooseSubscription.finePrintPaid', { price: selectedPriceLabel })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  topBarSpacer: {
    flex: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 20,
  },
  heroIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  heroSubtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  reasonBlurb: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 14,
    textAlign: 'center',
  },
  benefits: {
    gap: 10,
    marginBottom: 22,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  plansSection: {
    gap: 12,
    marginBottom: 16,
  },
  skeletonCard: {
    height: 72,
    borderRadius: 16,
  },
  emptyCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  planCard: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 14,
    overflow: 'visible',
  },
  saveBadge: {
    position: 'absolute',
    top: -10,
    right: 12,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 2,
  },
  saveBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  planCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  planTextCol: {
    flex: 1,
  },
  planName: {
    fontSize: 16,
    fontWeight: '700',
  },
  planSub: {
    marginTop: 2,
    fontSize: 13,
  },
  planPriceRight: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
  },
  autoRenewText: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 14,
  },
  legalLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  legalLink: {
    fontSize: 12,
    fontWeight: '500',
  },
  stickyPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  ctaGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  finePrint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
