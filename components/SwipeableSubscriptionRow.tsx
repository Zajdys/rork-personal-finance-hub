import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Platform,
  Switch,
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
  onToggle: (on: boolean) => void;
  onDelete: (opts: { hideSuggestion: boolean }) => void | Promise<void>;
  onLongPress?: () => void;
  categoryPill: { bg: string; fg: string };
  formatDaysLeft: (days: number) => string;
};

export function SwipeableSubscriptionRow({
  subscription,
  currencySymbol,
  onPress,
  onToggle,
  onDelete,
  onLongPress,
  categoryPill,
  formatDaysLeft,
}: Props) {
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguageStore();
  const numberLocale = appLocale(language);
  const swipeRef = useRef<Swipeable>(null);
  const ui = getSubscriptionUiState(subscription);
  const dimmed = ui !== 'on';
  const daysLeft = daysUntilNextPayment(subscription.dayOfMonth);
  const daysLabel = formatDaysLeft(daysLeft);
  const amountColor = ui === 'on' ? colors.text : colors.textSecondary;

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
      <View
        style={[
          styles.subItemCard,
          {
            backgroundColor: colors.surface,
            shadowOpacity: isDark ? 0.35 : 0.06,
          },
        ]}
        testID={`sub-${subscription.id}`}
      >
        <RowTouchable
          style={styles.subItemMainTouch}
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={500}
          activeOpacity={0.7}
        >
          <BrandIcon merchantKey={subscription.name} size={48} isDimmed={dimmed} />
          <View style={styles.subMain}>
            <Text
              style={[styles.subName, { color: colors.text }, dimmed && styles.subTextMuted]}
              numberOfLines={2}
            >
              {subscription.name}
            </Text>
            {ui === 'paused' ? (
              <Text style={[styles.subPausedLabel, { color: colors.textSecondary }]}>
                {t('dashboardPaused')}
              </Text>
            ) : null}
            <View style={styles.subMetaRow}>
              <View style={[styles.categoryPillSoft, { backgroundColor: categoryPill.bg }]}>
                <Text
                  style={[styles.categoryPillSoftText, { color: categoryPill.fg }]}
                  numberOfLines={1}
                >
                  {subscription.category}
                </Text>
              </View>
              <Text style={[styles.subDaysSoft, { color: colors.textSecondary }]}>
                {daysLabel}
              </Text>
            </View>
          </View>
        </RowTouchable>
        <View style={styles.subRightColumn}>
          <Text style={[styles.subAmountLarge, { color: amountColor }]}>
            {formatMoney(subscription.amount, numberLocale)} {currencySymbol}
          </Text>
          <Switch
            value={ui === 'on'}
            onValueChange={onToggle}
            testID={`toggle-sub-${subscription.id}`}
            trackColor={{
              false: colors.muted,
              true: colors.success,
            }}
            thumbColor={
              Platform.OS === 'android'
                ? ui === 'on'
                  ? colors.onPrimary
                  : colors.muted
                : undefined
            }
            ios_backgroundColor={colors.muted}
          />
        </View>
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  subItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  subItemMainTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  subMain: { flex: 1, minWidth: 0 },
  subName: { fontSize: 16, fontWeight: '600' },
  subTextMuted: { opacity: 0.55 },
  subPausedLabel: { fontSize: 12, marginTop: 2 },
  subMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  categoryPillSoft: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  categoryPillSoftText: { fontSize: 11, fontWeight: '600' },
  subDaysSoft: { fontSize: 12 },
  subRightColumn: { alignItems: 'flex-end', gap: 8, marginLeft: 8 },
  subAmountLarge: { fontSize: 16, fontWeight: '700' },
  deleteActionWrap: {
    justifyContent: 'center',
    marginBottom: 10,
    marginLeft: 8,
  },
  deleteActionBtn: {
    minWidth: 88,
    height: '100%',
    borderRadius: 16,
    justifyContent: 'center',
  },
  deleteActionText: { fontSize: 14, fontWeight: '700' },
});
