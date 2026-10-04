import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Timer } from 'lucide-react-native';
import { useSavePendingStore } from '@/store/save-pending-store';
import { useFinanceStore } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useTheme } from '@/hooks/use-theme';
import { toYyyyMmDd } from '@/lib/transaction-date';
import { useAuth } from '@/store/auth-store';
import { fetchPrimaryHouseholdId } from '@/lib/household-id';
import { insertSaveDecision } from '@/lib/save-decisions';
import { safeGoBack } from '@/lib/safe-back';
import { randomUUID } from '@/lib/random-uuid';
import { BackButton, StackHeaderBackButton } from '@/components/BackButton';

const formatCurrency = (value: number) => value.toLocaleString('cs-CZ');

export default function SavePendingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark: isDarkMode } = useTheme();
  const { t } = useLanguageStore();
  const currency = useSettingsStore((s) => s.getCurrentCurrency());
  const { user } = useAuth();
  const pendingItems = useSavePendingStore((s) => s.pendingItems);
  const isLoaded = useSavePendingStore((s) => s.isLoaded);
  const loadFromStorage = useSavePendingStore((s) => s.loadFromStorage);
  const removePendingItem = useSavePendingStore((s) => s.removePendingItem);
  const incrementSavedTotal = useSavePendingStore((s) => s.incrementSavedTotal);
  const addTransaction = useFinanceStore((s) => s.addTransaction);

  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    void loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const item = useMemo(() => pendingItems.find((p) => p.id === id), [pendingItems, id]);

  const remainingMs = item ? item.remindAt - nowTick : 0;
  const clampedMs = Math.max(0, remainingMs);
  const remainingHours = Math.floor(clampedMs / 3600000);
  const remainingMinutes = Math.floor((clampedMs % 3600000) / 60000);
  const remainingSeconds = Math.floor((clampedMs % 60000) / 1000);
  const timerDone = item ? clampedMs <= 0 : false;

  const shadowSoft = isDarkMode ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.08)';

  const onBuy = useCallback(async () => {
    if (!item) return;
    if (user?.id) {
      const householdId = await fetchPrimaryHouseholdId(user.id);
      await insertSaveDecision({
        userId: user.id,
        householdId,
        itemName: item.title,
        price: item.price,
        decision: 'bought',
        hoursOfWork: item.hoursNeeded,
        futureValue: item.futureValue,
      });
    }
    addTransaction({
      id: randomUUID(),
      type: 'expense',
      amount: item.price,
      title: item.title,
      category: 'Nákupy',
      date: toYyyyMmDd(new Date()),
    });
    removePendingItem(item.id);
    safeGoBack();
  }, [item, user?.id, addTransaction, removePendingItem]);

  const onSkip = useCallback(async () => {
    if (!item) return;
    if (user?.id) {
      const householdId = await fetchPrimaryHouseholdId(user.id);
      await insertSaveDecision({
        userId: user.id,
        householdId,
        itemName: item.title,
        price: item.price,
        decision: 'saved',
        hoursOfWork: item.hoursNeeded,
        futureValue: item.futureValue,
      });
    }
    incrementSavedTotal(item.price);
    removePendingItem(item.id);
    Alert.alert(
      t('saveSavedTitle'),
      t('saveSavedBody', { amount: formatCurrency(item.price), symbol: currency.symbol }),
      [{ text: t('saveOk'), onPress: () => safeGoBack() }],
    );
  }, [item, user?.id, incrementSavedTotal, removePendingItem, currency.symbol, t]);

  if (!isLoaded) {
    return (
      <>
        <Stack.Screen
          options={{
            title: t('screenThinkItOver'),
            headerShown: true,
            headerLeft: ({ tintColor }) => (
              <StackHeaderBackButton tintColor={tintColor ?? 'white'} />
            ),
          }}
        />
        <View style={[styles.centered, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </>
    );
  }

  if (!item) {
    return (
      <>
        <Stack.Screen
          options={{
            title: t('screenThinkItOver'),
            headerShown: true,
            headerLeft: () => (
              <BackButton color={colors.primary} size={28} style={styles.headerBack} hitSlop={12} />
            ),
          }}
        />
        <View style={[styles.centered, { backgroundColor: colors.background, padding: 24 }]}>
          <Text style={[styles.missingTitle, { color: colors.text }]}>{t('savePendingItemGone')}</Text>
          <Text style={[styles.missingSub, { color: colors.textSecondary }]}>
            {t('savePendingItemGoneHint')}
          </Text>
          <TouchableOpacity
            style={[styles.backCta, { backgroundColor: colors.primary }]}
            onPress={() => safeGoBack()}
          >
            <Text style={[styles.backCtaText, { color: colors.onPrimary }]}>{t('back')}</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: t('screenThinkItOver'),
          headerShown: true,
          headerLeft: ({ tintColor }) => (
            <StackHeaderBackButton tintColor={tintColor ?? 'white'} />
          ),
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              shadowColor: shadowSoft,
            },
          ]}
        >
          <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={3}>
            {item.title}
          </Text>
          <Text style={[styles.priceLine, { color: colors.textSecondary }]}>
            {t('savePendingWorkHours', {
              price: formatCurrency(item.price),
              symbol: currency.symbol,
              hours: item.hoursNeeded.toFixed(1),
            })}
          </Text>

          <View style={[styles.timerBlock, { backgroundColor: colors.muted }]}>
            <Timer size={22} color={colors.warning} style={{ marginBottom: 8 }} />
            <Text style={[styles.timerLabel, { color: colors.textSecondary }]}>{t('savePendingRemaining')}</Text>
            <Text style={[styles.timerValue, { color: timerDone ? colors.success : colors.text }]}>
              {timerDone
                ? t('saveTimeToDecide')
                : `${remainingHours} h ${remainingMinutes} min ${remainingSeconds} s`}
            </Text>
          </View>
        </View>

        <View style={styles.buttonColumn}>
          <TouchableOpacity
            style={[styles.ctaPrimary, { backgroundColor: colors.primary }]}
            onPress={onBuy}
            activeOpacity={0.88}
          >
            <Text style={[styles.ctaPrimaryText, { color: colors.onPrimary }]}>{t('savePendingBuy')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ctaSecondary, { backgroundColor: colors.success }]}
            onPress={onSkip}
            activeOpacity={0.88}
          >
            <Text style={[styles.ctaSecondaryText, { color: colors.onPrimary }]}>{t('savePendingSkip')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerBack: { marginLeft: 4, padding: 4 },
  missingTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  missingSub: { fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  backCta: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 16,
  },
  backCtaText: { fontSize: 16, fontWeight: '800' },
  card: {
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 2,
  },
  itemTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  priceLine: { fontSize: 15, marginTop: 10 },
  timerBlock: {
    marginTop: 20,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  timerLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  timerValue: { fontSize: 20, fontWeight: '800', marginTop: 6 },
  buttonColumn: { marginTop: 24, gap: 12 },
  ctaPrimary: {
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  ctaPrimaryText: { fontSize: 17, fontWeight: '800' },
  ctaSecondary: {
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  ctaSecondaryText: { fontSize: 17, fontWeight: '800' },
});
