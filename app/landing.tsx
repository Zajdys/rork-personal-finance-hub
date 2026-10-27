import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FileText,
  Users,
  Home,
  PiggyBank,
  BarChart3,
  type LucideIcon,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useLanguageStore } from '@/store/language-store';
import BrandLogo from '@/components/BrandLogo';
import { TERMS_OF_USE_URL } from '@/constants/legal-urls';
import { useRegisterIntentStore } from '@/store/register-intent-store';

type FeatureBadge = 'free' | 'premium';

interface FeatureRow {
  id: string;
  Icon: LucideIcon;
  title: string;
  badge: FeatureBadge;
}

export default function LandingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguageStore();

  const features = useMemo<FeatureRow[]>(
    () => [
      {
        id: 'import',
        Icon: FileText,
        title: t('landingRowImport'),
        badge: 'free',
      },
      {
        id: 'split',
        Icon: Users,
        title: t('landingRowSplit'),
        badge: 'free',
      },
      {
        id: 'household',
        Icon: Home,
        title: t('landingRowHousehold'),
        badge: 'premium',
      },
      {
        id: 'save',
        Icon: PiggyBank,
        title: t('landingRowSave'),
        badge: 'premium',
      },
      {
        id: 'reports',
        Icon: BarChart3,
        title: t('landingRowSubs'),
        badge: 'premium',
      },
    ],
    [t],
  );

  return (
    <LinearGradient
      colors={['#667eea', '#764ba2']}
      style={styles.root}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View
        style={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 16) + 4,
            paddingBottom: Math.max(insets.bottom, 12) + 4,
          },
        ]}
      >
        <View style={styles.top}>
          <BrandLogo theme="dark" size={36} buddyColor="#E9E4FF" />
          <Text style={styles.headline}>{t('landingHeroSubtitle')}</Text>
          <Text style={styles.subhead}>{t('landingHeroDescription')}</Text>
        </View>

        <View style={styles.featureBlock}>
          <View style={styles.featureList}>
            {features.map((feature) => {
              const Icon = feature.Icon;
              const isFree = feature.badge === 'free';
              return (
                <View key={feature.id} style={styles.featureRow}>
                  <View style={styles.featureIconWrap}>
                    <Icon color="#FFFFFF" size={16} strokeWidth={2.2} />
                  </View>
                  <Text style={styles.featureTitle} numberOfLines={2}>
                    {feature.title}
                  </Text>
                  <View
                    style={[
                      styles.badge,
                      isFree ? styles.badgeFree : styles.badgePremium,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        isFree ? styles.badgeTextFree : styles.badgeTextPremium,
                      ]}
                    >
                      {isFree ? t('landingBadgeFree') : t('landingBadgePremium')}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={styles.andMore}>{t('landingAndMore')}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              useRegisterIntentStore.getState().clear();
              router.push('/auth?mode=register');
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryButtonText}>{t('landingGetStarted')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.trialButton}
            onPress={() => {
              useRegisterIntentStore.getState().setIntent('premium');
              router.push('/auth?mode=register&intent=premium');
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.trialButtonText}>{t('landingTryPremium')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              useRegisterIntentStore.getState().clear();
              router.push('/auth');
            }}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.secondaryText}>{t('landingHaveAccount')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.securityLine}>{t('landingSecurityLine')}</Text>
          <View style={styles.legalRow}>
            <TouchableOpacity
              onPress={() => router.push('/privacy-policy')}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={styles.legalLink}>{t('landingLegalPrivacy')}</Text>
            </TouchableOpacity>
            <Text style={styles.legalSeparator}> · </Text>
            <TouchableOpacity
              onPress={() => void Linking.openURL(TERMS_OF_USE_URL)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={styles.legalLink}>{t('landingLegalTerms')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  top: {
    alignItems: 'center',
    gap: 6,
  },
  headline: {
    marginTop: 0,
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 28,
    maxWidth: 340,
  },
  subhead: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.88)',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  featureBlock: {
    width: '100%',
    gap: 6,
  },
  featureList: {
    gap: 5,
    width: '100%',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  featureIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 18,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
  },
  badgeFree: {
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.55)',
  },
  badgePremium: {
    backgroundColor: 'rgba(139, 92, 246, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(196, 181, 253, 0.55)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  badgeTextFree: {
    color: '#A7F3D0',
  },
  badgeTextPremium: {
    color: '#DDD6FE',
  },
  andMore: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.65)',
    textAlign: 'center',
    lineHeight: 17,
  },
  actions: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#667eea',
  },
  trialButton: {
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    paddingVertical: 13,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  trialButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.92)',
    textDecorationLine: 'underline',
    marginTop: 2,
  },
  footer: {
    alignItems: 'center',
    gap: 4,
  },
  securityLine: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.72)',
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 320,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legalLink: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.55)',
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
  },
});
