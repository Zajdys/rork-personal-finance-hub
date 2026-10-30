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
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Mail, KeyRound, Lock } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/store/toast-store';

const GRADIENT_BG: [string, string, string] = ['#1a0533', '#120a3d', '#0d1b4b'];
const MUTED = 'rgba(255,255,255,0.55)';

/**
 * Zapomenuté heslo přes 6místný kód z e-mailu (bez deep linků):
 * 1) resetPasswordForEmail → e-mail s kódem ({{ .Token }} v šabloně „Reset password“)
 * 2) verifyOtp(type: 'recovery') → přihlášení → updateUser({ password })
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sendCode = async () => {
    const e = email.trim().toLowerCase();
    if (!e.includes('@')) {
      setError('Zadej platný e-mail.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(e);
    setBusy(false);
    if (err) {
      const msg = (err.message ?? '').toLowerCase();
      setError(
        msg.includes('rate') || msg.includes('seconds')
          ? 'Kód jsme právě poslali. Zkus to znovu za minutu.'
          : 'Nepodařilo se odeslat e-mail. Zkus to prosím znovu.',
      );
      return;
    }
    // Z bezpečnostních důvodů neprozrazujeme, jestli účet existuje.
    setStep('code');
  };

  const confirm = async () => {
    const token = code.replace(/\s/g, '');
    if (token.length < 6) {
      setError('Zadej kód z e-mailu.');
      return;
    }
    if (password.length < 6) {
      setError('Nové heslo musí mít aspoň 6 znaků.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: vErr } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: 'recovery',
    });
    if (vErr) {
      setBusy(false);
      setError('Kód není správný nebo už vypršel. Nech si poslat nový.');
      return;
    }
    const { error: uErr } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (uErr) {
      setError('Heslo se nepodařilo změnit. Zkus to prosím znovu.');
      return;
    }
    showToast({ type: 'success', message: '✓ Heslo změněno, jsi přihlášený' });
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={GRADIENT_BG} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            onPress={() => (step === 'code' ? setStep('email') : router.back())}
            style={styles.backBtn}
            hitSlop={12}
            accessibilityLabel="Zpět"
          >
            <ChevronLeft color="#fff" size={24} />
          </TouchableOpacity>

          <Text style={styles.title}>{step === 'email' ? 'Zapomenuté heslo' : 'Nastav nové heslo'}</Text>
          <Text style={styles.subtitle}>
            {step === 'email'
              ? 'Zadej e-mail, se kterým se přihlašuješ. Pošleme ti 6místný kód.'
              : `Pokud k ${email.trim()} existuje účet, poslali jsme kód. Zkontroluj i spam.`}
          </Text>

          {step === 'email' ? (
            <View style={styles.inputOuter}>
              <Mail color="rgba(255,255,255,0.4)" size={20} />
              <TextInput
                style={styles.input}
                placeholder="E-mail"
                placeholderTextColor={MUTED}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                autoComplete="email"
              />
            </View>
          ) : (
            <>
              <View style={styles.inputOuter}>
                <KeyRound color="rgba(255,255,255,0.4)" size={20} />
                <TextInput
                  style={styles.input}
                  placeholder="Kód z e-mailu"
                  placeholderTextColor={MUTED}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={8}
                />
              </View>
              <View style={styles.inputOuter}>
                <Lock color="rgba(255,255,255,0.4)" size={20} />
                <TextInput
                  style={styles.input}
                  placeholder="Nové heslo (min. 6 znaků)"
                  placeholderTextColor={MUTED}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  autoComplete="password-new"
                />
              </View>
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            onPress={() => void (step === 'email' ? sendCode() : confirm())}
            disabled={busy}
            activeOpacity={0.9}
            style={{ marginTop: 8 }}
          >
            <LinearGradient
              colors={['#a855f7', '#7c3aed', '#6d28d9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryBtn}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>{step === 'email' ? 'Poslat kód' : 'Změnit heslo'}</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {step === 'code' ? (
            <TouchableOpacity onPress={() => void sendCode()} disabled={busy} style={styles.linkBtn}>
              <Text style={styles.linkText}>Poslat kód znovu</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d1b4b' },
  content: { paddingHorizontal: 24, flexGrow: 1 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: MUTED, fontSize: 15, lineHeight: 21, marginBottom: 24 },
  inputOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 14,
  },
  input: { flex: 1, color: '#fff', fontSize: 16 },
  error: { color: '#FCA5A5', fontSize: 14, marginBottom: 8 },
  primaryBtn: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  linkBtn: { alignItems: 'center', paddingVertical: 16 },
  linkText: { color: '#C4B5FD', fontSize: 15, fontWeight: '600' },
});
