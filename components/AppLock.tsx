/**
 * AppLock — device lock overlay (PIN + optional biometrics).
 *
 * CRITICAL: locks ONLY when a real PIN exists in SecureStore.
 * Legacy biometrics_enabled / app_lock_enabled without PIN must NOT lock.
 *
 * - Locks on cold start and when returning from background after grace period (if PIN is set).
 * - Biometrics first when enabled AND PIN exists; PIN fallback always available.
 * - Accounts without PIN: soft one-time “set PIN” prompt (never hard lock).
 * - “Forgot PIN” → email OTP → clear local secrets → set new PIN.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fingerprint, KeyRound, Shield } from 'lucide-react-native';

import { useAuth } from '@/store/auth-store';
import { useLanguageStore } from '@/store/language-store';
import { useTheme } from '@/hooks/use-theme';
import { clearDeviceSecurity, getBiometricsEnabled } from '@/lib/biometrics-storage';
import {
  getAppLockEnabled,
  getAppLockPin,
  hasAppLockPin,
  setAppLockEnabled,
  setAppLockPin,
  shouldEngageAppLock,
} from '@/lib/app-lock-storage';
import { PinPad } from '@/components/PinPad';
import { PinSetupFlow } from '@/components/PinSetupFlow';
import { BiometricOptIn, resolveBiometricLabel } from '@/components/BiometricOptIn';
import { supabase } from '@/lib/supabase';

const PIN_LENGTH = 4;
const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 30;
/** Po návratu z pozadí pod tímto prahem se appka nezamyká (krátký odskok). */
const LOCK_GRACE_PERIOD_MS = 30_000;
/** Jednorázový prompt „nastavte PIN“ pro účty bez PIN (ne vynucení). */
const PIN_SETUP_PROMPT_DISMISSED_KEY = 'app_lock_setup_prompt_dismissed';

type LockMode = 'unlock' | 'recover' | 'resetPin';
type SoftPrompt = 'none' | 'offer' | 'setupPin' | 'setupBio';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0] ?? ''}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

async function biometricsAvailable(): Promise<{
  ok: boolean;
  hasHardware: boolean;
  enrolled: boolean;
}> {
  if (Platform.OS === 'web') {
    return { ok: false, hasHardware: false, enrolled: false };
  }
  const [hasHardware, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return { ok: hasHardware && enrolled, hasHardware, enrolled };
}

async function tryBiometrics(labels: {
  promptMessage: string;
  fallbackLabel: string;
  cancelLabel: string;
}): Promise<{ success: boolean; error?: string; warning?: string }> {
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: labels.promptMessage,
    fallbackLabel: labels.fallbackLabel,
    cancelLabel: labels.cancelLabel,
    disableDeviceFallback: true,
  });
  if (r.success) return { success: true };
  return {
    success: false,
    error: 'error' in r ? String(r.error ?? '') : undefined,
    warning: 'warning' in r ? String(r.warning ?? '') : undefined,
  };
}

export function AppLock() {
  const { isAuthenticated, hasActiveSubscription, user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguageStore();
  const insets = useSafeAreaInsets();

  const [locked, setLocked] = useState(false);
  const [mode, setMode] = useState<LockMode>('unlock');
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [bioBusy, setBioBusy] = useState(false);
  /** Biometrie jen když je PIN + příznak — jinak tlačítko nezobrazovat. */
  const [bioUnlockAvailable, setBioUnlockAvailable] = useState(false);

  const [softPrompt, setSoftPrompt] = useState<SoftPrompt>('none');

  // Recovery OTP state
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const didInitialCheckRef = useRef(false);
  /** Čas odchodu do background — pro grace period při návratu. */
  const backgroundedAtRef = useRef<number | null>(null);

  const fullAccess =
    isAuthenticated && hasActiveSubscription === true && user != null && user.onboardingCompleted === true;

  const userEmail = (user?.email ?? '').trim().toLowerCase();
  const maskedEmail = userEmail ? maskEmail(userEmail) : '';

  const bioLabels = useMemo(
    () => ({
      promptMessage: t('biometricPromptMessage'),
      fallbackLabel: t('appLockPinBtn'),
      cancelLabel: t('cancel'),
    }),
    [t],
  );

  const attemptBiometrics = useCallback(
    async (opts?: { silent?: boolean }): Promise<boolean> => {
      const silent = opts?.silent === true;
      setBioBusy(true);
      try {
        const hasPin = await hasAppLockPin();
        if (!hasPin) {
          if (!silent) Alert.alert(t('error'), t('appLockBioNoPin'));
          return false;
        }

        const enabled = await getBiometricsEnabled();
        if (!enabled) {
          if (!silent) Alert.alert(t('error'), t('appLockBioNotEnabled'));
          return false;
        }

        const avail = await biometricsAvailable();
        if (!avail.hasHardware) {
          if (!silent) Alert.alert(t('privacyNotAvailable'), t('privacyBioNotSupported'));
          return false;
        }
        if (!avail.enrolled) {
          if (!silent) Alert.alert(t('privacyNotSetUp'), t('privacyBioNotConfigured'));
          return false;
        }

        const result = await tryBiometrics(bioLabels);
        if (!result.success) {
          const cancelled =
            result.error === 'user_cancel' ||
            result.error === 'system_cancel' ||
            result.error === 'app_cancel';
          if (!silent && !cancelled && result.error) {
            Alert.alert(t('error'), t('appLockBioFailed', { reason: result.error }));
          }
          return false;
        }
        return true;
      } catch (err) {
        if (!silent) {
          Alert.alert(
            t('error'),
            err instanceof Error ? err.message : t('appLockBioFailed', { reason: 'unknown' }),
          );
        }
        return false;
      } finally {
        setBioBusy(false);
      }
    },
    [bioLabels, t],
  );

  const unlock = useCallback(() => {
    setLocked(false);
    setMode('unlock');
    setShowPin(false);
    setPin('');
    setPinError('');
    setOtpSent(false);
    setOtp('');
    setOtpError('');
  }, []);

  const onBiometricsPress = useCallback(() => {
    void (async () => {
      const ok = await attemptBiometrics({ silent: false });
      if (ok) unlock();
      else setShowPin(true);
    })();
  }, [attemptBiometrics, unlock]);

  const maybeShowSoftPinPrompt = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const dismissed = await AsyncStorage.getItem(PIN_SETUP_PROMPT_DISMISSED_KEY);
    if (dismissed === 'true') return;
    setSoftPrompt('offer');
  }, []);

  const dismissSoftPrompt = useCallback(async () => {
    await AsyncStorage.setItem(PIN_SETUP_PROMPT_DISMISSED_KEY, 'true');
    setSoftPrompt('none');
  }, []);

  const runLockCheck = useCallback(async () => {
    // Pouze skutečný PIN v SecureStore — ne flagy enabled/biometrics
    const engage = await shouldEngageAppLock();
    if (!engage) {
      // Orphan flagy (starý bio toggle bez PIN) — uklidit, ať se bug nevrátí
      const [enabled, bio] = await Promise.all([getAppLockEnabled(), getBiometricsEnabled()]);
      if (enabled || bio) {
        await clearDeviceSecurity();
      }
      setLocked(false);
      setBioUnlockAvailable(false);
      return;
    }

    const bioOn = await getBiometricsEnabled();
    const avail = await biometricsAvailable();
    // Tlačítko jen když flag + hardware/enrollment (jinak by „nic nedělalo“)
    const showBioBtn = bioOn && avail.ok;
    setBioUnlockAvailable(showBioBtn);
    setLocked(true);
    setMode('unlock');
    setShowPin(false);
    setPin('');
    setPinError('');

    if (showBioBtn) {
      const bioOk = await attemptBiometrics({ silent: true });
      if (bioOk) {
        unlock();
        return;
      }
    }
    // Bez biometrie (nebo po neúspěchu) → PIN pad. Bez PIN by se sem vůbec nedostalo.
    setShowPin(true);
  }, [attemptBiometrics, unlock]);

  // Cold start / first fullAccess
  useEffect(() => {
    if (!fullAccess) {
      didInitialCheckRef.current = false;
      return;
    }
    if (Platform.OS === 'web' || didInitialCheckRef.current) return;
    didInitialCheckRef.current = true;
    void (async () => {
      const hasPin = await hasAppLockPin();
      if (!hasPin) {
        const [enabled, bio] = await Promise.all([getAppLockEnabled(), getBiometricsEnabled()]);
        if (enabled || bio) await clearDeviceSecurity();
        setLocked(false);
        await maybeShowSoftPinPrompt();
        return;
      }
      await runLockCheck();
    })();
  }, [fullAccess, runLockCheck, maybeShowSoftPinPrompt]);

  // Background → foreground (grace period — krátký odskok nezamyká)
  useEffect(() => {
    if (Platform.OS === 'web' || !fullAccess) return;

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        backgroundedAtRef.current = Date.now();
        return;
      }
      if (next !== 'active') return;

      const bgAt = backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      if (bgAt == null) return;

      const elapsed = Date.now() - bgAt;
      if (elapsed < LOCK_GRACE_PERIOD_MS) return;

      void runLockCheck();
    });

    return () => sub.remove();
  }, [fullAccess, runLockCheck]);

  // Verify unlock PIN
  useEffect(() => {
    if (!showPin || mode !== 'unlock' || pin.length !== PIN_LENGTH) return;
    const id = setTimeout(async () => {
      const storedPin = await getAppLockPin();
      if (storedPin && pin === storedPin) {
        unlock();
      } else {
        setPinError(t('appLockPinWrong'));
        setPin('');
      }
    }, 150);
    return () => clearTimeout(id);
  }, [pin, showPin, mode, unlock, t]);

  // Resend cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const sendOtp = useCallback(async () => {
    if (!userEmail) {
      setOtpError(t('pinRecoveryNoEmail'));
      return;
    }
    if (cooldown > 0) return;
    setOtpBusy(true);
    setOtpError('');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: userEmail,
        options: { shouldCreateUser: false },
      });
      if (error) {
        setOtpError(error.message || t('pinRecoverySendFailed'));
        return;
      }
      setOtpSent(true);
      setOtp('');
      setCooldown(RESEND_COOLDOWN_SEC);
    } catch {
      setOtpError(t('pinRecoverySendFailed'));
    } finally {
      setOtpBusy(false);
    }
  }, [userEmail, cooldown, t]);

  const verifyOtp = useCallback(
    async (token: string) => {
      if (!userEmail) return;
      setOtpBusy(true);
      setOtpError('');
      try {
        const { error } = await supabase.auth.verifyOtp({
          email: userEmail,
          token,
          type: 'email',
        });
        if (error) {
          setOtpError(t('pinRecoveryInvalid'));
          setOtp('');
          return;
        }
        await clearDeviceSecurity();
        setMode('resetPin');
        setOtp('');
        setOtpSent(false);
      } catch {
        setOtpError(t('pinRecoveryInvalid'));
        setOtp('');
      } finally {
        setOtpBusy(false);
      }
    },
    [userEmail, t],
  );

  useEffect(() => {
    if (mode !== 'recover' || !otpSent || otp.length !== OTP_LENGTH || otpBusy) return;
    void verifyOtp(otp);
  }, [otp, mode, otpSent, otpBusy, verifyOtp]);

  const handleNewPin = useCallback(
    async (newPin: string) => {
      await setAppLockPin(newPin);
      await setAppLockEnabled(true);
      await AsyncStorage.setItem(PIN_SETUP_PROMPT_DISMISSED_KEY, 'true');
      unlock();
    },
    [unlock],
  );

  const handleSoftPinComplete = useCallback(
    async (newPin: string) => {
      await setAppLockPin(newPin);
      await setAppLockEnabled(true);
      await AsyncStorage.setItem(PIN_SETUP_PROMPT_DISMISSED_KEY, 'true');
      const bio = await resolveBiometricLabel(language);
      if (bio.available) {
        setSoftPrompt('setupBio');
      } else {
        setSoftPrompt('none');
      }
    },
    [language],
  );

  // Soft setup / offer — accounts without PIN
  if (Platform.OS !== 'web' && fullAccess && softPrompt !== 'none' && !locked) {
    if (softPrompt === 'setupPin') {
      return (
        <View style={[StyleSheet.absoluteFillObject, styles.wrap]} pointerEvents="auto">
          <PinSetupFlow onComplete={(p) => void handleSoftPinComplete(p)} />
        </View>
      );
    }
    if (softPrompt === 'setupBio') {
      return (
        <View style={[StyleSheet.absoluteFillObject, styles.wrap]} pointerEvents="auto">
          <BiometricOptIn onDone={() => setSoftPrompt('none')} />
        </View>
      );
    }
    // offer
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => void dismissSoftPrompt()}>
        <View style={[styles.promptRoot, { backgroundColor: colors.overlay ?? 'rgba(0,0,0,0.45)' }]}>
          <View
            style={[
              styles.promptCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                marginBottom: insets.bottom + 24,
              },
            ]}
          >
            <View style={[styles.promptIcon, { backgroundColor: colors.muted }]}>
              <Shield color={colors.primary} size={28} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{t('appLockSetupPromptTitle')}</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              {t('appLockSetupPromptBody')}
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => setSoftPrompt('setupPin')}
            >
              <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
                {t('appLockSetupPromptCta')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.forgotBtn} onPress={() => void dismissSoftPrompt()}>
              <Text style={[styles.forgotText, { color: colors.textSecondary }]}>
                {t('appLockSetupPromptLater')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  if (Platform.OS === 'web' || !fullAccess || !locked) return null;

  if (mode === 'resetPin') {
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.wrap]} pointerEvents="auto">
        <PinSetupFlow
          onComplete={(p) => void handleNewPin(p)}
          title={t('onboardingPinResetTitle')}
          subtitle={t('onboardingPinResetSubtitle')}
        />
      </View>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.wrap]} pointerEvents="auto">
      <BlurView
        intensity={isDark ? 55 : 70}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFillObject}
      />

      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            marginTop: insets.top + 24,
            marginHorizontal: 20,
            paddingBottom: insets.bottom + 16,
            maxHeight: '92%',
          },
        ]}
      >
        {mode === 'recover' ? (
          <>
            <Text style={[styles.title, { color: colors.text }]}>{t('pinRecoveryTitle')}</Text>
            {!otpSent ? (
              <>
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  {t('pinRecoveryIntro')}
                </Text>
                <Text style={[styles.emailHint, { color: colors.text }]}>{maskedEmail || '—'}</Text>
                {otpError ? (
                  <Text style={[styles.pinError, { color: colors.error }]}>{otpError}</Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: otpBusy ? 0.7 : 1 }]}
                  onPress={() => void sendOtp()}
                  disabled={otpBusy || !userEmail}
                >
                  {otpBusy ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
                      {t('pinRecoverySendCode')}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.forgotBtn} onPress={() => setMode('unlock')}>
                  <Text style={[styles.forgotText, { color: colors.textSecondary }]}>{t('back')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  {t('pinRecoverySent', { email: maskedEmail })}
                </Text>
                <Text style={[styles.otpLabel, { color: colors.textSecondary }]}>
                  {t('pinRecoveryEnterCode')}
                </Text>
                {otpError ? (
                  <Text style={[styles.pinError, { color: colors.error }]}>{otpError}</Text>
                ) : null}
                <View style={styles.padWrap}>
                  <PinPad value={otp} onChange={setOtp} maxLength={OTP_LENGTH} />
                </View>
                {otpBusy ? <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} /> : null}
                <TouchableOpacity
                  style={[styles.secondaryBtn, { borderColor: colors.border, opacity: cooldown > 0 ? 0.5 : 1 }]}
                  onPress={() => void sendOtp()}
                  disabled={cooldown > 0 || otpBusy}
                >
                  <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
                    {cooldown > 0
                      ? t('pinRecoveryResendIn', { seconds: cooldown })
                      : t('pinRecoveryResend')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.forgotBtn}
                  onPress={() => {
                    setMode('unlock');
                    setOtpSent(false);
                    setOtp('');
                    setOtpError('');
                  }}
                >
                  <Text style={[styles.forgotText, { color: colors.textSecondary }]}>{t('back')}</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: colors.text }]}>{t('appLockUnlockTitle')}</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('appLockUnlockSubtitle')}</Text>

            {showPin ? (
              <>
                {pinError ? (
                  <Text style={[styles.pinError, { color: colors.error }]}>{pinError}</Text>
                ) : null}
                <View style={styles.padWrap}>
                  <PinPad value={pin} onChange={setPin} />
                </View>

                {bioUnlockAvailable ? (
                  <TouchableOpacity
                    style={[styles.secondaryBtn, { borderColor: colors.border }]}
                    onPress={onBiometricsPress}
                    disabled={bioBusy}
                    accessibilityRole="button"
                    accessibilityLabel={t('appLockBiometricBtn')}
                  >
                    <Fingerprint color={colors.primary} size={18} />
                    <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
                      {t('appLockBiometricBtn')}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity onPress={() => setMode('recover')} style={styles.forgotBtn}>
                  <Text style={[styles.forgotText, { color: colors.textSecondary }]}>
                    {t('appLockPinForgot')}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {bioUnlockAvailable ? (
                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: bioBusy ? 0.7 : 1 }]}
                    onPress={onBiometricsPress}
                    disabled={bioBusy}
                    accessibilityRole="button"
                    accessibilityLabel={t('appLockBiometricBtn')}
                  >
                    {bioBusy ? (
                      <ActivityIndicator color={colors.onPrimary} />
                    ) : (
                      <>
                        <Fingerprint color={colors.onPrimary} size={20} />
                        <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
                          {t('biometricRetry')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={[styles.secondaryBtn, { borderColor: colors.border }]}
                  onPress={() => setShowPin(true)}
                >
                  <KeyRound color={colors.primary} size={18} />
                  <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
                    {t('appLockPinBtn')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setMode('recover')} style={styles.forgotBtn}>
                  <Text style={[styles.forgotText, { color: colors.textSecondary }]}>
                    {t('appLockPinForgot')}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { zIndex: 9999, justifyContent: 'flex-start' },
  sheet: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
  },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  sub: { fontSize: 15, lineHeight: 22, marginBottom: 16 },
  emailHint: { fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  otpLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  pinError: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  padWrap: { marginVertical: 12 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    minHeight: 52,
    marginTop: 4,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  forgotBtn: { alignItems: 'center', marginTop: 16 },
  forgotText: { fontSize: 14 },
  promptRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
  },
  promptCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
  },
  promptIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
});
