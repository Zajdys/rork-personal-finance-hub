import React, { useCallback } from 'react';
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

export default function LanguageSettingsScreen() {
  const { language, setLanguage, t } = useLanguageStore();
  const { isDarkMode } = useSettingsStore();
  
  const languageList = Object.values(LANGUAGES);
  
  const handleLanguageChange = useCallback(async (newLanguage: Language) => {
    console.log('Changing language from', language, 'to', newLanguage);
    await setLanguage(newLanguage);
  }, [language, setLanguage]);

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
        </LinearGradient>

        <View style={styles.content}>
          {languageList.map((languageItem) => (
            <TouchableOpacity
              key={languageItem.code}
              style={[
                styles.languageOption,
                { backgroundColor: isDarkMode ? '#374151' : 'white' }
              ]}
              onPress={() => handleLanguageChange(languageItem.code as Language)}
            >
              <View style={styles.languageInfo}>
                <Text style={styles.flag}>{languageItem.flag}</Text>
                <Text style={[
                  styles.languageName,
                  { color: isDarkMode ? 'white' : '#1F2937' }
                ]}>{languageItem.name}</Text>
              </View>
              {language === languageItem.code && (
                <Check color="#10B981" size={24} />
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
  },
  languageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flag: {
    fontSize: 24,
    marginRight: 16,
  },
  languageName: {
    fontSize: 16,
    fontWeight: '600',
  },
});