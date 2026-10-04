import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useFinanceStore } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useTheme } from '@/hooks/use-theme';
import { BackButton } from '@/components/BackButton';
import { AsyncButton } from '@/components/AsyncButton';
import { BrandIcon } from '@/components/BrandIcon';
import { appLocale } from '@/lib/app-locale';
import { formatMoney } from '@/lib/format-money';
import { LinearGradient } from 'expo-linear-gradient';

export default function HiddenSubscriptionSuggestionsScreen() {
  const ignored = useFinanceStore((s) => s.ignoredSubscriptionSuggestions);
  const restore = useFinanceStore((s) => s.restoreIgnoredSubscriptionSuggestion);
  const { getCurrentCurrency } = useSettingsStore();
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguageStore();
  const numberLocale = appLocale(language);
  const currency = getCurrentCurrency();

  const onRestore = useCallback(
    async (id: string, name: string) => {
      await restore(id);
      Alert.alert(t('done'), t('hiddenSubsRestored', { name }));
    },
    [restore, t],
  );

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerRow}>
          <BackButton color="white" size={24} />
          <Text style={styles.headerTitle}>{t('hiddenSubsTitle')}</Text>
        </View>
      </LinearGradient>

      {ignored.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          {t('hiddenSubsEmpty')}
        </Text>
      ) : (
        <FlatList
          data={ignored}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <BrandIcon merchantKey={item.displayName || item.merchantKey} size={40} />
              <View style={styles.meta}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
                  {item.displayName || item.merchantKey}
                </Text>
                <Text style={{ color: colors.textSecondary }}>
                  {formatMoney(item.amount, numberLocale)} {item.currency || currency.symbol}
                </Text>
              </View>
              <AsyncButton
                label={t('hiddenSubsRestore')}
                loadingLabel="…"
                variant="primary"
                onPress={async () => {
                  await onRestore(item.id, item.displayName || item.merchantKey);
                }}
                style={styles.restoreBtn}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: '700', flex: 1 },
  list: { padding: 16, paddingBottom: 40 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 15, paddingHorizontal: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  meta: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  restoreBtn: { minWidth: 88, height: 36 },
});
