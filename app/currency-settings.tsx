import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { StackHeaderBackButton } from '@/components/BackButton';
import { Check } from 'lucide-react-native';
import { useSettingsStore, CURRENCIES, Currency } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';

export default function CurrencySettingsScreen() {
  const { currency, isDarkMode, setCurrency } = useSettingsStore();
  const { t } = useLanguageStore();

  const currencyList = Object.values(CURRENCIES);

  return (
    <>
      <Stack.Screen
        options={{
          title: t('appCurrency'),
          headerStyle: { backgroundColor: '#667eea' },
          headerTintColor: 'white',
          headerLeft: ({ tintColor }) => (
            <StackHeaderBackButton tintColor={tintColor ?? 'white'} />
          ),
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />

      <ScrollView
        style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}
      >
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.headerTitle}>{t('appCurrency')}</Text>
          <Text style={styles.headerSubtitle}>{t('appCurrencySubtitle')}</Text>
        </LinearGradient>

        <View style={styles.content}>
          <Text style={[styles.sectionTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
            {t('currencySettings.currencyTitle')}
          </Text>
          {currencyList.map((currencyItem) => (
            <TouchableOpacity
              key={currencyItem.code}
              style={[styles.currencyOption, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
              onPress={() => setCurrency(currencyItem.code as Currency)}
            >
              <View style={styles.currencyInfo}>
                <Text style={styles.flag}>{currencyItem.flag}</Text>
                <View>
                  <Text style={[styles.currencyName, { color: isDarkMode ? 'white' : '#1F2937' }]}>
                    {currencyItem.name}
                  </Text>
                  <Text style={[styles.currencyCode, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                    {currencyItem.code} ({currencyItem.symbol})
                  </Text>
                </View>
              </View>
              {currency === currencyItem.code && <Check color="#10B981" size={24} />}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
    lineHeight: 22,
  },
  content: {
    padding: 20,
  },
  currencyOption: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  currencyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flag: {
    fontSize: 24,
    marginRight: 16,
  },
  currencyName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  currencyCode: {
    fontSize: 14,
    color: '#6B7280',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1F2937',
  },
});
