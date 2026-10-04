import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { SubscriptionItem } from '@/store/finance-store';
import { useFinanceStore } from '@/store/finance-store';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { BrandIcon } from '@/components/BrandIcon';
import { AsyncButton } from '@/components/AsyncButton';
import { daysUntilNextPayment } from '@/lib/subscription-helpers';
import { appLocale } from '@/lib/app-locale';
import { formatMoney } from '@/lib/format-money';
import { safePush } from '@/lib/safe-navigate';
import { X } from 'lucide-react-native';

type Props = {
  items: SubscriptionItem[];
  currencySymbol: string;
  categoryPillPastel: (category: string, isDark: boolean) => { bg: string; fg: string };
  formatDaysLeft: (days: number) => string;
};

export function DetectedSubscriptionSuggestions({
  items,
  currencySymbol,
  categoryPillPastel,
  formatDaysLeft,
}: Props) {
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguageStore();
  const numberLocale = appLocale(language);
  const dismiss = useFinanceStore((s) => s.dismissDetectedSubscriptionSuggestion);
  const restore = useFinanceStore((s) => s.restoreIgnoredSubscriptionSuggestion);
  const [toast, setToast] = useState<{ ignoredId: string } | null>(null);

  const onIgnore = useCallback(
    async (s: SubscriptionItem) => {
      const ignored = await dismiss({
        merchantKey: s.merchantKey || s.name,
        amount: s.amount,
        name: s.name,
        currency: s.currency || 'CZK',
      });
      if (ignored) {
        setToast({ ignoredId: ignored.id });
        setTimeout(() => {
          setToast((prev) => (prev?.ignoredId === ignored.id ? null : prev));
        }, 5000);
      }
    },
    [dismiss],
  );

  const onUndo = useCallback(async () => {
    if (!toast) return;
    const id = toast.ignoredId;
    setToast(null);
    await restore(id);
  }, [restore, toast]);

  const onAdd = useCallback((s: SubscriptionItem) => {
    safePush({
      pathname: '/add-subscription',
      params: {
        name: s.name,
        amount: String(s.amount),
        dayOfMonth: String(s.dayOfMonth),
        category: s.category,
        merchantKey: s.merchantKey || '',
        source: 'bank',
        currency: s.currency || 'CZK',
        frequency: s.frequency || 'monthly',
      },
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <View
      style={[
        styles.shell,
        {
          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.muted,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('dashboardDetectedFromStatements')}
        </Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {t('dashboardDetectedHint')}
        </Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      {items.slice(0, 8).map((s) => {
        const pill = categoryPillPastel(s.category, isDark);
        const daysLeft = daysUntilNextPayment(s.dayOfMonth);
        const daysLabel = formatDaysLeft(daysLeft);
        return (
          <View
            key={s.id}
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                shadowOpacity: isDark ? 0.35 : 0.06,
              },
            ]}
            testID={`detected-${s.id}`}
          >
            <View style={styles.main}>
              <BrandIcon merchantKey={s.name} size={48} />
              <View style={styles.meta}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
                  {s.name}
                </Text>
                <View style={styles.metaRow}>
                  <View style={[styles.pill, { backgroundColor: pill.bg }]}>
                    <Text style={[styles.pillText, { color: pill.fg }]} numberOfLines={1}>
                      {s.category}
                    </Text>
                  </View>
                  <Text style={[styles.days, { color: colors.textSecondary }]}>{daysLabel}</Text>
                </View>
              </View>
            </View>
            <View style={styles.right}>
              <View style={styles.amountRow}>
                <Text style={[styles.amount, { color: colors.text }]}>
                  {formatMoney(s.amount, numberLocale)} {currencySymbol}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    void onIgnore(s);
                  }}
                  accessibilityLabel={t('dashboardIgnoreSuggestionA11y', { name: s.name })}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={[
                    styles.ignoreIconBtn,
                    { borderColor: colors.border, backgroundColor: colors.background },
                  ]}
                >
                  <X size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={styles.actions}>
                <AsyncButton
                  label={t('dashboardIgnore')}
                  loadingLabel="…"
                  variant="solid"
                  solidColor={colors.muted}
                  onPress={async () => {
                    await onIgnore(s);
                  }}
                  style={styles.ignoreBtn}
                  textStyle={[styles.ignoreBtnText, { color: colors.textSecondary }]}
                />
                <AsyncButton
                  label={t('addAction')}
                  loadingLabel="…"
                  variant="success"
                  onPress={async () => {
                    onAdd(s);
                  }}
                  style={styles.addBtn}
                />
              </View>
            </View>
          </View>
        );
      })}
      {toast ? (
        <TouchableOpacity
          style={[styles.toast, { backgroundColor: isDark ? '#1F2937' : '#111827' }]}
          onPress={() => {
            void onUndo();
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.toastText}>
            {t('dashboardSuggestionHiddenToast')}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  header: { gap: 4 },
  title: { fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 13, lineHeight: 18 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  meta: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  pillText: { fontSize: 11, fontWeight: '600' },
  days: { fontSize: 12 },
  right: { alignItems: 'flex-end', gap: 8, marginLeft: 8 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  amount: { fontSize: 15, fontWeight: '700' },
  ignoreIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ignoreBtn: { minWidth: 72, paddingHorizontal: 8, height: 34 },
  ignoreBtnText: { fontSize: 12, fontWeight: '600' },
  addBtn: { minWidth: 72, paddingHorizontal: 10, height: 34 },
  toast: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  toastText: { color: '#F9FAFB', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
