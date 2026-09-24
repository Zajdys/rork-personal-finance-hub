import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { StackHeaderBackButton } from '@/components/BackButton';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import * as LocalAuthentication from 'expo-local-authentication';
import { Shield, Eye, Database, Trash2, ChevronRight, FileText, ShieldCheck, Smartphone } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { getBiometricsEnabled, setBiometricsEnabled } from '@/lib/biometrics-storage';
import {
  disableAppLock,
  getAppLockEnabled,
  getAppLockPin,
  hasAppLockPin,
  setAppLockEnabled,
  setAppLockPin,
} from '@/lib/app-lock-storage';
import { PinSetupModal } from '@/components/PinSetupModal';
import { PRIVACY_POLICY_URL, SECURITY_URL, TERMS_OF_USE_URL } from '@/constants/legal-urls';

export default function PrivacySettingsScreen() {
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguageStore();
  const router = useRouter();
  const [biometricsOn, setBiometricsOn] = useState(false);
  const [appLockOn, setAppLockOn] = useState(false);
  const [appLockSaving, setAppLockSaving] = useState(false);
  const [pinSetupVisible, setPinSetupVisible] = useState(false);
  const [bioLabel, setBioLabel] = useState('Face ID / Touch ID');

  const reloadSecurityFlags = useCallback(async () => {
    const [bio, hasPin] = await Promise.all([getBiometricsEnabled(), hasAppLockPin()]);
    setBiometricsOn(bio);
    setAppLockOn(hasPin);
  }, []);

  useFocusRefresh(
    useCallback(async () => {
      await reloadSecurityFlags();
    }, [reloadSecurityFlags]),
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void (async () => {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBioLabel(language === 'cs' ? 'Face ID' : 'Face ID');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBioLabel(t('privacyBioTouchId'));
      } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
        setBioLabel('Iris');
      } else {
        setBioLabel(t('privacyBioDevice'));
      }
    })();
  }, [language, t]);

  const onAppLockToggle = async (value: boolean) => {
    if (Platform.OS === 'web') {
      Alert.alert(t('appLockWebUnavailable'));
      return;
    }
    if (!value) {
      setAppLockSaving(true);
      await Promise.all([disableAppLock(), setBiometricsEnabled(false)]);
      setAppLockOn(false);
      setBiometricsOn(false);
      setAppLockSaving(false);
      return;
    }
    setAppLockSaving(true);
    try {
      const existingPin = await getAppLockPin();
      if (existingPin && existingPin.length >= 4) {
        const [hw, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (hw && enrolled) {
          const r = await LocalAuthentication.authenticateAsync({
            promptMessage: t('privacyConfirmEnable'),
            fallbackLabel: t('biometricFallbackLabel'),
            cancelLabel: t('cancel'),
            disableDeviceFallback: false,
          });
          if (!r.success) {
            setAppLockSaving(false);
            return;
          }
          await Promise.all([setAppLockEnabled(true), setBiometricsEnabled(true)]);
          setBiometricsOn(true);
        } else {
          await setAppLockEnabled(true);
        }
        setAppLockOn(true);
        return;
      }
      setPinSetupVisible(true);
    } catch {
      Alert.alert(t('error'), t('appLockEnableError'));
    } finally {
      setAppLockSaving(false);
    }
  };

  const handlePinSetupDone = async (pin: string) => {
    setPinSetupVisible(false);
    await Promise.all([setAppLockPin(pin), setAppLockEnabled(true)]);
    setAppLockOn(true);
  };

  const handlePinSetupCancel = async () => {
    setPinSetupVisible(false);
    const pin = await getAppLockPin();
    if (!pin || pin.length < 4) {
      await Promise.all([disableAppLock(), setBiometricsEnabled(false)]);
      setAppLockOn(false);
      setBiometricsOn(false);
      return;
    }
    setAppLockOn(await getAppLockEnabled());
  };

  const onBiometricsToggle = async (value: boolean) => {
    if (Platform.OS === 'web') return;

    if (!value) {
      await setBiometricsEnabled(false);
      setBiometricsOn(false);
      return;
    }

    const hasPin = await hasAppLockPin();
    if (!hasPin) {
      Alert.alert(t('error'), t('appLockBioNoPin'));
      return;
    }

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      Alert.alert(t('privacyNotAvailable'), t('privacyBioNotSupported'));
      return;
    }

    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      Alert.alert(t('privacyNotSetUp'), t('privacyBioNotConfigured'));
      return;
    }

    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: t('privacyConfirmEnable'),
      fallbackLabel: t('biometricFallbackLabel'),
      cancelLabel: t('cancel'),
      disableDeviceFallback: false,
    });

    if (!auth.success) {
      return;
    }

    await setBiometricsEnabled(true);
    setBiometricsOn(true);
  };

  const PrivacyItem = ({
    icon: Icon,
    title,
    subtitle,
    onPress,
  }: {
    icon: typeof Shield;
    title: string;
    subtitle: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      style={[styles.privacyItem, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
    >
      <View style={styles.privacyContent}>
        <View style={[styles.iconContainer, { backgroundColor: colors.muted }]}>
          <Icon color={colors.primary} size={24} />
        </View>
        <View style={styles.privacyText}>
          <Text style={[styles.privacyTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.privacySubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        </View>
      </View>
      <ChevronRight color={colors.textSecondary} size={20} />
    </TouchableOpacity>
  );

  const webBioHint = t('privacyBioWebUnavailable');

  return (
    <>
      <Stack.Screen
        options={{
          title: t('privacySecurity'),
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.primary,
          headerLeft: ({ tintColor }) => (
            <StackHeaderBackButton tintColor={tintColor ?? colors.primary} />
          ),
          headerTitleStyle: { fontWeight: 'bold', color: colors.text },
        }}
      />

      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.headerTitle}>{t('privacySecurity')}</Text>
          <Text style={styles.headerSubtitle}>{t('privacyProtectData')}</Text>
        </LinearGradient>

        <View style={styles.content}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {t('privacySectionAppLock')}
          </Text>

          <View
            style={[
              styles.appLockBlock,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.appLockMainRow}>
              <View style={styles.privacyContent}>
                <View style={[styles.iconContainer, { backgroundColor: colors.muted }]}>
                  <Smartphone color={colors.primary} size={24} />
                </View>
                <View style={styles.privacyText}>
                  <Text style={[styles.privacyTitle, { color: colors.text }]} numberOfLines={1}>
                    {t('notificationsSettings.appLockTitle')}
                  </Text>
                  <Text
                    style={[styles.privacySubtitle, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {Platform.OS === 'web'
                      ? t('appLockWebUnavailable')
                      : t('notificationsSettings.appLockSubtitle')}
                  </Text>
                </View>
              </View>
              <Switch
                value={appLockOn}
                onValueChange={(v) => void onAppLockToggle(v)}
                disabled={Platform.OS === 'web' || appLockSaving}
                trackColor={{ false: colors.muted, true: colors.primary }}
                thumbColor={Platform.OS === 'android' ? (appLockOn ? colors.onPrimary : colors.card) : undefined}
                ios_backgroundColor={colors.muted}
              />
            </View>

            {appLockOn ? (
              <>
                <View style={[styles.appLockInnerDivider, { backgroundColor: colors.border }]} />
                <View
                  style={[
                    styles.appLockNestedRow,
                    Platform.OS === 'web' && { opacity: 0.55 },
                  ]}
                >
                  <View style={styles.appLockNestedText}>
                    <Text style={[styles.appLockNestedTitle, { color: colors.text }]} numberOfLines={1}>
                      {t('privacyBiometricUnlock')}
                    </Text>
                    <Text
                      style={[styles.appLockNestedSubtitle, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {Platform.OS === 'web' ? webBioHint : bioLabel}
                    </Text>
                  </View>
                  <Switch
                    value={biometricsOn}
                    onValueChange={(v) => void onBiometricsToggle(v)}
                    disabled={Platform.OS === 'web'}
                    trackColor={{ false: colors.muted, true: colors.primary }}
                    thumbColor={
                      Platform.OS === 'android' ? (biometricsOn ? colors.onPrimary : colors.card) : undefined
                    }
                    ios_backgroundColor={colors.muted}
                  />
                </View>
              </>
            ) : null}
          </View>

          <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {t('privacySectionPrivacy')}
          </Text>

          <PrivacyItem
            icon={Eye}
            title={t('privacyDataPrivacy')}
            subtitle={t('privacyDataPrivacySubtitle')}
            onPress={() => router.push('/privacy-data-info')}
          />

          <PrivacyItem
            icon={Database}
            title={t('privacyDataManagement')}
            subtitle={t('privacyDataManagementSubtitle')}
            onPress={() => router.push('/privacy-data-management')}
          />

          <PrivacyItem
            icon={Shield}
            title={t('privacyPolicyGdpr')}
            subtitle={t('privacyPolicyGdprSubtitle')}
            onPress={() => router.push('/privacy-policy')}
          />

          <PrivacyItem
            icon={ShieldCheck}
            title={t('privacySecurityPageTitle')}
            subtitle={t('privacySecurityPageSubtitle')}
            onPress={() => void Linking.openURL(SECURITY_URL)}
          />

          <PrivacyItem
            icon={FileText}
            title={t('termsOfUse')}
            subtitle={t('termsOfUseSubtitle')}
            onPress={() => void Linking.openURL(TERMS_OF_USE_URL)}
          />

          <TouchableOpacity
            style={[styles.webLinkRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
            activeOpacity={0.85}
          >
            <Text style={[styles.webLinkLabel, { color: colors.textSecondary }]}>{t('privacyPolicyWebVersion')}</Text>
            <Text style={[styles.webLinkUrl, { color: colors.primary }]}>{PRIVACY_POLICY_URL}</Text>
          </TouchableOpacity>

          <View style={styles.dangerZone}>
            <Text style={[styles.dangerTitle, { color: colors.error }]}>{t('privacyDangerZone')}</Text>
            <TouchableOpacity
              style={[
                styles.dangerItem,
                { backgroundColor: colors.card, borderColor: isDark ? colors.error : '#FEE2E2' },
              ]}
              onPress={() => router.push('/privacy-data-management')}
              activeOpacity={0.85}
            >
              <View style={styles.dangerContent}>
                <View style={[styles.iconContainer, { backgroundColor: isDark ? colors.muted : '#FEE2E2' }]}>
                  <Trash2 color={colors.error} size={24} />
                </View>
                <View style={styles.privacyText}>
                  <Text style={[styles.privacyTitle, { color: colors.error }]}>{t('privacyDeleteAccount')}</Text>
                  <Text style={[styles.privacySubtitle, { color: colors.textSecondary }]}>
                    {t('privacyDeleteAccountSubtitle')}
                  </Text>
                </View>
              </View>
              <ChevronRight color={colors.error} size={20} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <PinSetupModal
        visible={pinSetupVisible}
        onDone={(pin) => void handlePinSetupDone(pin)}
        onCancel={() => void handlePinSetupCancel()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
  },
  content: {
    padding: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
    marginLeft: 4,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 16,
    marginBottom: 20,
    opacity: 0.65,
  },
  appLockBlock: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  appLockMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  appLockInnerDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 84,
    opacity: 0.7,
  },
  appLockNestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingRight: 20,
    paddingLeft: 36,
  },
  appLockNestedText: {
    flex: 1,
    marginRight: 8,
  },
  appLockNestedTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 1,
  },
  appLockNestedSubtitle: {
    fontSize: 12,
  },
  privacyItem: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  privacyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  privacyText: {
    flex: 1,
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  privacySubtitle: {
    fontSize: 14,
  },
  dangerZone: {
    marginTop: 32,
  },
  dangerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  dangerItem: {
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  dangerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  webLinkRow: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  webLinkLabel: { fontSize: 13, marginBottom: 4 },
  webLinkUrl: { fontSize: 14, fontWeight: '600' },
});
