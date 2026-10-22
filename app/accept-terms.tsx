import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Linking,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { useAuth } from '@/store/auth-store';
import { useLanguageStore } from '@/store/language-store';
import { useTheme } from '@/hooks/use-theme';
import { PRIVACY_POLICY_URL, TERMS_OF_USE_URL } from '@/constants/legal-urls';

export default function AcceptTermsScreen() {
  const { t } = useLanguageStore();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { acceptTermsConsent } = useAuth();
  const [ageOk, setAgeOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [loading, setLoading] = useState(false);

  const canContinue = ageOk && termsOk && !loading;

  const onContinue = async () => {
    if (!canContinue) return;
    setLoading(true);
    try {
      const res = await acceptTermsConsent();
      if (!res.success) {
        Alert.alert(t('error'), t('auth.consentSaveFailed'));
      }
      // Gate v _layout po termsAccepted=true přesměruje dál.
    } finally {
      setLoading(false);
    }
  };

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: Math.max(insets.top, 24),
          paddingBottom: Math.max(insets.bottom, 24),
        },
      ]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={[styles.title, { color: colors.text }]}>{t('auth.acceptTermsTitle')}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {t('auth.acceptTermsSubtitle')}
      </Text>

      <CheckboxRow
        checked={ageOk}
        onToggle={() => setAgeOk((v) => !v)}
        colors={colors}
        label={<Text style={[styles.checkLabel, { color: colors.text }]}>{t('auth.ageConfirm')}</Text>}
      />

      <CheckboxRow
        checked={termsOk}
        onToggle={() => setTermsOk((v) => !v)}
        colors={colors}
        label={
          <Text style={[styles.checkLabel, { color: colors.text }]}>
            {t('auth.termsPrefix')}
            <Text
              style={{ color: colors.primary, fontWeight: '700' }}
              onPress={() => void Linking.openURL(TERMS_OF_USE_URL)}
            >
              {t('auth.termsLink')}
            </Text>
            {t('auth.termsAnd')}
            <Text
              style={{ color: colors.primary, fontWeight: '700' }}
              onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
            >
              {t('auth.privacyLink')}
            </Text>
          </Text>
        }
      />

      <TouchableOpacity
        style={[
          styles.btn,
          { backgroundColor: canContinue ? colors.primary : colors.border },
        ]}
        disabled={!canContinue}
        onPress={() => void onContinue()}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>{t('auth.acceptTermsContinue')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function CheckboxRow({
  checked,
  onToggle,
  colors,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  colors: { primary: string; border: string; card: string };
  label: React.ReactNode;
}) {
  return (
    <Pressable onPress={onToggle} style={styles.checkRow}>
      <View
        style={[
          styles.box,
          {
            borderColor: checked ? colors.primary : colors.border,
            backgroundColor: checked ? colors.primary : colors.card,
          },
        ]}
      >
        {checked ? <Check color="#fff" size={16} strokeWidth={3} /> : null}
      </View>
      <View style={styles.labelWrap}>{label}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 28 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20, gap: 12 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  labelWrap: { flex: 1 },
  checkLabel: { fontSize: 15, lineHeight: 22 },
  btn: {
    marginTop: 'auto',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
