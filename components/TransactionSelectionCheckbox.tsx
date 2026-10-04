import React, { useCallback, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';

type Props = {
  selected: boolean;
  onPress: () => void;
};

export function TransactionSelectionCheckbox({ selected, onPress }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.1, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    onPress();
  }, [onPress, scale]);

  return (
    <Pressable onPress={handlePress} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}>
      <Animated.View style={[styles.circle, selected && styles.circleSelected, { transform: [{ scale }] }]}>
        {selected ? <Text style={styles.checkmark}>✓</Text> : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  circleSelected: {
    borderColor: '#6c47ff',
    backgroundColor: '#6c47ff',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 15,
  },
});
