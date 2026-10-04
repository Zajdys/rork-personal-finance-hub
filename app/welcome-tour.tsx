/**
 * Krátký uvítací tour — vizuál ve stylu landing page (fialový glow, tmavé pozadí).
 */
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useNavigation, useRouter } from 'expo-router';
import {
  CreditCard,
  Home,
  Landmark,
  PiggyBank,
  Smartphone,
  TrendingUp,
  UsersRound,
  Wallet,
} from 'lucide-react-native';
import { useLanguageStore } from '@/store/language-store';
import { useAuth } from '@/store/auth-store';
import BrandLogo from '@/components/BrandLogo';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const BG = '#0a0a0a';
const PURPLE = '#7C3AED';
const PURPLE_DEEP = '#4C1D95';
const PURPLE_SOFT = '#8B5CF6';

type TourSlide = {
  key: string;
  kind: 'intro' | 'features' | 'split' | 'cta';
};

/** Soft glow disc — concentric fades so edges never look sharp through cards. */
function SoftOrb({
  size,
  color,
  style,
}: {
  size: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  const layers = [
    { scale: 1, opacity: 0.1 },
    { scale: 0.78, opacity: 0.16 },
    { scale: 0.55, opacity: 0.22 },
    { scale: 0.32, opacity: 0.28 },
  ];
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {layers.map((layer) => {
        const d = size * layer.scale;
        return (
          <View
            key={layer.scale}
            style={{
              position: 'absolute',
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: color,
              opacity: layer.opacity,
            }}
          />
        );
      })}
    </View>
  );
}

function TourBackdrop() {
  return (
    <View style={styles.backdrop} pointerEvents="none">
      <LinearGradient
        colors={[PURPLE_DEEP, BG, BG]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.orbsLayer}>
        <SoftOrb
          size={SCREEN_W * 1.15}
          color={PURPLE}
          style={{ top: SCREEN_H * 0.02, left: SCREEN_W * -0.08 }}
        />
        <SoftOrb
          size={SCREEN_W * 0.85}
          color={PURPLE_DEEP}
          style={{ bottom: SCREEN_H * 0.1, right: -SCREEN_W * 0.25 }}
        />
        <SoftOrb
          size={SCREEN_W * 0.55}
          color={PURPLE_SOFT}
          style={{ top: SCREEN_H * 0.36, left: -SCREEN_W * 0.18 }}
        />
        {/* Bez fullscreen BlurView — na iOS vytvářel duchový odlesk footer textu pod headerem */}
      </View>
      <PiggyBank color="#fff" size={28} style={[styles.decoIcon, { top: '12%', left: '8%', opacity: 0.1 }]} />
      <TrendingUp color="#fff" size={24} style={[styles.decoIcon, { top: '18%', right: '10%', opacity: 0.12 }]} />
      <Home color="#fff" size={22} style={[styles.decoIcon, { top: '42%', left: '5%', opacity: 0.09 }]} />
      <Wallet color="#fff" size={26} style={[styles.decoIcon, { top: '48%', right: '6%', opacity: 0.11 }]} />
      <CreditCard color="#fff" size={24} style={[styles.decoIcon, { top: '68%', left: '12%', opacity: 0.1 }]} />
      <UsersRound color="#fff" size={22} style={[styles.decoIcon, { top: '72%', right: '14%', opacity: 0.09 }]} />
      <Landmark color="#fff" size={20} style={[styles.decoIcon, { top: '32%', left: '42%', opacity: 0.08 }]} />
      <PiggyBank color="#fff" size={18} style={[styles.decoIcon, { top: '58%', left: '48%', opacity: 0.08 }]} />
    </View>
  );
}

function HeroGlowIcon({
  children,
  size = 112,
}: {
  children: React.ReactNode;
  size?: number;
}) {
  return (
    <View style={styles.heroGlowWrap}>
      <View style={[styles.heroGlowOuter, { width: size + 48, height: size + 48, borderRadius: (size + 48) / 2 }]} />
      <View style={[styles.heroGlowMid, { width: size + 20, height: size + 20, borderRadius: (size + 20) / 2 }]} />
      <LinearGradient
        colors={[PURPLE_SOFT, PURPLE_DEEP]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroIconCore, { width: size, height: size, borderRadius: size / 2 }]}
      >
        {children}
      </LinearGradient>
    </View>
  );
}

function FeatureReveal({
  visible,
  children,
  delay = 0,
  style,
}: {
  visible: boolean;
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const hasPlayed = useRef(visible);

  React.useEffect(() => {
    if (!visible) return;
    if (hasPlayed.current) {
      anim.setValue(1);
      return;
    }
    hasPlayed.current = true;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 420,
      delay,
      useNativeDriver: true,
    }).start();
  }, [visible, delay, anim]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            {
              scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }),
            },
            {
              translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function FeatureListCard({
  title,
  body,
  icon: Icon,
  iconColor,
  cardStyle,
  iconStyle,
  bodyLines = 2,
}: {
  title: string;
  body: string;
  icon: React.ComponentType<{ color: string; size: number }>;
  iconColor: string;
  cardStyle: object;
  iconStyle: object;
  bodyLines?: number;
}) {
  return (
    <View style={[styles.featureCard, cardStyle]}>
      <View style={[styles.featureIcon, iconStyle]}>
        <Icon color={iconColor} size={20} />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.featureBody} numberOfLines={bodyLines}>
          {body}
        </Text>
      </View>
    </View>
  );
}

function SplitPreviewCard({
  t,
}: {
  t: (key: any, params?: Record<string, string | number>) => string;
}) {
  const rows = [
    { who: t('welcomeTourSplitDemoDebt1Who'), amount: t('welcomeTourSplitDemoDebt1Amount') },
    { who: t('welcomeTourSplitDemoDebt2Who'), amount: t('welcomeTourSplitDemoDebt2Amount') },
  ];
  return (
    <View style={styles.splitPreview}>
      <LinearGradient
        colors={['rgba(124,58,237,0.4)', 'rgba(76,29,149,0.22)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.splitPreviewInner}
      >
        <View style={styles.splitPreviewHeader}>
          <Text style={styles.splitPreviewTitle}>{t('welcomeTourSplitDemoTitle')}</Text>
          <Text style={styles.splitPreviewTotal}>{t('welcomeTourSplitDemoTotal')}</Text>
        </View>
        {rows.map((row) => (
          <View key={row.who} style={styles.splitDebtRow}>
            <Text style={styles.splitDebtLabel}>{row.who}</Text>
            <Text style={styles.splitDebtAmount}>{row.amount}</Text>
          </View>
        ))}
      </LinearGradient>
    </View>
  );
}

export default function WelcomeTourScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguageStore();
  const navigation = useNavigation();
  const router = useRouter();
  const { completeWelcomeTour } = useAuth();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const slideOpacity = useRef(new Animated.Value(1)).current;
  const transitioning = useRef(false);

  const slides: TourSlide[] = useMemo(
    () => [
      { key: 'intro', kind: 'intro' },
      { key: 'features', kind: 'features' },
      { key: 'split', kind: 'split' },
      { key: 'cta', kind: 'cta' },
    ],
    [],
  );

  const finishAndGo = useCallback(
    async (href: '/(tabs)' | '/(tabs)/add' | '/bank-import') => {
      if (busy) return;
      setBusy(true);
      try {
        await completeWelcomeTour();
        router.replace(href);
      } finally {
        setBusy(false);
      }
    },
    [busy, completeWelcomeTour, router],
  );

  const goNext = useCallback(() => {
    if (transitioning.current || index >= slides.length - 1) return;
    transitioning.current = true;
    Animated.timing(slideOpacity, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        transitioning.current = false;
        return;
      }
      setIndex((i) => i + 1);
      Animated.timing(slideOpacity, {
        toValue: 1,
        duration: 240,
        useNativeDriver: true,
      }).start(() => {
        transitioning.current = false;
      });
    });
  }, [index, slideOpacity, slides.length]);

  const featureListItems = useMemo(
    () => [
      {
        key: 'household' as const,
        title: t('welcomeTourGridHouseholdTitle'),
        body: t('welcomeTourHousehold'),
        icon: Home,
        iconColor: '#E9D5FF',
        cardStyle: styles.featureCardHousehold,
        iconStyle: styles.featureIconHousehold,
        delay: 30,
      },
      {
        key: 'invest' as const,
        title: t('welcomeTourGridInvestTitle'),
        body: t('welcomeTourInvestments'),
        icon: TrendingUp,
        iconColor: '#99F6E4',
        cardStyle: styles.featureCardInvest,
        iconStyle: styles.featureIconInvest,
        delay: 70,
      },
      {
        key: 'save' as const,
        title: t('welcomeTourGridSaveTitle'),
        body: t('welcomeTourSave'),
        icon: PiggyBank,
        iconColor: '#FBCFE8',
        cardStyle: styles.featureCardSave,
        iconStyle: styles.featureIconSave,
        delay: 110,
      },
      {
        key: 'import' as const,
        title: t('welcomeTourGridImportTitle'),
        body: t('welcomeTourImport'),
        icon: Landmark,
        iconColor: '#BBF7D0',
        cardStyle: styles.featureCardImport,
        iconStyle: styles.featureIconImport,
        delay: 150,
      },
    ],
    [t],
  );

  const renderSlide = useCallback(
    (item: TourSlide) => {
      if (item.kind === 'intro') {
        return (
          <View style={styles.slide}>
            <View style={styles.slideCenter}>
              <HeroGlowIcon>
                <PiggyBank color="white" size={52} />
              </HeroGlowIcon>
              <Text style={styles.title}>{t('welcomeTourTitle')}</Text>
              <Text style={styles.body}>{t('welcomeTourIntro')}</Text>
              <Text style={styles.tipLine}>{t('welcomeTourTip')}</Text>
              <View style={styles.chipRow}>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{t('welcomeTourChipHousehold')}</Text>
                </View>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{t('welcomeTourChipInvest')}</Text>
                </View>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{t('welcomeTourChipSplit')}</Text>
                </View>
              </View>
            </View>
          </View>
        );
      }

      if (item.kind === 'features') {
        return (
          <View style={styles.slide}>
            <View style={styles.featuresSlideCenter}>
              <Text style={[styles.title, styles.featuresTitle]}>{t('welcomeTourFeaturesTitle')}</Text>
              <View style={styles.featureList}>
                {featureListItems.map((feat) => (
                  <FeatureReveal key={feat.key} visible delay={feat.delay}>
                    <FeatureListCard
                      title={feat.title}
                      body={feat.body}
                      icon={feat.icon}
                      iconColor={feat.iconColor}
                      cardStyle={feat.cardStyle}
                      iconStyle={feat.iconStyle}
                    />
                  </FeatureReveal>
                ))}
              </View>
            </View>
          </View>
        );
      }

      if (item.kind === 'split') {
        return (
          <View style={styles.slide}>
            <View style={styles.slideCenter}>
              <HeroGlowIcon size={96}>
                <UsersRound color="white" size={44} />
              </HeroGlowIcon>
              <Text style={styles.title}>{t('splitGroups')}</Text>
              <Text style={styles.body}>{t('welcomeTourSplit')}</Text>
              <SplitPreviewCard t={t} />
            </View>
          </View>
        );
      }

      return (
        <View style={styles.slide}>
          <View style={styles.slideCenter}>
            <HeroGlowIcon size={88}>
              <Smartphone color="white" size={40} />
            </HeroGlowIcon>
            <Text style={styles.title}>{t('welcomeTourCtaTitle')}</Text>
            <Text style={styles.body}>{t('welcomeTourCtaBody')}</Text>
            <View style={styles.ctaRow}>
              <TouchableOpacity
                style={[styles.ctaBtnHalf, styles.ctaPrimary]}
                onPress={() => void finishAndGo('/(tabs)/add')}
                disabled={busy}
                activeOpacity={0.9}
              >
                <PiggyBank color="white" size={22} />
                <Text style={[styles.ctaBtnText, { color: 'white' }]}>
                  {t('welcomeTourAddTransaction')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ctaBtnHalf, styles.ctaSecondary]}
                onPress={() => void finishAndGo('/bank-import')}
                disabled={busy}
                activeOpacity={0.9}
              >
                <Landmark color="#E9D5FF" size={22} />
                <Text style={[styles.ctaBtnText, { color: '#E9D5FF' }]}>
                  {t('welcomeTourConnectBank')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    },
    [busy, finishAndGo, featureListItems, t],
  );

  const isLast = index === slides.length - 1;
  const footerPad = insets.bottom + 16;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
      title: '',
      headerTitle: '',
      header: () => null,
    });
  }, [navigation]);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          title: '',
          headerTitle: '',
          header: () => null,
        }}
      />
      <View style={[styles.root, { backgroundColor: BG }]}>
        <TourBackdrop />

        <View style={styles.mainColumn}>
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <BrandLogo theme="dark" size={28} />
            {!isLast ? (
              <TouchableOpacity
                onPress={() => void finishAndGo('/(tabs)')}
                hitSlop={12}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t('welcomeTourSkip')}
              >
                <Text style={styles.skip}>{t('welcomeTourSkip')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.skipPlaceholder} />
            )}
          </View>

          <Animated.View style={[styles.slideHost, { opacity: slideOpacity }]}>
            <React.Fragment key={slides[index].key}>{renderSlide(slides[index])}</React.Fragment>
          </Animated.View>

          <View style={[styles.footer, { paddingBottom: footerPad }]}>
            <View style={styles.dots}>
              {slides.map((s, i) => (
                <View
                  key={s.key}
                  style={[styles.dot, i === index ? styles.dotActive : styles.dotIdle]}
                />
              ))}
            </View>

            {!isLast ? (
              <TouchableOpacity style={styles.nextBtnSolid} onPress={goNext} activeOpacity={0.9}>
                <Text style={styles.nextBtnText}>{t('next')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.nextBtnMuted}
                onPress={() => void finishAndGo('/(tabs)')}
                disabled={busy}
                activeOpacity={0.9}
              >
                <Text style={styles.nextBtnMutedText}>{t('welcomeTourGoOverview')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  mainColumn: {
    flex: 1,
    zIndex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  orbsLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  slideHost: { flex: 1, zIndex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: BG,
    zIndex: 2,
  },
  skip: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 15,
    fontWeight: '600',
  },
  skipPlaceholder: {
    width: 72,
  },
  slide: {
    flex: 1,
    overflow: 'hidden',
    zIndex: 1,
  },
  slideCenter: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 24,
    zIndex: 2,
  },
  decoIcon: {
    position: 'absolute',
  },
  heroGlowWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  heroGlowOuter: {
    position: 'absolute',
    backgroundColor: PURPLE,
    opacity: 0.22,
  },
  heroGlowMid: {
    position: 'absolute',
    backgroundColor: PURPLE_SOFT,
    opacity: 0.35,
  },
  heroIconCore: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 24,
    elevation: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    color: 'white',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.72)',
    marginBottom: 10,
    maxWidth: 340,
  },
  tipLine: {
    fontSize: 14,
    color: 'rgba(233,213,255,0.9)',
    textAlign: 'center',
    marginBottom: 22,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  chipText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '600',
  },
  featuresTitle: {
    marginBottom: 12,
    fontSize: 26,
  },
  featuresSlideCenter: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  featureList: {
    width: SCREEN_W - 48,
    gap: 6,
    zIndex: 3,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: SCREEN_W - 48,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 3,
    elevation: 8,
  },
  featureCardHousehold: {
    backgroundColor: 'rgba(48, 24, 86, 0.98)',
    borderColor: 'rgba(167,139,250,0.45)',
  },
  featureCardInvest: {
    backgroundColor: 'rgba(14, 72, 68, 0.98)',
    borderColor: 'rgba(45,212,191,0.55)',
  },
  featureCardSave: {
    backgroundColor: 'rgba(58, 20, 48, 0.98)',
    borderColor: 'rgba(244,114,182,0.45)',
  },
  featureCardImport: {
    backgroundColor: 'rgba(16, 48, 28, 0.98)',
    borderColor: 'rgba(74,222,128,0.45)',
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureIconHousehold: {
    backgroundColor: 'rgba(139,92,246,0.45)',
  },
  featureIconInvest: {
    backgroundColor: 'rgba(20,184,166,0.55)',
  },
  featureIconSave: {
    backgroundColor: 'rgba(236,72,153,0.42)',
  },
  featureIconImport: {
    backgroundColor: 'rgba(34,197,94,0.42)',
  },
  featureText: { flex: 1, minWidth: 0 },
  featureTitle: { fontSize: 14, fontWeight: '700', marginBottom: 1, color: 'white' },
  featureBody: { fontSize: 12, lineHeight: 14, color: 'rgba(255,255,255,0.72)' },
  splitPreview: {
    width: SCREEN_W - 56,
    marginTop: 22,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.4)',
    zIndex: 3,
  },
  splitPreviewInner: {
    padding: 18,
  },
  splitPreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 14,
  },
  splitPreviewTitle: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
  },
  splitPreviewTotal: {
    color: '#E9D5FF',
    fontSize: 16,
    fontWeight: '800',
  },
  splitDebtRow: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  splitDebtLabel: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  splitDebtAmount: {
    color: '#E9D5FF',
    fontSize: 15,
    fontWeight: '800',
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
    width: SCREEN_W - 56,
  },
  ctaBtnHalf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    paddingHorizontal: 10,
    borderRadius: 16,
    minHeight: 108,
  },
  ctaPrimary: {
    backgroundColor: PURPLE,
  },
  ctaSecondary: {
    backgroundColor: 'rgba(124,58,237,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(167,139,250,0.55)',
  },
  ctaBtnText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: BG,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  dot: {
    borderRadius: 999,
  },
  dotIdle: {
    width: 10,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  dotActive: {
    width: 28,
    height: 10,
    backgroundColor: PURPLE_SOFT,
  },
  nextBtnSolid: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: PURPLE,
  },
  nextBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  nextBtnMuted: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  nextBtnMutedText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
  },
});
