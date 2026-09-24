/**
 * Full-screen PIN setup (enter → confirm). Used in onboarding and after PIN recovery.
 * PIN is never uploaded — caller saves via setAppLockPin / setAppLockEnabled.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { PinPad } from '@/components/PinPad';

const PIN_LENGTH = 4;

type Props = {
  /** Called with confirmed 4-digit PIN (local only — do not send to Supabase). */
  onComplete: (pin: string) => void;
  /** Override title (defaults to onboarding copy). */
  title?: string;
  subtitle?: string;
};

export function PinSetupFlow({ onComplete, title, subtitle }: Props) {
  const { colors } = useTheme();
  const { t } = useLanguageStore();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (step === 'enter' && first.length === PIN_LENGTH) {
      const id = setTimeout(() => {
        setError('');
        setStep('confirm');
      }, 150);
      return () => clearTimeout(id);
    }
    if (step === 'confirm' && second.length === PIN_LENGTH) {
      const id = setTimeout(() => {
        if (second === first) {
          onComplete(first);
        } else {
          setError(t('appLockPinMismatch'));
          setSecond('');
          setStep('enter');
          setFirst('');
        }
      }, 150);
      return () => clearTimeout(id);
    }
  }, [first, second, step, onComplete, t]);

  const isConfirm = step === 'confirm';

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingBottom: insets.bottom + 24 }]}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={[styles.header, { paddingTop: insets.top + 28 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.headerTitle}>
          {isConfirm
            ? t('appLockPinConfirmTitle')
            : title ?? t('onboardingPinTitle')}
        </Text>
        <Text style={styles.headerSub}>
          {isConfirm
            ? t('appLockPinConfirmSubtitle')
            : subtitle ?? t('onboardingPinSubtitle')}
        </Text>
      </LinearGradient>

      <View style={styles.body}>
        {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
        <PinPad
          value={isConfirm ? second : first}
          onChange={isConfirm ? setSecond : setFirst}
        />
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
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  error: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
});
