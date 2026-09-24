/**
 * Sdílené tlačítko Zpět — konzistentní chování napříč appkou.
 * Používá safeGoBack (canGoBack → back, jinak replace na tabs).
 */
import React from 'react';
import {
  Platform,
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { type Href } from 'expo-router';
import { safeGoBack, DEFAULT_BACK_FALLBACK } from '@/lib/safe-back';

export type BackButtonProps = {
  color?: string;
  size?: number;
  /** Href pro replace, když nelze jít zpět ve stacku. */
  fallback?: Href;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
  accessibilityLabel?: string;
  testID?: string;
};

export function BackButton({
  color = 'white',
  size = 24,
  fallback = DEFAULT_BACK_FALLBACK,
  onPress,
  style,
  hitSlop = 12,
  accessibilityLabel = 'Zpět',
  testID,
}: BackButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress ?? (() => safeGoBack(fallback))}
      style={[styles.btn, style]}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <ArrowLeft color={color} size={size} />
    </TouchableOpacity>
  );
}

/** Pro Stack `headerLeft` (nativní header Expo Router / React Navigation). */
export function StackHeaderBackButton({
  tintColor,
  fallback = DEFAULT_BACK_FALLBACK,
}: {
  tintColor?: string;
  fallback?: Href;
}) {
  return (
    <BackButton
      color={tintColor ?? (Platform.OS === 'ios' ? '#007AFF' : '#000')}
      size={24}
      fallback={fallback}
      style={styles.headerLeft}
    />
  );
}

const styles = StyleSheet.create({
  btn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLeft: {
    marginLeft: Platform.OS === 'ios' ? 4 : 0,
    marginRight: 4,
  },
});
