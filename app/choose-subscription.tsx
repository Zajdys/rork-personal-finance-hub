import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  CheckCircle,
  Star,
  RefreshCw,
} from 'lucide-react-native';
import { useRouter, Stack } from 'expo-router';
import { useSettingsStore } from '@/store/settings-store';
import { useAuth } from '@/store/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getOfferings, 
  purchasePackage, 
  restorePurchases,
  getCustomerInfo,
  hasPremiumAccess,
  loginUser,
} from '@/store/revenuecat-store';
import { PurchasesPackage } from 'react-native-purchases';

export default function ChooseSubscriptionScreen() {
  const { isDarkMode } = useSettingsStore();
  const { user, activateSubscription } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const offeringsQuery = useQuery({
    queryKey: ['rc-offerings'],
    queryFn: getOfferings,
  });

  useQuery({
    queryKey: ['rc-customer-info'],
    queryFn: getCustomerInfo,
  });

  const purchaseMutation = useMutation({
    mutationFn: purchasePackage,
    onSuccess: async (customerInfo) => {
      if (customerInfo && hasPremiumAccess(customerInfo)) {
        await activateSubscription('monthly');
        queryClient.invalidateQueries({ queryKey: ['rc-customer-info'] });
        Alert.alert(
          'Úspěch!',
          'Předplatné bylo aktivováno. Nyní máte přístup ke všem funkcím!',
          [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
        );
      }
    },
    onError: (error: any) => {
      console.error('[Paywall] Purchase error:', error);
      Alert.alert('Chyba', 'Nepodařilo se dokončit nákup. Zkuste to prosím znovu.');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restorePurchases,
    onSuccess: async (customerInfo) => {
      if (customerInfo && hasPremiumAccess(customerInfo)) {
        await activateSubscription('monthly');
        queryClient.invalidateQueries({ queryKey: ['rc-customer-info'] });
        Alert.alert(
          'Úspěch!',
          'Vaše předplatné bylo obnoveno!',
          [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
        );
      } else {
        Alert.alert('Info', 'Nebyla nalezena žádná předchozí předplatná.');
      }
    },
    onError: (error: any) => {
      console.error('[Paywall] Restore error:', error);
      Alert.alert('Chyba', 'Nepodařilo se obnovit nákupy.');
    },
  });

  React.useEffect(() => {
    if (user?.id) {
      loginUser(user.id);
    }
  }, [user?.id]);

  const packages = offeringsQuery.data?.current?.availablePackages ?? [];
  const isLoading = offeringsQuery.isLoading || purchaseMutation.isPending || restoreMutation.isPending;

  const handleSelectPackage = (pkg: PurchasesPackage) => {
    Alert.alert(
      'Potvrdit předplatné',
      `Chcete aktivovat ${pkg.product.title}?`,
      [
        { text: 'Zrušit', style: 'cancel' },
        { text: 'Potvrdit', onPress: () => purchaseMutation.mutate(pkg) },
      ]
    );
  };

  const getPackageDetails = (pkg: PurchasesPackage) => {
    const isAnnual = pkg.packageType === 'ANNUAL' || pkg.identifier.includes('annual') || pkg.identifier.includes('yearly');
    return {
      isAnnual,
      popular: isAnnual,
      badge: isAnnual ? 'Nejlepší hodnota' : null,
      badgeColor: '#F59E0B',
    };
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
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
          {offeringsQuery.isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#667eea" />
              <Text style={[styles.loadingText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                Načítání nabídek...
              </Text>
            </View>
          ) : packages.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
              <Text style={[styles.emptyText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                Momentálně nejsou dostupné žádné nabídky.
              </Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => offeringsQuery.refetch()}
              >
                <RefreshCw color="#667eea" size={20} />
                <Text style={styles.retryText}>Zkusit znovu</Text>
              </TouchableOpacity>
            </View>
          ) : (
            packages.map((pkg) => {
              const details = getPackageDetails(pkg);
              
              return (
                <View
                  key={pkg.identifier}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: isDarkMode ? '#1F2937' : 'white',
                      borderColor: details.popular ? '#667eea' : 'transparent',
                    },
                  ]}
                >
                  {details.badge && (
                    <View style={[styles.badge, { backgroundColor: details.badgeColor }]}>
                      <Star color="white" size={14} fill="white" />
                      <Text style={styles.badgeText}>{details.badge}</Text>
                    </View>
                  )}

                  <View style={styles.planHeader}>
                    <Text style={[styles.planName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                      {pkg.product.title}
                    </Text>
                    <View style={styles.priceContainer}>
                      <Text style={[styles.price, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                        {pkg.product.priceString}
                      </Text>
                      <Text style={[styles.period, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                        /{details.isAnnual ? 'rok' : 'měsíc'}
                      </Text>
                    </View>
                  </View>

                  {pkg.product.description && (
                    <Text style={[styles.description, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>
                      {pkg.product.description}
                    </Text>
                  )}

                  <View style={styles.features}>
                    {['Všechny funkce', 'AI asistent', 'Prioritní podpora', 'Neomezené transakce'].map((feature, index) => (
                      <View key={index} style={styles.feature}>
                        <CheckCircle color="#10B981" size={16} />
                        <Text style={[styles.featureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                          {feature}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[styles.selectButton, details.popular && styles.popularButton]}
                    onPress={() => handleSelectPackage(pkg)}
                    disabled={isLoading}
                  >
                    <LinearGradient
                      colors={details.popular ? ['#667eea', '#764ba2'] : ['#10B981', '#059669']}
                      style={styles.selectButtonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      {purchaseMutation.isPending ? (
                        <ActivityIndicator color="white" size="small" />
                      ) : (
                        <Text style={styles.selectButtonText}>Vybrat plán</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              );
            })
          )}

          <TouchableOpacity
            style={[styles.restoreButton, { borderColor: isDarkMode ? '#374151' : '#E5E7EB' }]}
            onPress={() => restoreMutation.mutate()}
            disabled={isLoading}
          >
            {restoreMutation.isPending ? (
              <ActivityIndicator color="#667eea" size="small" />
            ) : (
              <>
                <RefreshCw color="#667eea" size={18} />
                <Text style={[styles.restoreText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Obnovit předchozí nákupy
                </Text>
              </>
            )}
          </TouchableOpacity>

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
    fontWeight: 'bold' as const,
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
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  emptyCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retryText: {
    color: '#667eea',
    fontSize: 16,
    fontWeight: '600' as const,
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
    fontWeight: 'bold' as const,
    color: 'white',
  },
  planHeader: {
    marginBottom: 12,
  },
  planName: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 36,
    fontWeight: 'bold' as const,
    color: '#1F2937',
  },
  period: {
    fontSize: 16,
    color: '#6B7280',
    marginLeft: 4,
  },
  description: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
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
    fontWeight: 'bold' as const,
    color: 'white',
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  restoreText: {
    fontSize: 15,
    fontWeight: '500' as const,
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
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginBottom: 8,
  },
  guaranteeText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
});
