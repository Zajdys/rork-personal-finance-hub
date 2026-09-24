/**
 * Optional biometric unlock opt-in (after mandatory PIN).
 * Skipped by parent when hardware/enrollment is unavailable.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as LocalAuthentication from 'expo-local-authentication';
import { Fingerprint, ScanFace } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { setBiometricsEnabled } from '@/lib/biometrics-storage';

type Props = {
  onDone: () => void;
};

export async function resolveBiometricLabel(language: string): Promise<{
  available: boolean;
  label: string;
  isFace: boolean;
}> {
  if (Platform.OS === 'web') {
    return { available: false, label: '', isFace: false };
  }
  const [hw, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  if (!hw || !enrolled) {
    return { available: false, label: '', isFace: false };
  }
  const isFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const label = isFace
    ? 'Face ID'
    : language === 'cs'
      ? 'otiskem prstu'
      : 'fingerprint';
  return { available: true, label, isFace };
}

export function BiometricOptIn({ onDone }: Props) {
  const { colors } = useTheme();
  const { t, language } = useLanguageStore();
  const insets = useSafeAreaInsets();
  const [label, setLabel] = useState('Face ID');
  const [isFace, setIsFace] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void resolveBiometricLabel(language).then((r) => {
      if (!r.available) {
        onDone();
        return;
      }
      setLabel(r.label);
      setIsFace(r.isFace);
    });
  }, [language, onDone]);

  const enable = async () => {
    setBusy(true);
    try {
      const r = await LocalAuthentication.authenticateAsync({
        promptMessage: t('privacyConfirmEnable'),
        fallbackLabel: t('biometricFallbackLabel'),
        cancelLabel: t('cancel'),
        disableDeviceFallback: false,
      });
      if (r.success) {
        await setBiometricsEnabled(true);
        onDone();
      }
    } finally {
      setBusy(false);
    }
  };

  const Icon = isFace ? ScanFace : Fingerprint;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingBottom: insets.bottom + 24 }]}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={[styles.header, { paddingTop: insets.top + 28 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.headerTitle}>{t('onboardingBioTitle')}</Text>
        <Text style={styles.headerSub}>
          {t('onboardingBioSubtitle', { method: label })}
        </Text>
      </LinearGradient>

      <View style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: colors.muted }]}>
          <Icon color={colors.primary} size={48} />
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]}
          onPress={() => void enable()}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.primaryText, { color: colors.onPrimary }]}>
              {t('onboardingBioAllow')}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={onDone} disabled={busy}>
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>
            {t('onboardingBioSkip')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  headerTitle: {
    color: 'white',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    lineHeight: 22,
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: 'center',
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  primaryBtn: {
    alignSelf: 'stretch',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  primaryText: { fontSize: 16, fontWeight: '700' },
  skipBtn: { marginTop: 20, padding: 12 },
  skipText: { fontSize: 15, fontWeight: '600' },
});
