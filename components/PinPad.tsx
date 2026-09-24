import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Delete } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

export function PinPad({ value, onChange, maxLength = 4 }: Props) {
  const { colors } = useTheme();
  const compact = maxLength > 4;

  const press = (key: string) => {
    if (key === 'del') {
      onChange(value.slice(0, -1));
    } else if (key !== '' && value.length < maxLength) {
      onChange(value + key);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.dots, compact && styles.dotsCompact]}>
        {Array.from({ length: maxLength }).map((_, i) => (
          <View
            key={i}
            style={[
              compact ? styles.dotSm : styles.dot,
              {
                backgroundColor: i < value.length ? colors.primary : 'transparent',
                borderColor: i < value.length ? colors.primary : colors.textSecondary,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.grid}>
        {KEYS.map((key, idx) => {
          if (key === '') {
            return <View key={idx} style={styles.keyEmpty} />;
          }
          return (
            <TouchableOpacity
              key={idx}
              style={[styles.key, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => press(key)}
              activeOpacity={0.7}
            >
              {key === 'del' ? (
                <Delete color={colors.text} size={20} />
              ) : (
                <Text style={[styles.keyText, { color: colors.text }]}>{key}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 28 },
  dots: { flexDirection: 'row', gap: 20 },
  dotsCompact: { gap: 12 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  dotSm: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
    width: 264,
  },
  key: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  keyEmpty: { width: 72, height: 72 },
  keyText: { fontSize: 24, fontWeight: '600' },
});
