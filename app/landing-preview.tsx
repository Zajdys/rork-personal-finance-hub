import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Shield,
  Star,
  ArrowRight,
  CheckCircle,
  X,
  Users,
  Repeat,
  LayoutGrid,
  FileText,
  Wallet,
} from 'lucide-react-native';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import BrandLogo from '@/components/BrandLogo';

const { width } = Dimensions.get('window');

interface Feature {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ color: string; size: number }>;
  color: string;
}

export default function LandingPreviewScreen() {
  const { isDarkMode } = useSettingsStore();
  const { t } = useLanguageStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [plansModalVisible, setPlansModalVisible] = useState(false);

  const features = useMemo<Feature[]>(
    () => [
      {
        id: 'income-expense',
        title: t('previewTrackIncome'),
        description: t('previewTrackIncomeDesc'),
        icon: Wallet,
        color: '#3B82F6',
      },
      {
        id: 'household',
        title: t('previewSharedHousehold'),
        description: t('previewSharedHouseholdDesc'),
        icon: Users,
        color: '#10B981',
      },
      {
        id: 'recurring',
        title: t('previewRecurring'),
        description: t('previewRecurringDesc'),
        icon: Repeat,
        color: '#8B5CF6',
      },
      {
        id: 'categories',
        title: t('previewCategories'),
        description: t('previewCategoriesDesc'),
        icon: LayoutGrid,
        color: '#F59E0B',
      },
      {
        id: 'import',
        title: t('previewBankImport'),
        description: t('previewBankImportDesc'),
        icon: FileText,
        color: '#06B6D4',
      },
    ],
    [t],
  );

  const honestTaglines = useMemo(
    () => [
      { id: 't1', line: t('previewTrust1') },
      { id: 't2', line: t('previewTrust2') },
      { id: 't3', line: t('previewTrust3') },
    ],
    [t],
  );

  const testimonials = useMemo(
    () => [
      {
        id: '1',
        name: 'Jana Nováková',
        role: 'Freelancer',
        text: t('previewTestimonial1'),
        rating: 5,
      },
      {
        id: '2',
        name: 'Petr Svoboda',
        role: 'IT Manager',
        text: t('previewTestimonial2'),
        rating: 5,
      },
      {
        id: '3',
        name: 'Marie Dvořáková',
        role: t('onboardingSelfEmployed'),
        text: t('previewTestimonial3'),
        rating: 5,
      },
    ],
    [t],
  );

  const plans = useMemo(
    () => [
      {
        id: 'monthly',
        name: t('previewPlanMonthly'),
        priceLine: t('previewPlanMonthlyPrice'),
        saving: null as string | null,
      },
      {
        id: 'quarterly',
        name: t('previewPlanQuarterly'),
        priceLine: t('previewPlanQuarterlyPrice'),
        saving: t('previewPlanQuarterlySaving'),
      },
      {
        id: 'yearly',
        name: t('previewPlanYearly'),
        priceLine: t('previewPlanYearlyPrice'),
        saving: t('previewPlanYearlySaving'),
      },
    ],
    [t],
  );

  const planFeatures = useMemo(
    () => [
      t('previewPlanFeature1'),
      t('previewPlanFeature2'),
      t('previewPlanFeature3'),
      t('previewPlanFeature4'),
      t('previewPlanFeature5'),
      t('previewPlanFeature6'),
    ],
    [t],
  );

  const openPlans = useCallback(() => setPlansModalVisible(true), []);
  const closePlans = useCallback(() => setPlansModalVisible(false), []);

  const goRegister = useCallback(() => {
    router.push('/register');
  }, [router]);

  const topBarHeight = insets.top + 52;
  const cardBg = isDarkMode ? '#374151' : 'white';
  const textMain = isDarkMode ? 'white' : '#1F2937';
  const textMuted = isDarkMode ? '#D1D5DB' : '#6B7280';

  const FeatureCard = ({ feature }: { feature: Feature }) => {
    const Icon = feature.icon;

    return (
      <View style={[styles.featureCard, { backgroundColor: cardBg }]}>
        <View style={[styles.featureIcon, { backgroundColor: feature.color + '20' }]}>
          <Icon color={feature.color} size={24} />
        </View>
        <Text style={[styles.featureTitle, { color: textMain }]}>{feature.title}</Text>
        <Text style={[styles.featureDescription, { color: textMuted }]}>{feature.description}</Text>
      </View>
    );
  };

  const TestimonialCard = ({ testimonial }: { testimonial: (typeof testimonials)[0] }) => (
    <View style={[styles.testimonialCard, { backgroundColor: cardBg }]}>
      <View style={styles.testimonialHeader}>
        <View style={styles.testimonialInfo}>
          <Text style={[styles.testimonialName, { color: textMain }]}>{testimonial.name}</Text>
          <Text style={[styles.testimonialRole, { color: textMuted }]}>{testimonial.role}</Text>
        </View>
        <View style={styles.testimonialRating}>
          {Array.from({ length: testimonial.rating }).map((_, index) => (
            <Star key={index} color="#F59E0B" size={16} fill="#F59E0B" />
          ))}
        </View>
      </View>
      <Text style={[styles.testimonialText, { color: textMuted }]}>{`"${testimonial.text}"`}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      {/* Fixed top bar — back button, does not scroll with content */}
      <View style={[styles.topBar, { paddingTop: insets.top, height: topBarHeight }]} pointerEvents="box-none">
        <BackButton
          color={isDarkMode ? 'white' : '#1F2937'}
          size={22}
          style={[styles.backButton, { backgroundColor: isDarkMode ? 'rgba(55,65,81,0.95)' : 'rgba(255,255,255,0.95)' }]}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: topBarHeight }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.heroContent}>
            <View style={styles.heroHeader}>
              <BrandLogo theme="dark" size={44} />
              <Text style={styles.heroSubtitle}>{t('landingHeroDescription')}</Text>
              <Text style={styles.heroDescription}>{t('previewTrackIncomeDesc')}</Text>
            </View>

            <View style={styles.heroActions}>
              <TouchableOpacity style={styles.primaryButton} onPress={goRegister} activeOpacity={0.9}>
                <View style={styles.primaryButtonContent}>
                  <Text style={styles.primaryButtonText}>{t('landingGetStarted')}</Text>
                  <ArrowRight color="#667eea" size={20} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryButton} onPress={openPlans} activeOpacity={0.85}>
                <Text style={styles.secondaryButtonText}>{t('previewChoosePlan')}</Text>
              </TouchableOpacity>
            </View>

            {/* Honest taglines (no fake user / money stats) */}
            <View style={styles.taglinesRow}>
              {honestTaglines.map((item) => (
                <View key={item.id} style={styles.taglineItem}>
                  <Text style={styles.taglineText}>{item.line}</Text>
                </View>
              ))}
            </View>
          </View>
        </LinearGradient>

        {/* Features Section */}
        <View style={styles.featuresSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: textMain }]}>{t('landingFeaturesTitle')}</Text>
            <Text style={[styles.sectionSubtitle, { color: textMuted }]}>
              {t('previewTrackIncomeDesc')}
            </Text>
          </View>

          <View style={styles.featuresGrid}>
            {features.map((feature) => (
              <FeatureCard key={feature.id} feature={feature} />
            ))}
          </View>
        </View>

        {/* Benefits Section */}
        <View style={styles.benefitsSection}>
          <LinearGradient
            colors={isDarkMode ? ['#374151', '#4B5563'] : ['#F8FAFC', '#E2E8F0']}
            style={styles.benefitsContainer}
          >
            <Text style={[styles.sectionTitle, { color: textMain }]}>{t('account.subscription')}</Text>

            <View style={styles.benefitsList}>
              {planFeatures.map((line, idx) => (
                <View key={idx} style={styles.benefitItem}>
                  <CheckCircle color="#10B981" size={20} />
                  <Text style={[styles.benefitText, { color: textMuted }]}>{line}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </View>

        {/* Testimonials Section */}
        <View style={styles.testimonialsSection}>
          <Text style={[styles.sectionTitle, { color: textMain, paddingHorizontal: 20 }]}>
            Co říkají naši uživatelé
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.testimonialsContainer}
          >
            {testimonials.map((testimonial) => (
              <TestimonialCard key={testimonial.id} testimonial={testimonial} />
            ))}
          </ScrollView>
        </View>

        {/* Security Section */}
        <View style={styles.securitySection}>
          <View style={[styles.securityCard, { backgroundColor: cardBg }]}>
            <View style={styles.securityIcon}>
              <Shield color="#10B981" size={32} />
            </View>
            <View style={styles.securityContent}>
              <Text style={[styles.securityTitle, { color: textMain }]}>{t('privacyProtectData')}</Text>
              <Text style={[styles.securityDescription, { color: textMuted }]}>
                {t('previewTrust2')}
              </Text>
              <View style={styles.securityFeatures}>
                <View style={styles.securityFeature}>
                  <CheckCircle color="#10B981" size={16} />
                  <Text style={[styles.securityFeatureText, { color: textMuted }]}>{t('previewTrust2')}</Text>
                </View>
                <View style={styles.securityFeature}>
                  <CheckCircle color="#10B981" size={16} />
                  <Text style={[styles.securityFeatureText, { color: textMuted }]}>GDPR compliance</Text>
                </View>
                <View style={styles.securityFeature}>
                  <CheckCircle color="#10B981" size={16} />
                  <Text style={[styles.securityFeatureText, { color: textMuted }]}>{t('previewTrust3')}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* CTA Section */}
        <View style={styles.ctaSection}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.ctaContainer}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.ctaTitle}>{t('previewChoosePlan')}</Text>
            <Text style={styles.ctaSubtitle}>{t('landingHeroDescription')}</Text>

            <View style={styles.ctaActions}>
              <TouchableOpacity style={styles.ctaPrimaryButton} onPress={goRegister} activeOpacity={0.9}>
                <Text style={styles.ctaPrimaryButtonText}>{t('landingGetStarted')}</Text>
                <ArrowRight color="#667eea" size={20} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.ctaSecondaryButton} onPress={openPlans} activeOpacity={0.85}>
                <Text style={styles.ctaSecondaryButtonText}>{t('previewChoosePlan')}</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </ScrollView>

      {/* Pricing modal */}
      <Modal
        visible={plansModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closePlans}
      >
        <Pressable style={styles.modalBackdrop} onPress={closePlans}>
          <Pressable style={styles.modalCardWrap} onPress={(e) => e.stopPropagation()}>
            <SafeAreaView style={styles.modalSafe} edges={['bottom']}>
              <View style={[styles.modalCard, { backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF' }]}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: textMain }]}>{t('account.subscription')}</Text>
                  <TouchableOpacity onPress={closePlans} hitSlop={12} accessibilityLabel={t('close')}>
                    <X color={textMuted} size={24} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.modalIntro, { color: textMuted }]}>{t('previewChoosePlan')}</Text>

                {plans.map((plan) => (
                  <View
                    key={plan.id}
                    style={[styles.planRow, { borderColor: isDarkMode ? '#374151' : '#E5E7EB' }]}
                  >
                    <View style={styles.planRowText}>
                      <Text style={[styles.planName, { color: textMain }]}>{plan.name}</Text>
                      <Text style={[styles.planPrice, { color: textMuted }]}>{plan.priceLine}</Text>
                      {plan.saving ? (
                        <Text style={styles.planSaving}>{plan.saving}</Text>
                      ) : null}
                    </View>
                    <TouchableOpacity style={styles.planSelectBtn} activeOpacity={0.85} onPress={() => {}}>
                      <Text style={styles.planSelectBtnText}>{t('chooseSubscription.selectPlan')}</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <Text style={[styles.trialNote, { color: textMuted }]}>{t('previewStartTrial')}</Text>

                <TouchableOpacity style={styles.modalCloseFooter} onPress={closePlans}>
                  <Text style={[styles.modalCloseFooterText, { color: textMuted }]}>{t('close')}</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: 16,
    justifyContent: 'flex-end',
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  hero: {
    paddingTop: 24,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  heroContent: {
    alignItems: 'center',
  },
  heroHeader: {
    alignItems: 'center',
    marginBottom: 28,
    gap: 16,
  },
  heroSubtitle: {
    fontSize: 18,
    color: 'white',
    opacity: 0.95,
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  heroDescription: {
    fontSize: 15,
    color: 'white',
    opacity: 0.88,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 340,
  },
  heroActions: {
    gap: 12,
    marginBottom: 28,
    width: '100%',
    maxWidth: 300,
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
    borderColor: 'rgba(255, 255, 255, 0.35)',
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
  taglinesRow: {
    width: '100%',
    maxWidth: 340,
    gap: 10,
  },
  taglineItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  taglineText: {
    fontSize: 14,
    color: 'white',
    opacity: 0.95,
    textAlign: 'center',
    fontWeight: '500',
  },
  featuresSection: {
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  sectionHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: 16,
    color: '#6B7280',
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
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  featureIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 6,
    textAlign: 'center',
  },
  featureDescription: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 17,
  },
  benefitsSection: {
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  benefitsContainer: {
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
  },
  benefitsList: {
    gap: 14,
    marginTop: 20,
    width: '100%',
    maxWidth: 340,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  benefitText: {
    fontSize: 15,
    color: '#6B7280',
    flex: 1,
    lineHeight: 22,
  },
  testimonialsSection: {
    paddingVertical: 32,
  },
  testimonialsContainer: {
    paddingHorizontal: 20,
    gap: 14,
  },
  testimonialCard: {
    width: 280,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  testimonialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  testimonialInfo: {
    flex: 1,
  },
  testimonialName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 2,
  },
  testimonialRole: {
    fontSize: 14,
    color: '#6B7280',
  },
  testimonialRating: {
    flexDirection: 'row',
    gap: 2,
  },
  testimonialText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  securitySection: {
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  securityCard: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 28,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  securityIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityContent: {
    flex: 1,
  },
  securityTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  securityDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 14,
  },
  securityFeatures: {
    gap: 8,
  },
  securityFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  securityFeatureText: {
    fontSize: 14,
    color: '#6B7280',
  },
  ctaSection: {
    paddingHorizontal: 20,
    paddingVertical: 40,
    paddingBottom: 48,
  },
  ctaContainer: {
    borderRadius: 24,
    padding: 36,
    alignItems: 'center',
  },
  ctaTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
    textAlign: 'center',
  },
  ctaSubtitle: {
    fontSize: 15,
    color: 'white',
    opacity: 0.92,
    textAlign: 'center',
    marginBottom: 28,
    maxWidth: 300,
    lineHeight: 22,
  },
  ctaActions: {
    gap: 12,
    width: '100%',
    maxWidth: 300,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  ctaPrimaryButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#667eea',
  },
  ctaSecondaryButton: {
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  ctaSecondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCardWrap: {
    maxHeight: '88%',
    width: '100%',
  },
  modalSafe: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  modalCard: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  modalIntro: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  planRowText: {
    flex: 1,
  },
  planName: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  planPrice: {
    fontSize: 15,
  },
  planSaving: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '600',
    marginTop: 4,
  },
  planSelectBtn: {
    backgroundColor: '#667eea',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  planSelectBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
  },
  trialNote: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  modalCloseFooter: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseFooterText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
