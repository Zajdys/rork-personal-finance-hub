/**
 * Změna hesla přímo v appce (Profil → Soukromí a bezpečnost → Změnit heslo).
 * Ověří současné heslo, pak supabase.auth.updateUser({ password }).
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Eye, EyeOff, Lock, KeyRound } from 'lucide-react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth-store';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/store/toast-store';
import { useLanguageStore } from '@/store/language-store';
import { PASSWORD_MIN_LENGTH, validateRegistrationPassword } from '@/lib/password-validation';

const MIN_LEN = PASSWORD_MIN_LENGTH;

export default function ChangePasswordScreen() {
  const { colors } = useTheme();
  const { tr } = useLanguageStore();
  const router = useRouter();
  const { user } = useAuth();
  const email = user?.email ?? '';
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canSave = current.length > 0 && next.length >= MIN_LEN && confirm.length > 0 && !busy;

  const save = async () => {
    setError('');
    const pwdErr = validateRegistrationPassword(next);
    if (pwdErr) return setError(pwdErr);
    if (next !== confirm) return setError(tr('Nová hesla se neshodují.', 'The new passwords don’t match.'));
    if (next === current) return setError(tr('Nové heslo je stejné jako současné.', 'The new password is the same as the current one.'));
    if (!email) return setError(tr('Nepodařilo se zjistit e-mail účtu. Odhlas se a přihlas znovu.', 'Couldn’t get your account e-mail. Sign out and sign in again.'));
    setBusy(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password: current });
      if (signErr) {
        setError(tr('Současné heslo není správně.', 'Your current password is incorrect.'));
        return;
      }
      const { error: upErr } = await supabase.auth.updateUser({ password: next });
      if (upErr) {
        const msg = upErr.message.toLowerCase();
        if (msg.includes('weak') || msg.includes('short')) setError(tr('Heslo je moc slabé. Zkus delší nebo složitější.', 'The password is too weak. Try a longer or more complex one.'));
        else if (msg.includes('same')) setError(tr('Nové heslo je stejné jako současné.', 'The new password is the same as the current one.'));
        else setError(tr('Heslo se nepodařilo změnit. Zkus to prosím znovu.', 'Couldn’t change the password. Please try again.'));
        return;
      }
      showToast({ type: 'success', message: tr('✓ Heslo změněno', '✓ Password changed') });
      router.back();
    } finally {
      setBusy(false);
    }
  };

  const Field = ({
    label,
    value,
    onChange,
    placeholder,
    autoComplete,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    autoComplete: 'current-password' | 'new-password';
  }) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Lock color={colors.textSecondary} size={18} />
        <TextInput
          value={value}
          onChangeText={(v) => {
            onChange(v);
            if (error) setError('');
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={autoComplete === 'current-password' ? 'password' : 'newPassword'}
          style={[styles.input, { color: colors.text }]}
        />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={tr('Změnit heslo', 'Change password')} subtitle={email || tr('Tvůj účet', 'Your account')} variant="gradient" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          {Field({ label: tr('Současné heslo', 'Current password'), value: current, onChange: setCurrent, placeholder: tr('Zadej současné heslo', 'Enter your current password'), autoComplete: 'current-password' })}
          {Field({ label: tr('Nové heslo', 'New password'), value: next, onChange: setNext, placeholder: tr(`Aspoň ${MIN_LEN} znaků, písmeno a číslice`, `${MIN_LEN}+ characters, a letter and a digit`), autoComplete: 'new-password' })}
          {Field({ label: tr('Nové heslo znovu', 'Repeat new password'), value: confirm, onChange: setConfirm, placeholder: tr('Pro kontrolu', 'To confirm'), autoComplete: 'new-password' })}

          <TouchableOpacity onPress={() => setShow((v) => !v)} style={styles.showRow} accessibilityRole="button">
            {show ? <EyeOff color={colors.primary} size={18} /> : <Eye color={colors.primary} size={18} />}
            <Text style={{ color: colors.primary, fontWeight: '600' }}>{show ? tr('Skrýt hesla', 'Hide passwords') : tr('Zobrazit hesla', 'Show passwords')}</Text>
          </TouchableOpacity>

          {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

          <TouchableOpacity
            onPress={() => void save()}
            disabled={!canSave}
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: canSave ? 1 : 0.45 }]}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{tr('Uložit nové heslo', 'Save new password')}</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push({ pathname: '/forgot-password', params: { email } })}
            style={styles.forgotRow}
            accessibilityRole="button"
          >
            <KeyRound color={colors.textSecondary} size={16} />
            <Text style={{ color: colors.textSecondary }}>{tr('Nepamatuješ si současné heslo? Pošleme ti kód na e-mail.', 'Don’t remember your current password? We’ll e-mail you a code.')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 16, paddingVertical: 14 },
  showRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  error: { marginTop: 10, fontSize: 14, fontWeight: '600' },
  saveBtn: { marginTop: 18, paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  forgotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, paddingHorizontal: 4 },
});
