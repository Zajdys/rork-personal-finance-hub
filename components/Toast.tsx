import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  PanResponder,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Check, Info, XCircle } from 'lucide-react-native';
import { useToastStore, type ToastType } from '@/store/toast-store';

const ACCENT: Record<ToastType, string> = {
  success: '#22C55E',
  error: '#EF4444',
  info: '#3B82F6',
  warning: '#F59E0B',
};

function DefaultIcon({ type }: { type: ToastType }) {
  const color = '#fff';
  const size = 16;
  if (type === 'success') return <Check color={color} size={size} strokeWidth={3} />;
  if (type === 'error') return <XCircle color={color} size={size} />;
  if (type === 'warning') return <AlertTriangle color={color} size={size} />;
  return <Info color={color} size={size} />;
}

async function hapticFor(type: ToastType) {
  if (Platform.OS === 'web') return;
  try {
    const Haptics = await import('expo-haptics');
    if (type === 'success') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (type === 'error') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (type === 'warning') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      await Haptics.selectionAsync();
    }
  } catch {
    /* optional */
  }
}

/**
 * Globální toast — vykresli jednou v root layoutu.
 * Slide-down + fade, auto-dismiss, tap / swipe-up zavře.
 */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const visible = useToastStore((s) => s.visible);
  const message = useToastStore((s) => s.message);
  const type = useToastStore((s) => s.type);
  const icon = useToastStore((s) => s.icon);
  const durationMs = useToastStore((s) => s.durationMs);
  const token = useToastStore((s) => s.token);
  const hideToast = useToastStore((s) => s.hideToast);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-24)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const animateOut = (cb?: () => void) => {
    clearTimer();
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -24, duration: 180, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        hideToast();
        cb?.();
      }
    });
  };

  useEffect(() => {
    if (!visible) return;
    opacity.setValue(0);
    translateY.setValue(-24);
    void hapticFor(type);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 80,
      }),
    ]).start();
    clearTimer();
    timerRef.current = setTimeout(() => animateOut(), durationMs);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, token, durationMs, type]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_e, g) => {
        if (g.dy < -20 || g.vy < -0.4) animateOut();
      },
    }),
  ).current;

  if (!visible) return null;

  const accent = ACCENT[type];

  return (
    <View pointerEvents="box-none" style={[styles.host, { paddingTop: Math.max(insets.top, 8) + 6 }]}>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.bar,
          {
            opacity,
            transform: [{ translateY }],
            borderLeftColor: accent,
          },
        ]}
      >
        <Pressable onPress={() => animateOut()} style={styles.pressable} accessibilityRole="alert">
          <View style={[styles.iconWrap, { backgroundColor: accent }]}>
            {icon ? (
              <Text style={styles.emojiIcon}>{icon}</Text>
            ) : (
              <DefaultIcon type={type} />
            )}
          </View>
          <Text style={styles.message} numberOfLines={2}>
            {message}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: 'rgba(17, 24, 39, 0.94)',
    borderRadius: 14,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiIcon: { fontSize: 14 },
  message: {
    flex: 1,
    color: '#F9FAFB',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
});
