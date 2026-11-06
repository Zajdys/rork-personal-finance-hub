import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { ChevronLeft, Mail, KeyRound } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth-store';
import { useLanguageStore } from '@/store/language-store';
import { useRegisterIntentStore } from '@/store/register-intent-store';
import { showToast } from '@/store/toast-store';

const GRADIENT_BG: [string, string, string] = ['#1a0533', '#120a3d', '#0d1b4b'];
const MUTED = 'rgba(255,255,255,0.55)';
const RESEND_COOLDOWN_SEC = 60;

/** Souhlas s marketingem — až po session (users řádek existuje). */
async function saveMarketingConsent(value: boolean): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: rows } = await supabase
        .from('users')
        .update({ marketing_consent: value, marketing_consent_at: new Date().toISOString() })
        .eq('id', uid)
        .select('id');
      if (rows && rows.length > 0) return;
      await new Promise((r) => setTimeout(r, 1500));
    }
  } catch (e) {
    console.warn('[verify-email] marketing consent', e);
  }
}

/**
 * Ověření e-mailu 6místným kódem po registraci / email_not_confirmed.
 */
export default function VerifyEmailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguageStore();
  const { completeEmailVerification } = useAuth();
  const params = useLocalSearchParams<{
    email?: string;
    name?: string;
    marketing?: string;
    resend?: string;
  }>();

  const email = typeof params.email === 'string' ? params.email.trim().toLowerCase() : '';
  const name = typeof params.name === 'string' ? params.name : '';
  const marketingOk = params.marketing === '1';

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialResendDone = useRef(false);

  const startCooldown = useCallback((seconds = RESEND_COOLDOWN_SEC) => {
    setCooldown(seconds);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const resendCode = useCallback(async () => {
    if (!email || cooldown > 0 || busy) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.resend({ type: 'signup', email });
    setBusy(false);
    if (err) {
      const msg = (err.message ?? '').toLowerCase();
      setError(
        msg.includes('rate') || msg.includes('seconds')
          ? t('auth.verifyResendWait')
          : t('auth.verifyResendFailed'),
      );
      return;
    }
    showToast({ type: 'success', message: t('auth.verifyResendSent') });
    startCooldown();
  }, [email, cooldown, busy, startCooldown, t]);

  // Po přihlášení s email_not_confirmed rovnou pošli nový kód.
  useEffect(() => {
    if (initialResendDone.current) return;
    if (params.resend !== '1' || !email) return;
    initialResendDone.current = true;
    void (async () => {
      const { error: err } = await supabase.auth.resend({ type: 'signup', email });
      if (!err) {
        showToast({ type: 'success', message: t('auth.verifyResendSent') });
        startCooldown();
      } else {
        // I při rate-limit začni odpočet, ať spam nezkouší.
        startCooldown();
      }
    })();
  }, [params.resend, email, startCooldown, t]);

  // Po registraci už Supabase poslal e-mail — začni cooldown.
  useEffect(() => {
    if (params.resend === '1') return;
    if (!email) return;
    startCooldown();
  }, [email, params.resend, startCooldown]);

  const confirm = async () => {
    const token = code.replace(/\s/g, '');
    if (token.length < 6) {
      setError(t('auth.verifyCodeRequired'));
      return;
    }
    setBusy(true);
    setError('');
    const result = await completeEmailVerification({ email, token, name });
    setBusy(false);
    if (!result.success) {
      setError(result.error || t('auth.verifyFailed'));
      return;
    }
    if (marketingOk) {
      void saveMarketingConsent(true);
    }
    showToast({ type: 'success', message: t('auth.verifySuccess') });
    // Gate rozhodne (welcome-tour / paywall); mírný push jen pokud intent není premium.
    if (useRegisterIntentStore.getState().intent !== 'premium') {
      router.replace('/welcome-tour');
    }
  };

  if (!email) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <LinearGradient colors={GRADIENT_BG} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
        <View style={[styles.content, { paddingTop: insets.top + 24 }]}>
          <Text style={styles.title}>{t('auth.verifyTitle')}</Text>
          <Text style={styles.subtitle}>{t('auth.verifyMissingEmail')}</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.replace('/auth?mode=login')}
          >
            <Text style={styles.primaryBtnText}>{t('auth.signIn')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={GRADIENT_BG} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            onPress={() => router.replace({ pathname: '/auth', params: { mode: 'login', email } })}
            style={styles.backBtn}
            hitSlop={12}
            accessibilityLabel={t('cancel')}
          >
            <ChevronLeft color="#fff" size={24} />
          </TouchableOpacity>

          <Text style={styles.title}>{t('auth.verifyTitle')}</Text>
          <Text style={styles.subtitle}>{t('auth.verifySubtitle', { email })}</Text>

          <View style={styles.inputRow}>
            <Mail color={MUTED} size={20} />
            <Text style={styles.emailReadonly} numberOfLines={1}>
              {email}
            </Text>
          </View>

          <View style={styles.inputRow}>
            <KeyRound color={MUTED} size={20} />
            <TextInput
              style={styles.input}
              placeholder={t('auth.verifyCodePlaceholder')}
              placeholderTextColor={MUTED}
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^\d]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              editable={!busy}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
            onPress={() => void confirm()}
            disabled={busy || code.replace(/\s/g, '').length < 6}
            activeOpacity={0.9}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>{t('auth.verifySubmit')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resendBtn}
            onPress={() => void resendCode()}
            disabled={busy || cooldown > 0}
          >
            <Text style={[styles.resendText, cooldown > 0 && { opacity: 0.5 }]}>
              {cooldown > 0
                ? t('auth.verifyResendCooldown', { seconds: cooldown })
                : t('auth.verifyResend')}
            </Text>
          </TouchableOpacity>

          <Text style={styles.hint}>{t('auth.verifyLinkHint')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d1b4b' },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  backBtn: { alignSelf: 'flex-start', padding: 4, marginBottom: 16 },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 10,
  },
  subtitle: {
    color: MUTED,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 28,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
  },
  emailReadonly: { flex: 1, color: 'rgba(255,255,255,0.85)', fontSize: 16 },
  input: { flex: 1, color: '#fff', fontSize: 22, letterSpacing: 8, fontWeight: '700' },
  error: { color: '#fca5a5', textAlign: 'center', marginBottom: 12, fontSize: 14 },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: '#7c3aed',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  resendBtn: { paddingVertical: 18, alignItems: 'center' },
  resendText: { color: '#c4b5fd', fontSize: 15, fontWeight: '600' },
  hint: {
    color: MUTED,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
  },
});
