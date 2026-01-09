import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  CheckCircle,
  Sparkles,
  Star,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSettingsStore } from '@/store/settings-store';
import { useAuth } from '@/store/auth-store';

const SUBSCRIPTION_PLANS = [
  {
    id: 'monthly',
    name: 'Měsíční',
    price: 199,
    period: 'měsíc',
    savings: null,
    features: [
      'Všechny funkce',
      'AI asistent',
      'Prioritní podpora',
      'Neomezené transakce',
    ],
    popular: false,
  },
  {
    id: 'quarterly',
    name: '3 měsíce',
    price: 399,
    period: '3 měsíce',
    savings: 198,
    pricePerMonth: 133,
    features: [
      'Všechny funkce',
      'AI asistent',
      'Prioritní podpora',
      'Neomezené transakce',
      '133 Kč/měsíc',
    ],
    popular: true,
    badge: 'Nejoblíbenější',
    badgeColor: '#667eea',
  },
  {
    id: 'yearly',
    name: 'Roční',
    price: 1299,
    period: 'rok',
    savings: 1089,
    pricePerMonth: 108,
    features: [
      'Všechny funkce',
      'AI asistent',
      'Prioritní podpora',
      'Neomezené transakce',
      '108 Kč/měsíc',
      '45% sleva',
    ],
    popular: false,
    badge: 'Nejlepší hodnota',
    badgeColor: '#F59E0B',
  },
];

function getOnboardingPendingKey(userIdOrEmail: string | undefined | null): string {
  const raw = String(userIdOrEmail ?? '').trim().toLowerCase();
  if (!raw) return 'onboarding_pending';
  return `onboarding_pending:${raw}`;
}

export default function ChooseSubscriptionScreen() {
  const { isDarkMode } = useSettingsStore();
  const { user, activateSubscription } = useAuth();
  const router = useRouter();

  const handleSelectPlan = (planId: string) => {
    Alert.alert('Potvrdit předplatné', `Chcete aktivovat předplatné?`, [
      {
        text: 'Zrušit',
        style: 'cancel',
      },
      {
        text: 'Potvrdit',
        onPress: async () => {
          try {
            console.log('[choose-subscription] activating plan', { planId, userId: user?.id, userEmail: user?.email });
            await activateSubscription(planId as 'monthly' | 'quarterly' | 'yearly');
            Alert.alert('Úspěch!', 'Předplatné bylo aktivováno. Nyní máte přístup ke všem funkcím!', [
              {
                text: 'OK',
                onPress: () => router.replace('/'),
              },
            ]);
          } catch (e) {
            console.error('[choose-subscription] activate failed', e);
            Alert.alert('Chyba', 'Nepodařilo se aktivovat předplatné. Zkuste to prosím znovu.');
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={async () => {
              try {
                const pendingKey = getOnboardingPendingKey(user?.id ?? user?.email);
                const pending = (await AsyncStorage.getItem(pendingKey)) === 'true';

                console.log('[choose-subscription] back pressed', {
                  pendingKey,
                  pending,
                  userId: user?.id,
                  userEmail: user?.email,
                });

                if (pending) {
                  router.replace('/onboarding');
                  return;
                }

                router.replace('/');
              } catch (e) {
                console.error('[choose-subscription] back fallback failed', e);
                router.replace('/');
              }
            }}
          >
            <ArrowLeft color="white" size={24} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Vyberte předplatné</Text>
            <Text style={styles.headerSubtitle}>30denní záruka vrácení peněz</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {SUBSCRIPTION_PLANS.map((plan) => (
            <View
              key={plan.id}
              style={[
                styles.planCard,
                {
                  backgroundColor: isDarkMode ? '#1F2937' : 'white',
                  borderColor: plan.popular ? '#667eea' : 'transparent',
                },
              ]}
            >
              {plan.badge && (
                <View style={[styles.badge, { backgroundColor: plan.badgeColor }]}>
                  {plan.badge === 'Nejoblíbenější' ? (
                    <Sparkles color="white" size={14} />
                  ) : (
                    <Star color="white" size={14} fill="white" />
                  )}
                  <Text style={styles.badgeText}>{plan.badge}</Text>
                </View>
              )}

              <View style={styles.planHeader}>
                <Text style={[styles.planName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                  {plan.name}
                </Text>
                <View style={styles.priceContainer}>
                  <Text style={[styles.price, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                    {plan.price} Kč
                  </Text>
                  <Text style={[styles.period, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                    /{plan.period}
                  </Text>
                </View>
              </View>

              {plan.savings && (
                <View style={styles.savingsBadge}>
                  <Text style={[styles.savingsText, { color: isDarkMode ? '#34D399' : '#10B981' }]}>
                    Ušetříte {plan.savings} Kč
                  </Text>
                </View>
              )}

              <View style={styles.features}>
                {plan.features.map((feature, index) => (
                  <View key={index} style={styles.feature}>
                    <CheckCircle color="#10B981" size={16} />
                    <Text style={[styles.featureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                      {feature}
                    </Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.selectButton,
                  plan.popular && styles.popularButton,
                ]}
                onPress={() => handleSelectPlan(plan.id)}
              >
                <LinearGradient
                  colors={plan.popular ? ['#667eea', '#764ba2'] : ['#10B981', '#059669']}
                  style={styles.selectButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={styles.selectButtonText}>Vybrat plán</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ))}

          <View style={[styles.guaranteeCard, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
            <Text style={[styles.guaranteeTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              30denní záruka vrácení peněz
            </Text>
            <Text style={[styles.guaranteeText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Pokud nebudete spokojeni, vrátíme vám peníze do 30 dnů bez ptaní.
            </Text>
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
    fontWeight: 'bold',
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
    fontWeight: 'bold',
    color: 'white',
  },
  planHeader: {
    marginBottom: 12,
  },
  planName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  period: {
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
  features: {
    gap: 12,
    marginBottom: 20,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 15,
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
    fontWeight: 'bold',
    color: 'white',
  },
  guaranteeCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  guaranteeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  guaranteeText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
});
