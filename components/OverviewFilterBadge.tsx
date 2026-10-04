import React from 'react';
import { Text, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useOverviewFilterLabel } from '@/hooks/use-filtered-transactions';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  style?: StyleProp<ViewStyle>;
  /** Světlý text na barevném headeru (expense/income detail). */
  onAccent?: boolean;
};

export function OverviewFilterBadge({ style, onAccent = false }: Props) {
  const label = useOverviewFilterLabel();
  const { colors, isDark } = useTheme();

  const bg = onAccent
    ? 'rgba(255,255,255,0.2)'
    : isDark
      ? 'rgba(255,255,255,0.08)'
      : 'rgba(0,0,0,0.06)';
  const textColor = onAccent ? '#ffffff' : colors.textSecondary;

  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: '100%',
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
  },
});
