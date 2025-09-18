import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,

  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CreditCard,
  Crown,
  Check,
  Star,
  Zap,
  Shield,

  ExternalLink,
} from 'lucide-react-native';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useRouter } from 'expo-router';

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  period: string;
  features: string[];
  popular?: boolean;
  color: string[];
}

const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'basic',
    name: 'Základní',
    price: 99,
    period: 'měsíc',
    features: [
      'Sledování příjmů a výdajů',
      'Základní kategorie',
      'Měsíční reporty',
      'Mobilní aplikace',
    ],
    color: ['#6B7280', '#4B5563'],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 199,
    period: 'měsíc',
    popular: true,
    features: [
      'Vše ze Základního',
      'AI finanční asistent',
      'Pokročilé analýzy',
      'Investiční tracking',
      'Vlastní kategorie',
      'Export dat',
      'Prioritní podpora',
    ],
    color: ['#667eea', '#764ba2'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 299,
    period: 'měsíc',
    features: [
      'Vše z Premium',
      'Pokročilé investiční nástroje',
      'Daňové optimalizace',
      'Rodinné účty',
      'API přístup',
      'Osobní konzultace',
    ],
    color: ['#F59E0B', '#D97706'],
  },
];

export default function SubscriptionScreen() {
  const [selectedPlan, setSelectedPlan] = useState<string>('premium');
  const [loading, setLoading] = useState<boolean>(false);
  const [userSubscription, setUserSubscription] = useState<{
    plan: string;
    active: boolean;
    expiresAt: Date;
  } | null>({
    plan: 'premium',
    active: true,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
  });
  
  const { isDarkMode } = useSettingsStore();
  const { t } = useLanguageStore();
  const router = useRouter();

  const handleSubscribe = async (planId: string) => {
    setLoading(true);
    
    try {
      // Simulace Stripe platby
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
      Alert.alert(
        'Úspěch!', 
        `Předplatné ${plan?.name} bylo aktivováno. Děkujeme!`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
      
      setUserSubscription({
        plan: planId,
        active: true,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    } catch (error) {
      Alert.alert('Chyba', 'Nepodařilo se zpracovat platbu. Zkuste to prosím znovu.');
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = () => {
    // Simulace přesměrování na Stripe Customer Portal
    Alert.alert(
      'Správa předplatného',
      'Budete přesměrováni na bezpečný portál pro správu vašeho předplatného.',
      [
        { text: 'Zrušit', style: 'cancel' },
        { text: 'Pokračovat', onPress: () => {
          // V reálné aplikaci by zde bylo otevření webového prohlížeče
          Alert.alert('Info', 'Tato funkce bude dostupná v plné verzi aplikace.');
        }}
      ]
    );
  };

  const PlanCard = ({ plan }: { plan: SubscriptionPlan }) => {
    const isSelected = selectedPlan === plan.id;
    const isCurrentPlan = userSubscription?.plan === plan.id && userSubscription?.active;
    
    return (
      <TouchableOpacity
        style={[
          styles.planCard,
          { backgroundColor: isDarkMode ? '#374151' : 'white' },
          isSelected && styles.planCardSelected,
          plan.popular && styles.planCardPopular,
        ]}
        onPress={() => setSelectedPlan(plan.id)}
        disabled={isCurrentPlan}
      >
        {plan.popular && (
          <View style={styles.popularBadge}>
            <LinearGradient
              colors={['#F59E0B', '#D97706']}
              style={styles.popularGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Star color="white" size={12} fill="white" />
              <Text style={styles.popularText}>Nejoblíbenější</Text>
            </LinearGradient>
          </View>
        )}
        
        {isCurrentPlan && (
          <View style={styles.currentBadge}>
            <Check color="#10B981" size={16} />
            <Text style={styles.currentText}>Aktivní</Text>
          </View>
        )}

        <View style={styles.planHeader}>
          <Text style={[styles.planName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {plan.name}
          </Text>
          <View style={styles.priceContainer}>
            <Text style={[styles.planPrice, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {plan.price} Kč
            </Text>
            <Text style={[styles.planPeriod, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
              /{plan.period}
            </Text>
          </View>
        </View>

        <View style={styles.featuresContainer}>
          {plan.features.map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <Check color="#10B981" size={16} />
              <Text style={[styles.featureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                {feature}
              </Text>
            </View>
          ))}
        </View>

        {!isCurrentPlan && (
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => handleSubscribe(plan.id)}
            disabled={loading}
          >
            <LinearGradient
              colors={isSelected ? (plan.color as any) : (['#F3F4F6', '#E5E7EB'] as any)}
              style={styles.selectGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={[
                styles.selectText,
                { color: isSelected ? 'white' : (isDarkMode ? '#6B7280' : '#6B7280') }
              ]}>
                {loading && selectedPlan === plan.id ? 'Zpracování...' : 'Vybrat plán'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerContent}>
            <View style={styles.logoContainer}>
              <Crown color="white" size={32} />
            </View>
            <Text style={styles.headerTitle}>MoneyBuddy Premium</Text>
            <Text style={styles.headerSubtitle}>
              Odemkněte plný potenciál své finanční budoucnosti
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {/* Current Subscription Status */}
          {userSubscription && (
            <View style={[styles.statusContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <View style={styles.statusHeader}>
                <View style={styles.statusIcon}>
                  <CreditCard color="#667eea" size={24} />
                </View>
                <View style={styles.statusInfo}>
                  <Text style={[styles.statusTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                    Vaše předplatné
                  </Text>
                  <Text style={[styles.statusSubtitle, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                    {userSubscription.active ? 'Aktivní' : 'Neaktivní'} • {
                      SUBSCRIPTION_PLANS.find(p => p.id === userSubscription.plan)?.name
                    }
                  </Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  { backgroundColor: userSubscription.active ? '#10B981' : '#EF4444' }
                ]}>
                  <Text style={styles.statusBadgeText}>
                    {userSubscription.active ? 'Aktivní' : 'Neaktivní'}
                  </Text>
                </View>
              </View>
              
              {userSubscription.active && (
                <View style={styles.statusDetails}>
                  <Text style={[styles.statusDetailText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                    Platné do: {userSubscription.expiresAt.toLocaleDateString('cs-CZ')}
                  </Text>
                  
                  <TouchableOpacity 
                    style={styles.manageButton}
                    onPress={handleManageSubscription}
                  >
                    <Text style={styles.manageButtonText}>Spravovat předplatné</Text>
                    <ExternalLink color="#667eea" size={16} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Benefits Section */}
          <View style={styles.benefitsContainer}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Proč si vybrat Premium?
            </Text>
            
            <View style={styles.benefitsList}>
              <View style={styles.benefitItem}>
                <View style={[styles.benefitIcon, { backgroundColor: '#EFF6FF' }]}>
                  <Zap color="#3B82F6" size={20} />
                </View>
                <View style={styles.benefitContent}>
                  <Text style={[styles.benefitTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                    AI Finanční Asistent
                  </Text>
                  <Text style={[styles.benefitDescription, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                    Personalizované rady a analýzy založené na vašich finančních datech
                  </Text>
                </View>
              </View>
              
              <View style={styles.benefitItem}>
                <View style={[styles.benefitIcon, { backgroundColor: '#F0FDF4' }]}>
                  <Shield color="#10B981" size={20} />
                </View>
                <View style={styles.benefitContent}>
                  <Text style={[styles.benefitTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                    Pokročilá Bezpečnost
                  </Text>
                  <Text style={[styles.benefitDescription, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                    Šifrování dat na bankovní úrovni a pravidelné bezpečnostní audity
                  </Text>
                </View>
              </View>
              
              <View style={styles.benefitItem}>
                <View style={[styles.benefitIcon, { backgroundColor: '#FEF3C7' }]}>
                  <Star color="#F59E0B" size={20} />
                </View>
                <View style={styles.benefitContent}>
                  <Text style={[styles.benefitTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                    Prioritní Podpora
                  </Text>
                  <Text style={[styles.benefitDescription, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                    Rychlá odpověď na vaše dotazy a osobní konzultace
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Subscription Plans */}
          <View style={styles.plansContainer}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Vyberte si plán
            </Text>
            
            <View style={styles.plansList}>
              {SUBSCRIPTION_PLANS.map((plan) => (
                <PlanCard key={plan.id} plan={plan} />
              ))}
            </View>
          </View>

          {/* Money Back Guarantee */}
          <View style={[styles.guaranteeContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
            <View style={styles.guaranteeContent}>
              <Shield color="#10B981" size={24} />
              <View style={styles.guaranteeText}>
                <Text style={[styles.guaranteeTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  30denní záruka vrácení peněz
                </Text>
                <Text style={[styles.guaranteeDescription, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Pokud nebudete spokojeni, vrátíme vám peníze bez otázek
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  headerContent: {
    alignItems: 'center',
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  statusContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    marginTop: -20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  statusSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#10B981',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  statusDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  statusDetailText: {
    fontSize: 14,
    color: '#6B7280',
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  manageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#667eea',
  },
  benefitsContainer: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 20,
  },
  benefitsList: {
    gap: 16,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  benefitDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  plansContainer: {
    marginBottom: 32,
  },
  plansList: {
    gap: 16,
  },
  planCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    position: 'relative',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  planCardSelected: {
    borderColor: '#667eea',
    transform: [{ scale: 1.02 }],
  },
  planCardPopular: {
    borderColor: '#F59E0B',
  },
  popularBadge: {
    position: 'absolute',
    top: -8,
    left: 20,
    right: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  popularGradient: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  popularText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  currentBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  currentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  planHeader: {
    marginBottom: 20,
    marginTop: 8,
  },
  planName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  planPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  planPeriod: {
    fontSize: 16,
    color: '#6B7280',
  },
  featuresContainer: {
    gap: 12,
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 16,
    color: '#6B7280',
    flex: 1,
  },
  selectButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  selectGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectText: {
    fontSize: 16,
    fontWeight: '600',
  },
  guaranteeContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  guaranteeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  guaranteeText: {
    flex: 1,
  },
  guaranteeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  guaranteeDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
});