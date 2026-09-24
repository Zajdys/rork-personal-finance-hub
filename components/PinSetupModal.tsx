/**
 * PinSetupModal — modal for first-time PIN creation (two-step confirm).
 * Called when enabling the app lock and biometrics are not available or user
 * chose to set a PIN.
 *
 * Props:
 *   visible  — show/hide
 *   onDone   — called with the confirmed PIN string after both steps succeed
 *   onCancel — user dismissed without setting a PIN
 */
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { PinPad } from '@/components/PinPad';

interface Props {
  visible: boolean;
  onDone: (pin: string) => void;
  onCancel: () => void;
}

const PIN_LENGTH = 4;

export function PinSetupModal({ visible, onDone, onCancel }: Props) {
  const { colors } = useTheme();
  const { t } = useLanguageStore();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [error, setError] = useState('');

  // Reset on open/close
  useEffect(() => {
    if (!visible) {
      setStep('enter');
      setFirst('');
      setSecond('');
      setError('');
    }
  }, [visible]);

  // Auto-advance when 4 digits entered
  useEffect(() => {
    if (step === 'enter' && first.length === PIN_LENGTH) {
      // small delay so user sees last dot filled
      const id = setTimeout(() => {
        setStep('confirm');
      }, 150);
      return () => clearTimeout(id);
    }
    if (step === 'confirm' && second.length === PIN_LENGTH) {
      const id = setTimeout(() => {
        if (second === first) {
          onDone(first);
        } else {
          setError(t('appLockPinMismatch'));
          setSecond('');
        }
      }, 150);
      return () => clearTimeout(id);
    }
  }, [first, second, step, onDone, t]);

  const isConfirm = step === 'confirm';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              paddingBottom: insets.bottom + 28,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              {isConfirm ? t('appLockPinConfirmTitle') : t('appLockPinSetupTitle')}
            </Text>
            <TouchableOpacity onPress={onCancel} hitSlop={12}>
              <X color={colors.textSecondary} size={22} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {isConfirm ? t('appLockPinConfirmSubtitle') : t('appLockPinSetupSubtitle')}
          </Text>

          {error ? (
            <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
          ) : null}

          <View style={styles.padWrap}>
            <PinPad
              value={isConfirm ? second : first}
              onChange={isConfirm ? setSecond : setFirst}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  error: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  padWrap: { marginTop: 20 },
});
