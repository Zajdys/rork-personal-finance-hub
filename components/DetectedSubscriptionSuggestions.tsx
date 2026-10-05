import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import type { SubscriptionItem } from '@/store/finance-store';
import { useFinanceStore } from '@/store/finance-store';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { BrandIcon } from '@/components/BrandIcon';
import { daysUntilNextPayment } from '@/lib/subscription-helpers';
import { appLocale } from '@/lib/app-locale';
import { formatMoney } from '@/lib/format-money';
import { safePush } from '@/lib/safe-navigate';

type Props = {
  items: SubscriptionItem[];
  currencySymbol: string;
  formatDaysLeft: (days: number) => string;
};

export function DetectedSubscriptionSuggestions({
  items,
  currencySymbol,
  formatDaysLeft,
}: Props) {
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguageStore();
  const numberLocale = appLocale(language);
  const dismiss = useFinanceStore((s) => s.dismissDetectedSubscriptionSuggestion);
  const restore = useFinanceStore((s) => s.restoreIgnoredSubscriptionSuggestion);
  const [toast, setToast] = useState<{ ignoredId: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const onIgnore = useCallback(
    async (s: SubscriptionItem) => {
      if (busyId) return;
      setBusyId(s.id);
      try {
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
      } finally {
        setBusyId(null);
      }
    },
    [busyId, dismiss],
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
        const daysLeft = daysUntilNextPayment(s.dayOfMonth);
        const daysLabel = formatDaysLeft(daysLeft);
        return (
          <View
            key={s.id}
            style={[
              styles.row,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            testID={`detected-${s.id}`}
          >
            <BrandIcon merchantKey={s.name} size={40} />
            <View style={styles.meta}>
              <Text
                style={[styles.name, { color: colors.text }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {s.name}
              </Text>
              <Text
                style={[styles.subtitle, { color: colors.textSecondary }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {daysLabel}
              </Text>
            </View>
            <View style={styles.right}>
              <Text style={[styles.amount, { color: colors.text }]} numberOfLines={1}>
                {formatMoney(s.amount, numberLocale)} {currencySymbol}
              </Text>
              <TouchableOpacity
                onPress={() => onAdd(s)}
                accessibilityLabel={t('addAction')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[
                  styles.iconBtn,
                  {
                    backgroundColor: colors.success,
                  },
                ]}
              >
                <Plus size={18} color="#FFFFFF" strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  void onIgnore(s);
                }}
                disabled={busyId === s.id}
                accessibilityLabel={t('dashboardIgnoreSuggestionA11y', { name: s.name })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[
                  styles.iconBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    borderWidth: StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
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
          <Text style={styles.toastText}>{t('dashboardSuggestionHiddenToast')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  header: { gap: 2 },
  title: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  meta: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600' },
  subtitle: { fontSize: 13, marginTop: 2 },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  amount: { fontSize: 15, fontWeight: '600', marginRight: 2 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toast: {
    marginTop: 2,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  toastText: { color: '#F9FAFB', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
