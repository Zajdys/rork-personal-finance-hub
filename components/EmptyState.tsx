import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  title: string;
  description?: string;
  /** Lucide (nebo jiná) ikona — volitelná. */
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** Volitelná ikona v CTA (např. Upload). */
  actionIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  actionTestID?: string;
};

/**
 * Konzistentní empty stav: title + hint + primary CTA.
 * Používej jen když !loading && data jsou prázdná.
 */
export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  actionIcon,
  style,
  testID = 'empty-state',
  actionTestID,
}: Props) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        style,
      ]}
      testID={testID}
    >
      {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={onAction}
          activeOpacity={0.88}
          accessibilityRole="button"
          testID={actionTestID ?? `${testID}-action`}
        >
          {actionIcon}
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  iconWrap: {
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
