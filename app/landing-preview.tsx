import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
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
  ArrowLeft,
} from 'lucide-react-native';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

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

export default function LandingPreviewScreen() {
  const { isDarkMode } = useSettingsStore();
  const { t } = useLanguageStore();
  const router = useRouter();

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
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      {/* Back Button */}
      <SafeAreaView edges={['top']} style={styles.backButtonContainer}>
        <TouchableOpacity 
          style={[styles.backButton, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
          onPress={() => router.back()}
        >
          <ArrowLeft color={isDarkMode ? 'white' : '#1F2937'} size={24} />
          <Text style={[styles.backButtonText, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            Zpět do aplikace
          </Text>
        </TouchableOpacity>
      </SafeAreaView>

      <ScrollView 
        style={styles.scrollView}
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
                Váš osobní finanční asistent s umělou inteligencí
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
                onPress={() => router.push('/subscription')}
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
                  Možnost připojit se na Discord komunitu
                </Text>
              </View>
              
              <View style={styles.benefitItem}>
                <CheckCircle color="#10B981" size={20} />
                <Text style={[styles.benefitText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  14denní záruka vrácení peněz
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
                onPress={() => router.push('/subscription')}
              >
                <Text style={styles.ctaSecondaryButtonText}>Zobrazit plány</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  backButtonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  scrollView: {
    flex: 1,
  },
  hero: {
    paddingTop: 100,
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
});