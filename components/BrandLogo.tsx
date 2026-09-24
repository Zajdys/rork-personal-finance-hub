import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BrandMark from '@/components/BrandMark';
import { brand } from '@/constants/theme-colors';

type Props = {
  size?: number;
  theme?: 'light' | 'dark';
};

export default function BrandLogo({ size = 40, theme = 'light' }: Props) {
  const isDark = theme === 'dark';
  const markVariant = isDark ? 'white' : 'gradient';
  const moneyColor = isDark ? '#FFFFFF' : brand.ink;
  const buddyColor = isDark ? brand.violetLight : '#6D4FF0';
  const fontSize = Math.round(size * 0.55);

  return (
    <View style={styles.row}>
      <BrandMark size={size} variant={markVariant} />
      <Text style={[styles.wordmark, { fontSize, lineHeight: fontSize * 1.15 }]}>
        <Text style={{ fontWeight: '700', color: moneyColor }}>Money</Text>
        <Text style={{ fontWeight: '700', color: buddyColor }}>Buddy</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmark: {
    fontWeight: '700',
  },
});
