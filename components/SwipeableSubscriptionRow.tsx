import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
  TouchableOpacity as RNTouchableOpacity,
} from 'react-native';
import { Swipeable, TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import type { SubscriptionItem } from '@/store/finance-store';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { BrandIcon } from '@/components/BrandIcon';
import {
  daysUntilNextPayment,
  getSubscriptionUiState,
} from '@/lib/subscription-helpers';
import { appLocale } from '@/lib/app-locale';
import { formatMoney } from '@/lib/format-money';
import { AsyncButton } from '@/components/AsyncButton';

const RowTouchable = Platform.OS === 'web' ? RNTouchableOpacity : GHTouchableOpacity;

type Props = {
  subscription: SubscriptionItem;
  currencySymbol: string;
  onPress: () => void;
  onDelete: (opts: { hideSuggestion: boolean }) => void | Promise<void>;
  onLongPress?: () => void;
  formatDaysLeft: (days: number) => string;
};

export function SwipeableSubscriptionRow({
  subscription,
  currencySymbol,
  onPress,
  onDelete,
  onLongPress,
  formatDaysLeft,
}: Props) {
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguageStore();
  const numberLocale = appLocale(language);
  const swipeRef = useRef<Swipeable>(null);
  const ui = getSubscriptionUiState(subscription);
  const paused = ui === 'paused';
  const dimmed = ui !== 'on';
  const daysLeft = daysUntilNextPayment(subscription.dayOfMonth);
  const freqLabel =
    subscription.frequency === 'yearly'
      ? t('subscription.freqYearly')
      : t('subscription.freqMonthly');
  const subtitle = paused
    ? t('dashboardPaused')
    : `${formatDaysLeft(daysLeft)} · ${freqLabel.toLowerCase()}`;
  const amountColor = dimmed ? colors.textSecondary : colors.text;

  const confirmDelete = useCallback(() => {
    swipeRef.current?.close();
    Alert.alert(t('subscription.deleteTitle'), t('subscription.deleteConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('subscription.deleteKeepSuggestion'),
        style: 'destructive',
        onPress: () => {
          void onDelete({ hideSuggestion: false });
        },
      },
      {
        text: t('subscription.deleteAndHide'),
        style: 'destructive',
        onPress: () => {
          void onDelete({ hideSuggestion: true });
        },
      },
    ]);
  }, [onDelete, t]);

  const renderRightActions = useCallback(() => {
    return (
      <View style={styles.deleteActionWrap}>
        <AsyncButton
          label={t('delete')}
          loadingLabel="…"
          variant="danger"
          onPress={async () => {
            confirmDelete();
          }}
          style={styles.deleteActionBtn}
          contentStyle={styles.deleteActionContent}
          textStyle={styles.deleteActionText}
        />
      </View>
    );
  }, [confirmDelete, t]);

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
    >
      <RowTouchable
        style={[
          styles.row,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowOpacity: isDark ? 0.25 : 0.04,
          },
          dimmed && styles.rowDimmed,
        ]}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={500}
        activeOpacity={0.7}
        testID={`sub-${subscription.id}`}
      >
        <BrandIcon merchantKey={subscription.name} size={40} isDimmed={dimmed} />
        <View style={styles.meta}>
          <Text
            style={[styles.name, { color: colors.text }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {subscription.name}
          </Text>
          <Text
            style={[styles.subtitle, { color: colors.textSecondary }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {subtitle}
          </Text>
        </View>
        <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
          {formatMoney(subscription.amount, numberLocale)} {currencySymbol}
        </Text>
      </RowTouchable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  rowDimmed: { opacity: 0.5 },
  meta: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600' },
  subtitle: { fontSize: 13, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: '600', flexShrink: 0 },
  deleteActionWrap: {
    justifyContent: 'center',
    marginBottom: 8,
    marginLeft: 8,
  },
  deleteActionBtn: {
    minWidth: 84,
    borderRadius: 14,
    justifyContent: 'center',
  },
  deleteActionContent: {
    paddingVertical: 18,
    paddingHorizontal: 14,
  },
  deleteActionText: { fontSize: 14, fontWeight: '700' },
});
