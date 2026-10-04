import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Sparkles,
  Home,
  Car,
  DollarSign,
  GraduationCap,
  CheckCircle,
  Building2,
  Percent,
  Calendar,
  CreditCard,
} from 'lucide-react-native';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { LoanType } from '@/store/finance-store';
import { getLoanTypeLabel } from '@/lib/loan-type-labels';
import { BackButton } from '@/components/BackButton';
import { parseDecimalInput, parseMoneyInput } from '@/lib/parse-money-input';

interface LoanOffer {
  provider: string;
  rate: number;
  monthlyPayment: number;
  totalCost: number;
  features: string[];
  rating: number;
  processingTime: string;
  minAmount?: number;
  maxAmount?: number;
}

interface LoanRecommendation {
  loanType: LoanType;
  amount: number;
  years: number;
  offers: LoanOffer[];
  bestOffer: LoanOffer;
  averageRate: number;
  insights: string[];
}

export default function LoanFinderScreen() {
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const { t } = useLanguageStore();
  const currentCurrency = getCurrentCurrency();

  const [loanType, setLoanType] = useState<LoanType>('mortgage');
  const [amount, setAmount] = useState<string>('');
  const [years, setYears] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [recommendation, setRecommendation] = useState<LoanRecommendation | null>(null);

  const loanTypes: { type: LoanType; label: string; icon: any; color: string }[] = [
    { type: 'mortgage', label: getLoanTypeLabel('mortgage'), icon: Home, color: '#8B5CF6' },
    { type: 'car', label: t('loanFinderTypeCar'), icon: Car, color: '#10B981' },
    { type: 'personal', label: t('loanFinderTypePersonalShort'), icon: DollarSign, color: '#F59E0B' },
    { type: 'student', label: t('loanFinderTypeStudentShort'), icon: GraduationCap, color: '#6366F1' },
  ];

  const getLoanOffers = (type: LoanType, loanAmount: number, loanYears: number): LoanOffer[] => {
    const monthlyRate = (rate: number) => rate / 100 / 12;
    const calculateMonthly = (rate: number) => {
      const r = monthlyRate(rate);
      const n = loanYears * 12;
      return (loanAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    };

    const offers: Record<LoanType, LoanOffer[]> = {
      mortgage: [
        {
          provider: 'Česká spořitelna',
          rate: 4.49,
          monthlyPayment: calculateMonthly(4.49),
          totalCost: calculateMonthly(4.49) * loanYears * 12,
          features: ['Fixace 3-10 let', 'Možnost předčasného splacení', 'Online správa'],
          rating: 4.5,
          processingTime: '7-14 dní',
          minAmount: 300000,
          maxAmount: 50000000,
        },
        {
          provider: 'Raiffeisenbank',
          rate: 4.59,
          monthlyPayment: calculateMonthly(4.59),
          totalCost: calculateMonthly(4.59) * loanYears * 12,
          features: ['Flexibilní fixace', 'Bez poplatku za vyřízení', 'Osobní bankéř'],
          rating: 4.6,
          processingTime: '5-10 dní',
          minAmount: 500000,
          maxAmount: 40000000,
        },
        {
          provider: 'ČSOB',
          rate: 4.69,
          monthlyPayment: calculateMonthly(4.69),
          totalCost: calculateMonthly(4.69) * loanYears * 12,
          features: ['Fixace až 15 let', 'Hypotéka bez dokládání příjmů', 'Mobilní aplikace'],
          rating: 4.4,
          processingTime: '10-14 dní',
          minAmount: 400000,
          maxAmount: 45000000,
        },
        {
          provider: 'Komerční banka',
          rate: 4.79,
          monthlyPayment: calculateMonthly(4.79),
          totalCost: calculateMonthly(4.79) * loanYears * 12,
          features: ['Individuální přístup', 'Možnost odkladu splátek', 'Prémiový program'],
          rating: 4.3,
          processingTime: '7-12 dní',
          minAmount: 300000,
          maxAmount: 60000000,
        },
        {
          provider: 'mBank',
          rate: 4.89,
          monthlyPayment: calculateMonthly(4.89),
          totalCost: calculateMonthly(4.89) * loanYears * 12,
          features: ['100% online proces', 'Rychlé schválení', 'Bez skrytých poplatků'],
          rating: 4.2,
          processingTime: '3-7 dní',
          minAmount: 500000,
          maxAmount: 35000000,
        },
      ],
      car: [
        {
          provider: 'Raiffeisenbank',
          rate: 5.99,
          monthlyPayment: calculateMonthly(5.99),
          totalCost: calculateMonthly(5.99) * loanYears * 12,
          features: ['Bez navýšení', 'Rychlé schválení', 'Flexibilní splácení'],
          rating: 4.7,
          processingTime: '1-3 dny',
          minAmount: 50000,
          maxAmount: 3000000,
        },
        {
          provider: 'ČSOB',
          rate: 6.49,
          monthlyPayment: calculateMonthly(6.49),
          totalCost: calculateMonthly(6.49) * loanYears * 12,
          features: ['Online žádost', 'Bez poplatků', 'Pojištění v ceně'],
          rating: 4.5,
          processingTime: '2-4 dny',
          minAmount: 100000,
          maxAmount: 2500000,
        },
        {
          provider: 'Česká spořitelna',
          rate: 6.79,
          monthlyPayment: calculateMonthly(6.79),
          totalCost: calculateMonthly(6.79) * loanYears * 12,
          features: ['Nízká akontace', 'Možnost odkladu', 'Prémiové služby'],
          rating: 4.4,
          processingTime: '2-5 dní',
          minAmount: 80000,
          maxAmount: 2000000,
        },
        {
          provider: 'UniCredit Bank',
          rate: 6.99,
          monthlyPayment: calculateMonthly(6.99),
          totalCost: calculateMonthly(6.99) * loanYears * 12,
          features: ['Individuální podmínky', 'Osobní přístup', 'Bonusy pro klienty'],
          rating: 4.3,
          processingTime: '3-5 dní',
          minAmount: 100000,
          maxAmount: 2500000,
        },
        {
          provider: 'Komerční banka',
          rate: 7.29,
          monthlyPayment: calculateMonthly(7.29),
          totalCost: calculateMonthly(7.29) * loanYears * 12,
          features: ['Prémiový program', 'Výhodné pojištění', 'Mobilní aplikace'],
          rating: 4.2,
          processingTime: '2-4 dny',
          minAmount: 50000,
          maxAmount: 3000000,
        },
      ],
      personal: [
        {
          provider: 'Air Bank',
          rate: 7.90,
          monthlyPayment: calculateMonthly(7.90),
          totalCost: calculateMonthly(7.90) * loanYears * 12,
          features: ['100% online', 'Bez poplatků', 'Okamžité schválení'],
          rating: 4.8,
          processingTime: '1-2 dny',
          minAmount: 20000,
          maxAmount: 1000000,
        },
        {
          provider: 'mBank',
          rate: 8.20,
          monthlyPayment: calculateMonthly(8.20),
          totalCost: calculateMonthly(8.20) * loanYears * 12,
          features: ['Rychlé vyřízení', 'Flexibilní splácení', 'Mobilní aplikace'],
          rating: 4.6,
          processingTime: '1-3 dny',
          minAmount: 30000,
          maxAmount: 800000,
        },
        {
          provider: 'Raiffeisenbank',
          rate: 8.49,
          monthlyPayment: calculateMonthly(8.49),
          totalCost: calculateMonthly(8.49) * loanYears * 12,
          features: ['Osobní bankéř', 'Individuální podmínky', 'Prémiové služby'],
          rating: 4.5,
          processingTime: '2-4 dny',
          minAmount: 50000,
          maxAmount: 1500000,
        },
        {
          provider: 'ČSOB',
          rate: 8.99,
          monthlyPayment: calculateMonthly(8.99),
          totalCost: calculateMonthly(8.99) * loanYears * 12,
          features: ['Bez dokládání příjmů', 'Online správa', 'Bonusový program'],
          rating: 4.4,
          processingTime: '2-5 dní',
          minAmount: 40000,
          maxAmount: 1200000,
        },
        {
          provider: 'Česká spořitelna',
          rate: 9.49,
          monthlyPayment: calculateMonthly(9.49),
          totalCost: calculateMonthly(9.49) * loanYears * 12,
          features: ['Tradiční banka', 'Široká síť poboček', 'Komplexní služby'],
          rating: 4.3,
          processingTime: '3-7 dní',
          minAmount: 30000,
          maxAmount: 1000000,
        },
      ],
      student: [
        {
          provider: 'ČSOB',
          rate: 3.49,
          monthlyPayment: calculateMonthly(3.49),
          totalCost: calculateMonthly(3.49) * loanYears * 12,
          features: ['Odklad splátek', 'Nízká sazba', 'Flexibilní podmínky'],
          rating: 4.7,
          processingTime: '3-5 dní',
          minAmount: 10000,
          maxAmount: 500000,
        },
        {
          provider: 'Česká spořitelna',
          rate: 3.79,
          monthlyPayment: calculateMonthly(3.79),
          totalCost: calculateMonthly(3.79) * loanYears * 12,
          features: ['Studentské výhody', 'Možnost odkladu', 'Online správa'],
          rating: 4.6,
          processingTime: '5-7 dní',
          minAmount: 15000,
          maxAmount: 400000,
        },
        {
          provider: 'Komerční banka',
          rate: 3.99,
          monthlyPayment: calculateMonthly(3.99),
          totalCost: calculateMonthly(3.99) * loanYears * 12,
          features: ['Prémiový program', 'Individuální přístup', 'Bonusy'],
          rating: 4.5,
          processingTime: '4-6 dní',
          minAmount: 20000,
          maxAmount: 600000,
        },
        {
          provider: 'Raiffeisenbank',
          rate: 4.29,
          monthlyPayment: calculateMonthly(4.29),
          totalCost: calculateMonthly(4.29) * loanYears * 12,
          features: ['Osobní bankéř', 'Flexibilní podmínky', 'Rychlé schválení'],
          rating: 4.4,
          processingTime: '3-5 dní',
          minAmount: 10000,
          maxAmount: 500000,
        },
      ],
      other: [
        {
          provider: 'Air Bank',
          rate: 6.90,
          monthlyPayment: calculateMonthly(6.90),
          totalCost: calculateMonthly(6.90) * loanYears * 12,
          features: ['100% online', 'Rychlé schválení', 'Bez poplatků'],
          rating: 4.7,
          processingTime: '1-2 dny',
          minAmount: 20000,
          maxAmount: 1000000,
        },
        {
          provider: 'mBank',
          rate: 7.20,
          monthlyPayment: calculateMonthly(7.20),
          totalCost: calculateMonthly(7.20) * loanYears * 12,
          features: ['Flexibilní splácení', 'Mobilní aplikace', 'Online správa'],
          rating: 4.6,
          processingTime: '1-3 dny',
          minAmount: 30000,
          maxAmount: 800000,
        },
        {
          provider: 'Raiffeisenbank',
          rate: 7.49,
          monthlyPayment: calculateMonthly(7.49),
          totalCost: calculateMonthly(7.49) * loanYears * 12,
          features: ['Osobní bankéř', 'Individuální podmínky', 'Prémiové služby'],
          rating: 4.5,
          processingTime: '2-4 dny',
          minAmount: 50000,
          maxAmount: 1500000,
        },
        {
          provider: 'ČSOB',
          rate: 7.99,
          monthlyPayment: calculateMonthly(7.99),
          totalCost: calculateMonthly(7.99) * loanYears * 12,
          features: ['Online žádost', 'Rychlé vyřízení', 'Bonusový program'],
          rating: 4.4,
          processingTime: '2-5 dní',
          minAmount: 40000,
          maxAmount: 1200000,
        },
      ],
    };

    return offers[type] || offers.other;
  };

  const generateInsights = (
    type: LoanType,
    loanYears: number,
    offers: LoanOffer[]
  ): string[] => {
    const insights: string[] = [];
    const bestRate = offers[0].rate;
    const worstRate = offers[offers.length - 1].rate;
    const rateDiff = worstRate - bestRate;
    const savingsPerMonth = offers[offers.length - 1].monthlyPayment - offers[0].monthlyPayment;
    const totalSavings = savingsPerMonth * loanYears * 12;

    insights.push(
      t('loanFinderInsightSavings', {
        amount: Math.round(totalSavings).toLocaleString('cs-CZ'),
        symbol: currentCurrency.symbol,
      })
    );

    if (rateDiff > 1.0) {
      insights.push(
        t('loanFinderInsightRateDiff', { diff: rateDiff.toFixed(2) })
      );
    }

    if (type === 'mortgage' && loanYears >= 20) {
      insights.push(t('loanFinderInsightMortgageFix'));
    }

    if (type === 'car' && loanYears <= 5) {
      insights.push(t('loanFinderInsightCarShorter'));
    }

    if (bestRate < 5.0 && type === 'mortgage') {
      insights.push(t('loanFinderInsightLowRates'));
    }

    const avgRate = offers.reduce((sum, o) => sum + o.rate, 0) / offers.length;
    insights.push(
      t('loanFinderInsightAvgRate', {
        avg: avgRate.toFixed(2),
        diff: (avgRate - bestRate).toFixed(2),
      })
    );

    return insights;
  };

  const handleSearch = async () => {
    const loanAmount = parseMoneyInput(amount);
    const loanYears = parseDecimalInput(years, 2);

    if (!loanAmount || loanAmount <= 0) {
      return;
    }

    if (!loanYears || loanYears <= 0) {
      return;
    }

    setIsSearching(true);
    setRecommendation(null);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const offers = getLoanOffers(loanType, loanAmount, loanYears);
    const bestOffer = offers[0];
    const averageRate = offers.reduce((sum, o) => sum + o.rate, 0) / offers.length;
    const insights = generateInsights(loanType, loanYears, offers);

    setRecommendation({
      loanType,
      amount: loanAmount,
      years: loanYears,
      offers,
      bestOffer,
      averageRate,
      insights,
    });

    setIsSearching(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <BackButton color="white" size={24} style={styles.headerBackButton} />
          <View style={styles.headerTitleContainer}>
            <View style={styles.headerTitleRow}>
              <Sparkles color="white" size={24} />
              <Text style={styles.headerTitle}>{t('loanFinderTitle')}</Text>
            </View>
            <Text style={styles.headerSubtitle}>{t('loanFinderSubtitle')}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={[styles.searchCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
            <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {t('loanFinderWhatLooking')}
            </Text>

            <View style={styles.loanTypeGrid}>
              {loanTypes.map((item) => {
                const Icon = item.icon;
                const isSelected = loanType === item.type;
                return (
                  <TouchableOpacity
                    key={item.type}
                    style={[
                      styles.loanTypeButton,
                      {
                        backgroundColor: isSelected
                          ? item.color + '20'
                          : isDarkMode
                          ? '#4B5563'
                          : '#F3F4F6',
                        borderColor: isSelected ? item.color : 'transparent',
                      },
                    ]}
                    onPress={() => setLoanType(item.type)}
                  >
                    <Icon color={isSelected ? item.color : isDarkMode ? '#D1D5DB' : '#6B7280'} size={28} />
                    <Text
                      style={[
                        styles.loanTypeLabel,
                        {
                          color: isSelected ? item.color : isDarkMode ? '#D1D5DB' : '#6B7280',
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                {t('loanFinderAmountLabel', { symbol: currentCurrency.symbol })}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDarkMode ? '#4B5563' : '#F3F4F6',
                    color: isDarkMode ? 'white' : '#1F2937',
                  },
                ]}
                placeholder={t('loanFinderAmountPlaceholder')}
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                {t('loanFinderYearsLabel')}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDarkMode ? '#4B5563' : '#F3F4F6',
                    color: isDarkMode ? 'white' : '#1F2937',
                  },
                ]}
                placeholder={t('loanFinderYearsPlaceholder')}
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                keyboardType="numeric"
                value={years}
                onChangeText={setYears}
              />
            </View>

            <TouchableOpacity
              style={styles.searchButton}
              onPress={handleSearch}
              disabled={isSearching || !amount || !years}
            >
              <LinearGradient
                colors={['#667eea', '#764ba2']}
                style={styles.searchButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {isSearching ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Sparkles color="white" size={20} />
                    <Text style={styles.searchButtonText}>{t('loanFinderSearch')}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {recommendation && (
            <>
              <View
                style={[styles.insightsCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
              >
                <View style={styles.insightsHeader}>
                  <Sparkles color="#F59E0B" size={24} />
                  <Text style={[styles.insightsTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                    {t('loanFinderAiRecommendations')}
                  </Text>
                </View>
                {recommendation.insights.map((insight, index) => (
                  <View key={index} style={styles.insightItem}>
                    <Text style={[styles.insightText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                      {insight}
                    </Text>
                  </View>
                ))}
              </View>

              <View
                style={[styles.bestOfferCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
              >
                <View style={styles.bestOfferBadge}>
                  <CheckCircle color="#10B981" size={20} />
                  <Text style={styles.bestOfferBadgeText}>{t('loanFinderBestOffer')}</Text>
                </View>
                <View style={styles.bestOfferHeader}>
                  <Building2 color="#667eea" size={32} />
                  <Text style={[styles.bestOfferProvider, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                    {recommendation.bestOffer.provider}
                  </Text>
                </View>
                <View style={styles.bestOfferStats}>
                  <View style={styles.bestOfferStat}>
                    <Percent color="#667eea" size={20} />
                    <Text style={[styles.bestOfferStatLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                      {t('loanInterestRate')}
                    </Text>
                    <Text style={[styles.bestOfferStatValue, { color: '#10B981' }]}>
                      {recommendation.bestOffer.rate}% p.a.
                    </Text>
                  </View>
                  <View style={styles.bestOfferStat}>
                    <CreditCard color="#667eea" size={20} />
                    <Text style={[styles.bestOfferStatLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                      {t('loanMonthlyPayment')}
                    </Text>
                    <Text style={[styles.bestOfferStatValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                      {Math.round(recommendation.bestOffer.monthlyPayment).toLocaleString('cs-CZ')} {currentCurrency.symbol}
                    </Text>
                  </View>
                  <View style={styles.bestOfferStat}>
                    <Calendar color="#667eea" size={20} />
                    <Text style={[styles.bestOfferStatLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                      {t('loanFinderProcessingTime')}
                    </Text>
                    <Text style={[styles.bestOfferStatValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                      {recommendation.bestOffer.processingTime}
                    </Text>
                  </View>
                </View>
                <View style={styles.bestOfferFeatures}>
                  {recommendation.bestOffer.features.map((feature, index) => (
                    <View key={index} style={styles.featureItem}>
                      <CheckCircle color="#10B981" size={16} />
                      <Text style={[styles.featureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        {feature}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              <Text style={[styles.otherOffersTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                {t('loanFinderOtherOffers')}
              </Text>

              {recommendation.offers.slice(1).map((offer, index) => (
                <View
                  key={index}
                  style={[styles.offerCard, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
                >
                  <View style={styles.offerHeader}>
                    <View style={styles.offerHeaderLeft}>
                      <Building2 color="#667eea" size={24} />
                      <Text style={[styles.offerProvider, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                        {offer.provider}
                      </Text>
                    </View>
                    <View style={styles.offerRating}>
                      <Text style={styles.offerRatingText}>⭐ {offer.rating}</Text>
                    </View>
                  </View>
                  <View style={styles.offerStats}>
                    <View style={styles.offerStat}>
                      <Text style={[styles.offerStatLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        {t('loanFinderRate')}
                      </Text>
                      <Text style={[styles.offerStatValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                        {offer.rate}%
                      </Text>
                    </View>
                    <View style={styles.offerStat}>
                      <Text style={[styles.offerStatLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        {t('loanFinderMonthly')}
                      </Text>
                      <Text style={[styles.offerStatValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                        {Math.round(offer.monthlyPayment).toLocaleString('cs-CZ')} {currentCurrency.symbol}
                      </Text>
                    </View>
                    <View style={styles.offerStat}>
                      <Text style={[styles.offerStatLabel, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                        {t('loanFinderProcessing')}
                      </Text>
                      <Text style={[styles.offerStatValue, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                        {offer.processingTime}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.offerFeatures}>
                    {offer.features.slice(0, 2).map((feature, idx) => (
                      <View key={idx} style={styles.offerFeatureItem}>
                        <CheckCircle color="#10B981" size={14} />
                        <Text style={[styles.offerFeatureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                          {feature}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBackButton: {
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
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  searchCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  loanTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  loanTypeButton: {
    width: '47%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
  },
  loanTypeLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
  },
  searchButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  searchButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  searchButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  insightsCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  insightsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  insightsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  insightItem: {
    marginBottom: 12,
  },
  insightText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bestOfferCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 2,
    borderColor: '#10B981',
  },
  bestOfferBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#10B98120',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  bestOfferBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#10B981',
  },
  bestOfferHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  bestOfferProvider: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  bestOfferStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 12,
  },
  bestOfferStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  bestOfferStatLabel: {
    fontSize: 11,
    textAlign: 'center',
  },
  bestOfferStatValue: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  bestOfferFeatures: {
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 13,
  },
  otherOffersTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  offerCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  offerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  offerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  offerProvider: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  offerRating: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  offerRatingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  offerStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  offerStat: {
    flex: 1,
  },
  offerStatLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  offerStatValue: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  offerFeatures: {
    gap: 6,
  },
  offerFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offerFeatureText: {
    fontSize: 12,
  },
});
