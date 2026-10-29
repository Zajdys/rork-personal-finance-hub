import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Lock, Sparkles, ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useLanguageStore } from '@/store/language-store';
import { useTheme } from '@/hooks/use-theme';
import { usePremium } from '@/hooks/usePremium';
import {
  PREMIUM_FEATURE_META,
  type PremiumFeatureId,
} from '@/constants/premium';
import { ScreenHeader } from '@/components/ScreenHeader';

type Props = {
  feature: PremiumFeatureId;
  /** true = vyžaduje vlastní nákup (ne stačí sdílené z domácnosti). Default false → isHouseholdPremium. */
  requireOwnPremium?: boolean;
  children: React.ReactNode;
  /** Volitelně jiný layout (např. kompaktní karta v sekci). */
  compact?: boolean;
};

/**
 * Když uživatel nemá Premium, místo children ukáže zámek + CTA na paywall.
 */
export function PremiumGate({
  feature,
  requireOwnPremium = false,
  children,
  compact = false,
}: Props) {
  const { t } = useLanguageStore();
  const { colors } = useTheme();
  const router = useRouter();
  const { isPremium, isHouseholdPremium, loading } = usePremium();

  const allowed = requireOwnPremium ? isPremium : isHouseholdPremium;

  if (loading) {
    return (
      <View style={[styles.card, compact && styles.cardCompact, { backgroundColor: colors.card }]}>
        <Text style={{ color: colors.textSecondary }}>{t('loading')}</Text>
      </View>
    );
  }

  if (allowed) return <>{children}</>;

  const meta = PREMIUM_FEATURE_META[feature];
  const title = t(meta.titleKey as 'premium.featureInvestTitle');
  const blurb = t(meta.blurbKey as 'premium.featureInvestBlurb');

  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      testID={`premium-gate-${feature}`}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.muted }]}>
        <Lock color={colors.primary} size={compact ? 22 : 28} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.blurb, { color: colors.textSecondary }]}>{blurb}</Text>
      <TouchableOpacity
        style={[styles.cta, { backgroundColor: colors.primary }]}
        onPress={() =>
          router.push({
            pathname: '/choose-subscription',
            params: { feature, reason: feature },
          })
        }
        activeOpacity={0.9}
      >
        <Sparkles color="white" size={18} />
        <Text style={styles.ctaText}>{t('premium.tryFreeTrial')}</Text>
      </TouchableOpacity>
    </View>
  );
}

type ScreenProps = Props & {
  /** Zobrazí tlačítko zpět (pro obrazovky bez nativního headeru). */
  showBack?: boolean;
};

/**
 * Celoobrazovkový gate pro celé screeny: free uživatel uvidí vycentrovaný zámek (s volitelným zpět),
 * premium uživatel obsah (children se u free vůbec nemountují).
 */
export function PremiumGateScreen({ showBack = true, children, ...rest }: ScreenProps) {
  const { t } = useLanguageStore();
  const { colors } = useTheme();
  const { isHouseholdPremium, isPremium, loading } = usePremium();
  const allowed = rest.requireOwnPremium ? isPremium : isHouseholdPremium;

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.textSecondary }}>{t('loading')}</Text>
      </SafeAreaView>
    );
  }

  if (allowed) return <>{children}</>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {showBack ? <ScreenHeader title="" skipTopInset /> : null}
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20 }}>
        <PremiumGate {...rest}>{null}</PremiumGate>
      </View>
    </SafeAreaView>
  );
}

/** Navigace na paywall (pro onPress handlerů). */
export function openPaywall(
  router: { push: (href: any) => void },
  feature?: PremiumFeatureId,
  extra?: Record<string, string | number>,
) {
  router.push({
    pathname: '/choose-subscription',
    params: {
      ...(feature ? { feature, reason: feature } : {}),
      ...(extra
        ? Object.fromEntries(
            Object.entries(extra).map(([k, v]) => [k, String(v)]),
          )
        : {}),
    },
  });
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    marginVertical: 8,
  },
  cardCompact: {
    padding: 16,
    marginVertical: 4,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  blurb: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 8,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  ctaText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});
