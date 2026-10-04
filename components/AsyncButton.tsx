/**
 * Tlačítko s ochranou proti dvojkliku (useAsyncAction).
 * Varianty odpovídají běžným submit stylům v appce.
 */
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAsyncAction } from '@/hooks/use-async-action';

export type AsyncButtonVariant = 'primary' | 'success' | 'danger' | 'solid';

const GRADIENTS: Record<Exclude<AsyncButtonVariant, 'solid'>, [string, string]> = {
  primary: ['#667eea', '#764ba2'],
  success: ['#10B981', '#059669'],
  danger: ['#EF4444', '#DC2626'],
};

const DISABLED_GRADIENT: [string, string] = ['#9CA3AF', '#6B7280'];

export type AsyncButtonProps = {
  onPress: () => void | Promise<void>;
  label: string;
  /** Výchozí „Ukládám…“ */
  loadingLabel?: string;
  variant?: AsyncButtonVariant;
  /** Pro variant="solid" */
  solidColor?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  onError?: (error: unknown) => void;
  testID?: string;
  accessibilityLabel?: string;
};

export function AsyncButton({
  onPress,
  label,
  loadingLabel = 'Ukládám…',
  variant = 'primary',
  solidColor = '#667eea',
  disabled = false,
  style,
  contentStyle,
  textStyle,
  onError,
  testID,
  accessibilityLabel,
}: AsyncButtonProps) {
  const { run, isRunning } = useAsyncAction(async () => {
    await onPress();
  }, { onError });

  const blocked = disabled || isRunning;

  const colors = useMemo((): [string, string] => {
    if (blocked && variant !== 'solid') return DISABLED_GRADIENT;
    if (variant === 'solid') return [solidColor, solidColor];
    return GRADIENTS[variant];
  }, [blocked, variant, solidColor]);

  return (
    <TouchableOpacity
      style={[styles.wrap, blocked && styles.wrapDisabled, style]}
      onPress={() => {
        void run();
      }}
      disabled={blocked}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: blocked, busy: isRunning }}
      testID={testID}
    >
      <LinearGradient
        colors={colors}
        style={[styles.gradient, contentStyle]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        {isRunning ? (
          <View style={styles.row}>
            <ActivityIndicator color="#FFFFFF" size="small" />
            <Text style={[styles.text, textStyle]}>{loadingLabel}</Text>
          </View>
        ) : (
          <Text style={[styles.text, textStyle]}>{label}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  wrapDisabled: {
    opacity: 0.85,
  },
  gradient: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
