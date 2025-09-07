import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useLanguageStore, LANGUAGES, Language } from '@/store/language-store';
import { useSettingsStore } from '@/store/settings-store';
import { useBuddyStore } from '@/store/buddy-store';

export default function LanguageSettingsScreen() {
  const { language, setLanguage, t, updateCounter } = useLanguageStore();
  const { isDarkMode } = useSettingsStore();
  const { refreshDailyTip } = useBuddyStore();
  
  const languageList = Object.values(LANGUAGES);
  
  const handleLanguageChange = useCallback(async (newLanguage: Language) => {
    console.log('Changing language from', language, 'to', newLanguage);
    await setLanguage(newLanguage);
    // Refresh daily tip when language changes
    refreshDailyTip();
  }, [language, setLanguage, refreshDailyTip]);
  
  // Force re-render when language changes
  useEffect(() => {
    console.log('Language changed, updateCounter:', updateCounter);
  }, [updateCounter]);

  return (
    <>
      <Stack.Screen 
        options={{
          title: t('language'),
          headerStyle: { backgroundColor: '#667eea' },
          headerTintColor: 'white',
          headerTitleStyle: { fontWeight: 'bold' },
        }} 
      />
      
      <ScrollView style={[
        styles.container,
        { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }
      ]}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.headerTitle}>{t('languageSettings')}</Text>
          <Text style={styles.headerSubtitle}>{t('selectLanguage')}</Text>
          <Text style={styles.currentLanguage}>
            {t('language')}: {LANGUAGES[language].name} {LANGUAGES[language].flag}
          </Text>
        </LinearGradient>

        <View style={styles.content}>
          {languageList.map((languageItem) => (
            <TouchableOpacity
              key={languageItem.code}
              style={[
                styles.languageOption,
                { 
                  borderColor: language === languageItem.code ? '#10B981' : 'transparent',
                  backgroundColor: language === languageItem.code 
                    ? (isDarkMode ? '#065F46' : '#F0FDF4') 
                    : (isDarkMode ? '#374151' : 'white')
                }
              ]}
              onPress={() => handleLanguageChange(languageItem.code as Language)}
            >
              <View style={styles.languageInfo}>
                <Text style={styles.flag}>{languageItem.flag}</Text>
                <View style={styles.languageTextContainer}>
                  <Text style={[
                    styles.languageName,
                    { 
                      color: isDarkMode ? 'white' : '#1F2937',
                      fontWeight: language === languageItem.code ? 'bold' : '600'
                    }
                  ]}>{languageItem.name}</Text>
                  {language === languageItem.code && (
                    <Text style={styles.currentLabel}>{t('language')} ✓</Text>
                  )}
                </View>
              </View>
              {language === languageItem.code && (
                <View style={styles.selectedIndicator}>
                  <Check color="#10B981" size={24} />
                </View>
              )}
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
    backgroundColor: '#F8FAFC',
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
  },
  content: {
    padding: 20,
  },
  languageOption: {
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
    borderWidth: 2,
    borderColor: 'transparent',
  },
  languageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flag: {
    fontSize: 24,
    marginRight: 16,
  },
  languageTextContainer: {
    flex: 1,
  },
  languageName: {
    fontSize: 16,
    fontWeight: '600',
  },
  currentLabel: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
    marginTop: 2,
  },
  selectedIndicator: {
    backgroundColor: '#F0FDF4',
    borderRadius: 20,
    padding: 4,
  },
  currentLanguage: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    marginTop: 8,
    fontWeight: '500',
  },
});