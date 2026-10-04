import React, { useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Image,
  Linking,
  PixelRatio,
  type ImageSourcePropType,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowRight,
  BarChart3,
  CheckCircle,
  FileText,
  Home,
  Target,
  type LucideIcon,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useLanguageStore } from '@/store/language-store';
import BrandLogo from '@/components/BrandLogo';
import { TERMS_OF_USE_URL } from '@/constants/legal-urls';

const { width } = Dimensions.get('window');

const PAGE_BG = '#0a0a0a';
/** Left inset of the horizontal gallery. */
const GALLERY_SIDE_PADDING = 20;
/** Gap between screenshot tiles. */
const GALLERY_GAP = 12;
/** Peek of the next tile — max 10 % of screen width. */
const GALLERY_PEEK = Math.round(width * 0.1);
/** Full screenshot visible; only a thin strip of the next item peeks. */
const GALLERY_CARD_WIDTH = width - GALLERY_SIDE_PADDING - GALLERY_PEEK;
const GALLERY_CARD_HEIGHT = Math.round(GALLERY_CARD_WIDTH * (19.5 / 9));
const GALLERY_SNAP = GALLERY_CARD_WIDTH + GALLERY_GAP;

interface Feature {
  id: string;
  Icon: LucideIcon;
  title: string;
  description: string;
  gradient: [string, string];
}

interface GalleryItem {
  id: string;
  label: string;
  source: ImageSourcePropType;
}

/** Renders a screenshot at most at its natural (pixel / PixelRatio) size — never upscales. */
function GalleryScreenshot({
  source,
  label,
}: {
  source: ImageSourcePropType;
  label: string;
}) {
  const [natural, setNatural] = React.useState<{ w: number; h: number } | null>(() => {
    const resolved = Image.resolveAssetSource(source);
    if (!resolved?.width || !resolved?.height) return null;
    return { w: resolved.width, h: resolved.height };
  });

  React.useEffect(() => {
    const resolved = Image.resolveAssetSource(source);
    if (!resolved?.uri) return;
    let cancelled = false;
    Image.getSize(
      resolved.uri,
      (pw, ph) => {
        if (cancelled || pw <= 0 || ph <= 0) return;
        const ratio = PixelRatio.get();
        setNatural({ w: pw / ratio, h: ph / ratio });
      },
      () => {
        // keep resolveAssetSource fallback
      },
    );
    return () => {
      cancelled = true;
    };
  }, [source]);

  const naturalW = natural?.w ?? GALLERY_CARD_WIDTH;
  const naturalH = natural?.h ?? GALLERY_CARD_HEIGHT;
  // Never enlarge past natural size (upscaling → soft/blurry result).
  const fit = Math.min(1, GALLERY_CARD_WIDTH / naturalW, GALLERY_CARD_HEIGHT / naturalH);
  const displayW = Math.round(naturalW * fit);
  const displayH = Math.round(naturalH * fit);

  return (
    <View style={styles.galleryImageFrame}>
      <Image
        source={source}
        style={{ width: displayW, height: displayH }}
        resizeMode="contain"
        accessibilityLabel={label}
      />
    </View>
  );
}

export default function LandingScreen() {
  const router = useRouter();
  const { t } = useLanguageStore();
  const scrollRef = useRef<ScrollView>(null);
  const featuresOffsetY = useRef(0);

  const features = useMemo<Feature[]>(
    () => [
      {
        id: 'import',
        Icon: FileText,
        title: t('landingFeatureImport'),
        description: t('landingFeatureImportDesc'),
        gradient: ['#10B981', '#059669'],
      },
      {
        id: 'reports',
        Icon: BarChart3,
        title: t('landingFeatureReports'),
        description: t('landingFeatureReportsDesc'),
        gradient: ['#F59E0B', '#D97706'],
      },
      {
        id: 'household',
        Icon: Home,
        title: t('landingFeatureHousehold'),
        description: t('landingFeatureHouseholdDesc'),
        gradient: ['#8B5CF6', '#7C3AED'],
      },
      {
        id: 'goals',
        Icon: Target,
        title: t('landingFeatureGoals'),
        description: t('landingFeatureGoalsDesc'),
        gradient: ['#EC4899', '#DB2777'],
      },
    ],
    [t],
  );

  // TODO: doplnit screenshot Rozdělení výdajů → assets/images/landing/rozdeleni.png (+ @2x/@3x)
  const galleryItems = useMemo<GalleryItem[]>(
    () => [
      {
        id: 'overview',
        label: t('landingGalleryOverview'),
        source: require('@/assets/images/landing/prehled.png'),
      },
      {
        id: 'household',
        label: t('landingGalleryHousehold'),
        source: require('@/assets/images/landing/domacnost.png'),
      },
      {
        id: 'investments',
        label: t('landingGalleryInvestments'),
        source: require('@/assets/images/landing/investice.png'),
      },
    ],
    [t],
  );

  const scrollToFeatures = () => {
    scrollRef.current?.scrollTo({ y: featuresOffsetY.current, animated: true });
  };

  const FeatureCard = ({ feature }: { feature: Feature }) => {
    const Icon = feature.Icon;
    return (
      <LinearGradient
        colors={feature.gradient}
        style={styles.featureCard}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.featureIconWrap}>
          <Icon color="#FFFFFF" size={28} strokeWidth={2.2} />
        </View>
        <Text style={styles.featureTitle}>{feature.title}</Text>
        <Text style={styles.featureDescription}>{feature.description}</Text>
      </LinearGradient>
    );
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.heroContent}>
          <View style={styles.heroHeader}>
            <BrandLogo theme="dark" size={44} />
            <Text style={styles.heroSubtitle}>{t('landingHeroSubtitle')}</Text>
            <Text style={styles.heroDescription}>{t('landingHeroDescription')}</Text>
            <View style={styles.betaBadge}>
              <Text style={styles.betaBadgeText}>{t('landingBetaBadge')}</Text>
            </View>
          </View>

          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/auth')}>
              <View style={styles.primaryButtonContent}>
                <Text style={styles.primaryButtonText}>{t('landingGetStarted')}</Text>
                <ArrowRight color="#667eea" size={20} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={scrollToFeatures}>
              <Text style={styles.secondaryButtonText}>{t('landingLearnMore')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <View
        style={styles.featuresSection}
        onLayout={(e) => {
          featuresOffsetY.current = e.nativeEvent.layout.y;
        }}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('landingFeaturesTitle')}</Text>
          <Text style={styles.sectionSubtitle}>{t('landingSectionSubtitle')}</Text>
        </View>

        <View style={styles.featuresGrid}>
          {features.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </View>
      </View>

      <View style={styles.gallerySection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('landingGalleryTitle')}</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.galleryScroll}
          decelerationRate="fast"
          snapToInterval={GALLERY_SNAP}
          snapToAlignment="start"
          disableIntervalMomentum
        >
          {galleryItems.map((item) => (
            <View key={item.id} style={styles.galleryCard}>
              <GalleryScreenshot source={item.source} label={item.label} />
              <Text style={styles.galleryLabel}>{item.label}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.securitySection}>
        <View style={styles.securityCard}>
          <View style={styles.securityFeature}>
            <CheckCircle color="#10B981" size={18} />
            <View style={styles.securityTextWrap}>
              <Text style={styles.securityText}>{t('landingSecurityTitle')}</Text>
              <Text style={styles.securityText}>{t('landingSecurityBody')}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.ctaSection}>
        <View style={styles.ctaContainer}>
          <Text style={styles.ctaTitle}>{t('landingCtaTitle')}</Text>
          <Text style={styles.ctaSubtitle}>{t('landingCtaSubtitle')}</Text>

          <View style={styles.ctaActions}>
            <TouchableOpacity style={styles.ctaPrimaryButton} onPress={() => router.push('/auth')}>
              <Text style={styles.ctaPrimaryButtonText}>{t('landingGetStarted')}</Text>
              <ArrowRight color="#667eea" size={20} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.ctaSecondaryButton}
              onPress={() => router.push('/redeem-code')}
            >
              <Text style={styles.ctaSecondaryButtonText}>{t('auth.haveCode')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.legalRow}>
            <TouchableOpacity
              onPress={() => router.push('/privacy-policy')}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={styles.legalLink}>{t('privacyPolicyGdpr')}</Text>
            </TouchableOpacity>
            <Text style={styles.legalSeparator}> · </Text>
            <TouchableOpacity
              onPress={() => void Linking.openURL(TERMS_OF_USE_URL)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={styles.legalLink}>{t('termsOfUse')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  hero: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  heroContent: {
    alignItems: 'center',
  },
  heroHeader: {
    alignItems: 'center',
    marginBottom: 32,
    gap: 16,
  },
  heroSubtitle: {
    fontSize: 20,
    color: 'white',
    opacity: 0.9,
    textAlign: 'center',
    marginBottom: 16,
  },
  heroDescription: {
    fontSize: 16,
    color: 'white',
    opacity: 0.85,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  betaBadge: {
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  betaBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  heroActions: {
    gap: 12,
    width: '100%',
    maxWidth: 280,
  },
  primaryButton: {
    backgroundColor: 'white',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#667eea',
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
  },
  featuresSection: {
    paddingHorizontal: 20,
    paddingVertical: 40,
    backgroundColor: PAGE_BG,
  },
  sectionHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.55)',
    textAlign: 'center',
    maxWidth: 300,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'center',
  },
  featureCard: {
    width: (width - 54) / 2,
    borderRadius: 20,
    padding: 20,
    minHeight: 168,
    overflow: 'hidden',
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  featureDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.78)',
    lineHeight: 18,
  },
  gallerySection: {
    paddingBottom: 32,
    backgroundColor: PAGE_BG,
  },
  galleryScroll: {
    paddingLeft: GALLERY_SIDE_PADDING,
    paddingRight: GALLERY_PEEK,
    gap: GALLERY_GAP,
  },
  galleryCard: {
    width: GALLERY_CARD_WIDTH,
  },
  galleryImageFrame: {
    width: GALLERY_CARD_WIDTH,
    height: GALLERY_CARD_HEIGHT,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: '#161616',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  galleryLabel: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  securitySection: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    backgroundColor: PAGE_BG,
  },
  securityCard: {
    backgroundColor: '#161616',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  securityFeature: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  securityTextWrap: {
    flex: 1,
    gap: 4,
  },
  securityText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.75)',
    lineHeight: 20,
  },
  ctaSection: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    backgroundColor: PAGE_BG,
  },
  ctaContainer: {
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  ctaTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  ctaSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.65)',
    textAlign: 'center',
    marginBottom: 28,
    maxWidth: 300,
    lineHeight: 22,
  },
  ctaActions: {
    gap: 12,
    width: '100%',
    maxWidth: 280,
  },
  ctaPrimaryButton: {
    backgroundColor: 'white',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaPrimaryButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#667eea',
  },
  ctaSecondaryButton: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  ctaSecondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
  },
  legalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 8,
  },
  legalLink: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.45)',
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.35)',
  },
});
