import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/store/auth-store';
import { useLanguageStore } from '@/store/language-store';
import { useTheme } from '@/hooks/use-theme';
import { getBiometricsEnabled } from '@/lib/biometrics-storage';

async function promptUnlock(labels: {
  promptMessage: string;
  fallbackLabel: string;
  cancelLabel: string;
}): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: labels.promptMessage,
    fallbackLabel: labels.fallbackLabel,
    cancelLabel: labels.cancelLabel,
    disableDeviceFallback: false,
  });
  return r.success === true;
}

/**
 * Po návratu z pozadí (po stavu `background`) vyžádá biometrii, pokud je v nastavení zapnutá.
 */
export function BiometricAppLock() {
  const { isAuthenticated, hasActiveSubscription, user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useLanguageStore();
  const insets = useSafeAreaInsets();
  const [locked, setLocked] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  /** true po přechodu do background (ne jen inactive — např. Control Center). */
  const sawBackgroundRef = useRef(false);

  const fullAccess =
    isAuthenticated && hasActiveSubscription === true && user != null && user.onboardingCompleted === true;

  const authLabels = useMemo(
    () => ({
      promptMessage: t('biometricPromptMessage'),
      fallbackLabel: t('biometricFallbackLabel'),
      cancelLabel: t('cancel'),
    }),
    [t],
  );

  const tryUnlock = useCallback(async (): Promise<boolean> => {
    setRetryBusy(true);
    try {
      const ok = await promptUnlock(authLabels);
      if (ok) setLocked(false);
      return ok;
    } finally {
      setRetryBusy(false);
    }
  }, [authLabels]);

  useEffect(() => {
    if (Platform.OS === 'web' || !fullAccess) return;

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        sawBackgroundRef.current = true;
      }

      if (next !== 'active' || !sawBackgroundRef.current) return;
      sawBackgroundRef.current = false;

      void (async () => {
        const enabled = await getBiometricsEnabled();
        if (!enabled) return;
        const ok = await promptUnlock(authLabels);
        if (!ok) setLocked(true);
      })();
    });

    return () => sub.remove();
  }, [fullAccess, authLabels]);

  if (Platform.OS === 'web' || !fullAccess || !locked) {
    return null;
  }

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.wrap]} pointerEvents="auto">
      <BlurView intensity={isDark ? 55 : 70} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            marginTop: insets.top + 24,
            marginHorizontal: 20,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.text }]}>{t('biometricLockedTitle')}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          {t('biometricLockedSubtitle')}
        </Text>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary, opacity: retryBusy ? 0.7 : 1 }]}
          onPress={() => void tryUnlock()}
          disabled={retryBusy}
        >
          {retryBusy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.btnText, { color: colors.onPrimary }]}>{t('biometricRetry')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 9999,
    justifyContent: 'flex-start',
  },
  sheet: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
  },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  sub: { fontSize: 15, lineHeight: 22, marginBottom: 20 },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  btnText: { fontSize: 16, fontWeight: '700' },
});
