import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  TrendingUp,
  Shield,
  Zap,
  Star,
  Users,
  Award,
  ArrowRight,
  CheckCircle,
  Smartphone,
  BarChart3,
  Brain,
  Target,
  X,
  Sparkles,
} from 'lucide-react-native';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');

interface Feature {
  id: string;
  title: string;
  description: string;
  icon: any;
  color: string;
}

const FEATURES: Feature[] = [
  {
    id: 'tracking',
    title: 'Sledování financí',
    description: 'Automatické kategorizování příjmů a výdajů s pokročilými analýzami',
    icon: BarChart3,
    color: '#3B82F6',
  },
  {
    id: 'ai',
    title: 'AI Asistent',
    description: 'Personalizované finanční rady založené na vašich datech',
    icon: Brain,
    color: '#8B5CF6',
  },
  {
    id: 'investments',
    title: 'Investiční tracking',
    description: 'Sledování portfolia a výkonnosti investic v reálném čase',
    icon: TrendingUp,
    color: '#10B981',
  },
  {
    id: 'goals',
    title: 'Finanční cíle',
    description: 'Nastavte si cíle a sledujte pokrok k finanční svobodě',
    icon: Target,
    color: '#F59E0B',
  },
];

const TESTIMONIALS = [
  {
    id: '1',
    name: 'Jana Nováková',
    role: 'Freelancer',
    text: 'MoneyBuddy mi pomohl získat kontrolu nad financemi. AI asistent je neuvěřitelně užitečný!',
    rating: 5,
  },
  {
    id: '2',
    name: 'Petr Svoboda',
    role: 'IT Manager',
    text: 'Konečně aplikace, která rozumí českému trhu. Investiční tracking je skvělý.',
    rating: 5,
  },
  {
    id: '3',
    name: 'Marie Dvořáková',
    role: 'Podnikatelka',
    text: 'Díky MoneyBuddy jsem za rok ušetřila 50 000 Kč. Doporučuji všem!',
    rating: 5,
  },
];

export default function LandingScreen() {
  const { isDarkMode } = useSettingsStore();
  const { t } = useLanguageStore();
  const router = useRouter();
  const [showPricingModal, setShowPricingModal] = useState(false);

  const FeatureCard = ({ feature }: { feature: Feature }) => {
    const Icon = feature.icon;
    
    return (
      <View style={[styles.featureCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
        <View style={[styles.featureIcon, { backgroundColor: feature.color + '20' }]}>
          <Icon color={feature.color} size={24} />
        </View>
        <Text style={[styles.featureTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
          {feature.title}
        </Text>
        <Text style={[styles.featureDescription, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
          {feature.description}
        </Text>
      </View>
    );
  };

  const TestimonialCard = ({ testimonial }: { testimonial: any }) => (
    <View style={[styles.testimonialCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
      <View style={styles.testimonialHeader}>
        <View style={styles.testimonialInfo}>
          <Text style={[styles.testimonialName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {testimonial.name}
          </Text>
          <Text style={[styles.testimonialRole, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
            {testimonial.role}
          </Text>
        </View>
        <View style={styles.testimonialRating}>
          {Array.from({ length: testimonial.rating }).map((_, index) => (
            <Star key={index} color="#F59E0B" size={16} fill="#F59E0B" />
          ))}
        </View>
      </View>
      <Text style={[styles.testimonialText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
        "{testimonial.text}"
      </Text>
    </View>
  );

  const StatCard = ({ number, label }: { number: string; label: string }) => (
    <View style={styles.statCard}>
      <Text style={styles.statNumber}>{number}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]} 
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
            <View style={styles.logoContainer}>
              <Smartphone color="white" size={32} />
            </View>
            <Text style={styles.heroTitle}>MoneyBuddy</Text>
            <Text style={styles.heroSubtitle}>
              Vaš osobní finanční asistent s umělou inteligencí
            </Text>
            <Text style={styles.heroDescription}>
              Získejte kontrolu nad svými financemi, investujte chytře a dosáhněte finanční svobody s pomocí AI.
            </Text>
          </View>

          <View style={styles.heroActions}>
            <TouchableOpacity 
              style={styles.primaryButton}
              onPress={() => router.push('/auth')}
            >
              <View style={styles.primaryButtonContent}>
                <Text style={styles.primaryButtonText}>Vyzkoušet zdarma</Text>
                <ArrowRight color="white" size={20} />
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.secondaryButton}
              onPress={() => setShowPricingModal(true)}
            >
              <Text style={styles.secondaryButtonText}>Zobrazit ceny</Text>
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={styles.heroStats}>
            <StatCard number="10K+" label="Aktivních uživatelů" />
            <StatCard number="50M+" label="Korun spravováno" />
            <StatCard number="4.9★" label="Hodnocení" />
          </View>
        </View>
      </LinearGradient>

      {/* Features Section */}
      <View style={styles.featuresSection}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            Proč si vybrat MoneyBuddy?
          </Text>
          <Text style={[styles.sectionSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
            Moderní nástroje pro správu vašich financí
          </Text>
        </View>

        <View style={styles.featuresGrid}>
          {FEATURES.map((feature) => (
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
          <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            Výhody předplatného
          </Text>
          
          <View style={styles.benefitsList}>
            <View style={styles.benefitItem}>
              <CheckCircle color="#10B981" size={20} />
              <Text style={[styles.benefitText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                Neomezené transakce a kategorie
              </Text>
            </View>
            
            <View style={styles.benefitItem}>
              <CheckCircle color="#10B981" size={20} />
              <Text style={[styles.benefitText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                AI finanční poradce dostupný 24/7
              </Text>
            </View>
            
            <View style={styles.benefitItem}>
              <CheckCircle color="#10B981" size={20} />
              <Text style={[styles.benefitText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                Pokročilé investiční analýzy
              </Text>
            </View>
            
            <View style={styles.benefitItem}>
              <CheckCircle color="#10B981" size={20} />
              <Text style={[styles.benefitText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                Export dat a daňové reporty
              </Text>
            </View>
            
            <View style={styles.benefitItem}>
              <CheckCircle color="#10B981" size={20} />
              <Text style={[styles.benefitText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                Prioritní zákaznická podpora
              </Text>
            </View>
            
            <View style={styles.benefitItem}>
              <CheckCircle color="#10B981" size={20} />
              <Text style={[styles.benefitText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                30denní záruka vrácení peněz
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Testimonials Section */}
      <View style={styles.testimonialsSection}>
        <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
          Co říkají naši uživatelé
        </Text>
        
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.testimonialsContainer}
        >
          {TESTIMONIALS.map((testimonial) => (
            <TestimonialCard key={testimonial.id} testimonial={testimonial} />
          ))}
        </ScrollView>
      </View>

      {/* Security Section */}
      <View style={styles.securitySection}>
        <View style={[styles.securityCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
          <View style={styles.securityIcon}>
            <Shield color="#10B981" size={32} />
          </View>
          <View style={styles.securityContent}>
            <Text style={[styles.securityTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Bezpečnost na prvním místě
            </Text>
            <Text style={[styles.securityDescription, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Vaše data jsou chráněna šifrováním na bankovní úrovni. Nikdy nesdílíme vaše osobní informace s třetími stranami.
            </Text>
            <View style={styles.securityFeatures}>
              <View style={styles.securityFeature}>
                <CheckCircle color="#10B981" size={16} />
                <Text style={[styles.securityFeatureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  256-bit SSL šifrování
                </Text>
              </View>
              <View style={styles.securityFeature}>
                <CheckCircle color="#10B981" size={16} />
                <Text style={[styles.securityFeatureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  GDPR compliance
                </Text>
              </View>
              <View style={styles.securityFeature}>
                <CheckCircle color="#10B981" size={16} />
                <Text style={[styles.securityFeatureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Pravidelné bezpečnostní audity
                </Text>
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
          <Text style={styles.ctaTitle}>Připraveni začít?</Text>
          <Text style={styles.ctaSubtitle}>
            Připojte se k tisícům uživatelů, kteří už kontrolují své finance s MoneyBuddy
          </Text>
          
          <View style={styles.ctaActions}>
            <TouchableOpacity 
              style={styles.ctaPrimaryButton}
              onPress={() => router.push('/auth')}
            >
              <Text style={styles.ctaPrimaryButtonText}>Začít zdarma</Text>
              <ArrowRight color="#667eea" size={20} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.ctaSecondaryButton}
              onPress={() => setShowPricingModal(true)}
            >
              <Text style={styles.ctaSecondaryButtonText}>Zobrazit plány</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>

      {/* Pricing Modal */}
      <Modal
        visible={showPricingModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPricingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={[styles.modalContent, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
              {/* Close Button */}
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowPricingModal(false)}
              >
                <X color={isDarkMode ? 'white' : '#1F2937'} size={24} />
              </TouchableOpacity>

              {/* Header */}
              <View style={styles.pricingHeader}>
                <Text style={[styles.pricingTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>Vyberte si předplatné</Text>
                <Text style={[styles.pricingSubtitle, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>30denní záruka vrácení peněz</Text>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={styles.pricingScroll}>
                {/* Monthly Plan */}
                <View style={[styles.pricingCard, { backgroundColor: isDarkMode ? '#374151' : '#F8FAFC' }]}>
                  <View style={styles.pricingCardHeader}>
                    <Text style={[styles.planName, { color: isDarkMode ? 'white' : '#1F2937' }]}>Měsíční</Text>
                  </View>
                  <View style={styles.priceContainer}>
                    <Text style={[styles.price, { color: isDarkMode ? 'white' : '#1F2937' }]}>199 Kč</Text>
                    <Text style={[styles.pricePeriod, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>/měsíc</Text>
                  </View>
                  <View style={styles.pricingFeatures}>
                    <View style={styles.pricingFeature}>
                      <CheckCircle color="#10B981" size={16} />
                      <Text style={[styles.pricingFeatureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Všechny funkce</Text>
                    </View>
                    <View style={styles.pricingFeature}>
                      <CheckCircle color="#10B981" size={16} />
                      <Text style={[styles.pricingFeatureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>AI asistent</Text>
                    </View>
                    <View style={styles.pricingFeature}>
                      <CheckCircle color="#10B981" size={16} />
                      <Text style={[styles.pricingFeatureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Prioritní podpora</Text>
                    </View>
                  </View>
                  <TouchableOpacity 
                    style={styles.pricingButton}
                    onPress={() => {
                      setShowPricingModal(false);
                      router.push('/subscription');
                    }}
                  >
                    <Text style={styles.pricingButtonText}>Vybrat plán</Text>
                  </TouchableOpacity>
                </View>

                {/* 3 Months Plan - Popular */}
                <View style={[styles.pricingCard, styles.popularCard, { backgroundColor: isDarkMode ? '#374151' : '#F8FAFC' }]}>
                  <View style={styles.popularBadge}>
                    <Sparkles color="white" size={14} />
                    <Text style={styles.popularBadgeText}>Nejoblíbenější</Text>
                  </View>
                  <View style={styles.pricingCardHeader}>
                    <Text style={[styles.planName, { color: isDarkMode ? 'white' : '#1F2937' }]}>3 měsíce</Text>
                  </View>
                  <View style={styles.priceContainer}>
                    <Text style={[styles.price, { color: isDarkMode ? 'white' : '#1F2937' }]}>399 Kč</Text>
                    <Text style={[styles.pricePeriod, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>/3 měsíce</Text>
                  </View>
                  <View style={styles.savingsBadge}>
                    <Text style={[styles.savingsText, { color: isDarkMode ? '#34D399' : '#10B981' }]}>Ušetříte 198 Kč</Text>
                  </View>
                  <View style={styles.pricingFeatures}>
                    <View style={styles.pricingFeature}>
                      <CheckCircle color="#10B981" size={16} />
                      <Text style={[styles.pricingFeatureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Všechny funkce</Text>
                    </View>
                    <View style={styles.pricingFeature}>
                      <CheckCircle color="#10B981" size={16} />
                      <Text style={[styles.pricingFeatureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>AI asistent</Text>
                    </View>
                    <View style={styles.pricingFeature}>
                      <CheckCircle color="#10B981" size={16} />
                      <Text style={[styles.pricingFeatureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Prioritní podpora</Text>
                    </View>
                    <View style={styles.pricingFeature}>
                      <CheckCircle color="#10B981" size={16} />
                      <Text style={[styles.pricingFeatureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>133 Kč/měsíc</Text>
                    </View>
                  </View>
                  <TouchableOpacity 
                    style={[styles.pricingButton, styles.popularButton]}
                    onPress={() => {
                      setShowPricingModal(false);
                      router.push('/subscription');
                    }}
                  >
                    <Text style={styles.pricingButtonText}>Vybrat plán</Text>
                  </TouchableOpacity>
                </View>

                {/* Yearly Plan - Best Value */}
                <View style={[styles.pricingCard, { backgroundColor: isDarkMode ? '#374151' : '#F8FAFC' }]}>
                  <View style={[styles.popularBadge, { backgroundColor: '#F59E0B' }]}>
                    <Star color="white" size={14} fill="white" />
                    <Text style={styles.popularBadgeText}>Nejlepší hodnota</Text>
                  </View>
                  <View style={styles.pricingCardHeader}>
                    <Text style={[styles.planName, { color: isDarkMode ? 'white' : '#1F2937' }]}>Roční</Text>
                  </View>
                  <View style={styles.priceContainer}>
                    <Text style={[styles.price, { color: isDarkMode ? 'white' : '#1F2937' }]}>1 299 Kč</Text>
                    <Text style={[styles.pricePeriod, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>/rok</Text>
                  </View>
                  <View style={styles.savingsBadge}>
                    <Text style={[styles.savingsText, { color: isDarkMode ? '#34D399' : '#10B981' }]}>Ušetříte 1 089 Kč</Text>
                  </View>
                  <View style={styles.pricingFeatures}>
                    <View style={styles.pricingFeature}>
                      <CheckCircle color="#10B981" size={16} />
                      <Text style={[styles.pricingFeatureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Všechny funkce</Text>
                    </View>
                    <View style={styles.pricingFeature}>
                      <CheckCircle color="#10B981" size={16} />
                      <Text style={[styles.pricingFeatureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>AI asistent</Text>
                    </View>
                    <View style={styles.pricingFeature}>
                      <CheckCircle color="#10B981" size={16} />
                      <Text style={[styles.pricingFeatureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Prioritní podpora</Text>
                    </View>
                    <View style={styles.pricingFeature}>
                      <CheckCircle color="#10B981" size={16} />
                      <Text style={[styles.pricingFeatureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>108 Kč/měsíc</Text>
                    </View>
                    <View style={styles.pricingFeature}>
                      <CheckCircle color="#10B981" size={16} />
                      <Text style={[styles.pricingFeatureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>45% sleva</Text>
                    </View>
                  </View>
                  <TouchableOpacity 
                    style={styles.pricingButton}
                    onPress={() => {
                      setShowPricingModal(false);
                      router.push('/subscription');
                    }}
                  >
                    <Text style={styles.pricingButtonText}>Vybrat plán</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 12,
    textAlign: 'center',
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
    opacity: 0.8,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  heroActions: {
    gap: 12,
    marginBottom: 40,
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
  heroStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    maxWidth: 320,
  },
  statCard: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: 'white',
    opacity: 0.8,
    textAlign: 'center',
  },
  featuresSection: {
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  sectionHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 280,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'center',
  },
  featureCard: {
    width: (width - 56) / 2,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  featureIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  featureDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  benefitsSection: {
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  benefitsContainer: {
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
  },
  benefitsList: {
    gap: 16,
    marginTop: 24,
    width: '100%',
    maxWidth: 320,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitText: {
    fontSize: 16,
    color: '#6B7280',
    flex: 1,
  },
  testimonialsSection: {
    paddingVertical: 40,
  },
  testimonialsContainer: {
    paddingHorizontal: 20,
    gap: 16,
  },
  testimonialCard: {
    width: 280,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  testimonialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
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
    paddingVertical: 40,
  },
  securityCard: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 32,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  securityIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityContent: {
    flex: 1,
  },
  securityTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  securityDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 16,
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
  },
  ctaContainer: {
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
  },
  ctaTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 12,
    textAlign: 'center',
  },
  ctaSubtitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
    textAlign: 'center',
    marginBottom: 32,
    maxWidth: 280,
    lineHeight: 24,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  ctaPrimaryButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#667eea',
  },
  ctaSecondaryButton: {
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    height: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  pricingHeader: {
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 8,
  },
  pricingTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  pricingSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  pricingScroll: {
    flex: 1,
  },
  pricingCard: {
    backgroundColor: '#F8FAFC',
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
  popularCard: {
    borderColor: '#667eea',
    shadowColor: '#667eea',
    shadowOpacity: 0.2,
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    backgroundColor: '#667eea',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  popularBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'white',
  },
  pricingCardHeader: {
    marginBottom: 12,
  },
  planName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  price: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  pricePeriod: {
    fontSize: 16,
    color: '#6B7280',
    marginLeft: 4,
  },
  savingsBadge: {
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  savingsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  pricingFeatures: {
    gap: 12,
    marginBottom: 20,
  },
  pricingFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pricingFeatureText: {
    fontSize: 15,
    color: '#6B7280',
  },
  pricingButton: {
    backgroundColor: '#667eea',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  popularButton: {
    backgroundColor: '#667eea',
  },
  pricingButtonText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: 'white',
  },
});