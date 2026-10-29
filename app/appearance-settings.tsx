import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Stack } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Check, Sun, Moon, Smartphone } from 'lucide-react-native';
import { useLanguageStore, LANGUAGES, Language } from '@/store/language-store';
import { useSettingsStore, CURRENCIES, Currency, Theme } from '@/store/settings-store';
import { useBuddyStore } from '@/store/buddy-store';
import { useTheme } from '@/hooks/use-theme';

export default function AppearanceSettingsScreen() {
  const { language, setLanguage, t } = useLanguageStore();
  const { currency, theme, setCurrency, setTheme } = useSettingsStore();
  const { colors, isDark } = useTheme();
  const { refreshDailyTip } = useBuddyStore();

  const languageList = Object.values(LANGUAGES);
  const currencyList = Object.values(CURRENCIES);
  const themes = useMemo(
    () => [
      { id: 'light' as Theme, name: t('themeSettings.light'), description: t('themeSettings.lightDesc'), icon: Sun },
      { id: 'dark' as Theme, name: t('themeSettings.dark'), description: t('themeSettings.darkDesc'), icon: Moon },
      { id: 'auto' as Theme, name: t('themeSettings.auto'), description: t('themeSettings.autoDesc'), icon: Smartphone },
    ],
    [t],
  );

  const handleLanguageChange = useCallback(
    async (newLanguage: Language) => {
      await setLanguage(newLanguage);
      refreshDailyTip();
    },
    [setLanguage, refreshDailyTip],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={t('profileAppearanceTitle')}
        subtitle={t('profileAppearanceSubtitle')}
        variant="gradient"
      />

      <ScrollView style={styles.scroll}>
        <View style={styles.content}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('language')}</Text>
          {languageList.map((languageItem) => {
            const selected = language === languageItem.code;
            return (
              <TouchableOpacity
                key={languageItem.code}
                style={[
                  styles.option,
                  {
                    backgroundColor: selected
                      ? isDark
                        ? '#065F46'
                        : '#F0FDF4'
                      : colors.card,
                    borderColor: selected ? '#10B981' : 'transparent',
                  },
                ]}
                onPress={() => void handleLanguageChange(languageItem.code as Language)}
              >
                <View style={styles.optionLeft}>
                  <Text style={styles.flag}>{languageItem.flag}</Text>
                  <View>
                    <Text style={[styles.optionTitle, { color: colors.text }]}>
                      {languageItem.name}
                    </Text>
                    {selected ? (
                      <Text style={styles.currentLabel}>{t('current')}</Text>
                    ) : null}
                  </View>
                </View>
                {selected ? <Check color="#10B981" size={22} /> : null}
              </TouchableOpacity>
            );
          })}

          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>
            {t('appCurrency')}
          </Text>
          {currencyList.map((currencyItem) => {
            const selected = currency === currencyItem.code;
            return (
              <TouchableOpacity
                key={currencyItem.code}
                style={[styles.option, { backgroundColor: colors.card }]}
                onPress={() => setCurrency(currencyItem.code as Currency)}
              >
                <View style={styles.optionLeft}>
                  <Text style={styles.flag}>{currencyItem.flag}</Text>
                  <View>
                    <Text style={[styles.optionTitle, { color: colors.text }]}>
                      {currencyItem.name}
                    </Text>
                    <Text style={[styles.optionSub, { color: colors.textSecondary }]}>
                      {currencyItem.code} ({currencyItem.symbol})
                    </Text>
                  </View>
                </View>
                {selected ? <Check color="#10B981" size={22} /> : null}
              </TouchableOpacity>
            );
          })}

          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>
            {t('theme')}
          </Text>
          {themes.map((themeItem) => {
            const Icon = themeItem.icon;
            const selected = theme === themeItem.id;
            return (
              <TouchableOpacity
                key={themeItem.id}
                style={[styles.option, { backgroundColor: colors.card }]}
                onPress={() => setTheme(themeItem.id)}
              >
                <View style={styles.optionLeft}>
                  <View style={[styles.themeIcon, { backgroundColor: colors.muted }]}>
                    <Icon color={colors.primary} size={22} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionTitle, { color: colors.text }]}>
                      {themeItem.name}
                    </Text>
                    <Text style={[styles.optionSub, { color: colors.textSecondary }]}>
                      {themeItem.description}
                    </Text>
                  </View>
                </View>
                {selected ? <Check color="#10B981" size={22} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
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
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
    marginLeft: 4,
  },
  option: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  flag: { fontSize: 28 },
  optionTitle: { fontSize: 16, fontWeight: '700' },
  optionSub: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  currentLabel: { fontSize: 12, color: '#10B981', fontWeight: '600', marginTop: 2 },
  themeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
