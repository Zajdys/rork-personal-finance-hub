import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronUp, ChevronDown } from 'lucide-react-native';
import { useLanguageStore } from '@/store/language-store';

type Props = {
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  color: string;
};

export function ListOrderArrows({ onMoveUp, onMoveDown, canMoveUp, canMoveDown, color }: Props) {
  const { t } = useLanguageStore();

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={onMoveUp}
        disabled={!canMoveUp}
        style={styles.btn}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityLabel={t('listOrderMoveUp')}
      >
        <ChevronUp color={color} size={20} opacity={canMoveUp ? 1 : 0.35} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onMoveDown}
        disabled={!canMoveDown}
        style={styles.btn}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityLabel={t('listOrderMoveDown')}
      >
        <ChevronDown color={color} size={20} opacity={canMoveDown ? 1 : 0.35} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 4,
    gap: 2,
  },
  btn: {
    padding: 2,
  },
});
