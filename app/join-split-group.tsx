import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { useAuth } from '@/store/auth-store';
import { useSplitGroupsStore } from '@/store/split-groups-store';
import { BackButton } from '@/components/BackButton';

export default function JoinSplitGroupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useLanguageStore();
  const { user } = useAuth();
  const joinGroupByCode = useSplitGroupsStore((s) => s.joinGroupByCode);

  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);

  const inputBg = isDark ? colors.muted : colors.background;

  const handleJoin = async () => {
    if (!user?.id) {
      Alert.alert(t('error'), t('splitGroupsNeedLogin'));
      return;
    }
    const trimmed = code.trim();
    if (!trimmed) {
      Alert.alert(t('error'), t('splitGroupsJoinCodeRequired'));
      return;
    }
    if (!/^\d{6}$/.test(trimmed)) {
      Alert.alert(t('error'), t('splitGroupsJoinInvalidCode'));
      return;
    }

    setSaving(true);
    const { group, error } = await joinGroupByCode({
      code: trimmed,
      memberDisplayName: user.name?.trim() || t('splitGroupsMe'),
    });
    setSaving(false);

    if (error || !group) {
      Alert.alert(t('error'), error ?? t('splitGroupsJoinFailed'));
      return;
    }

    router.replace({ pathname: '/split-group-detail', params: { id: group.id } });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerRow}>
          <BackButton color="white" size={24} style={styles.headerBtn} />
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>{t('splitGroupsJoinTitle')}</Text>
          </View>
          <View style={styles.headerBtn} />
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('splitGroupsJoinHint')}</Text>

        <TextInput
          style={[
            styles.codeInput,
            { backgroundColor: inputBg, color: colors.text, borderColor: colors.border },
          ]}
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void handleJoin()}
        />

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
          onPress={() => void handleJoin()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
              {t('splitGroupsJoinConfirm')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitles: { flex: 1, alignItems: 'center' },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: '700' },
  body: { flex: 1, padding: 20, gap: 12 },
  hint: { fontSize: 14, lineHeight: 20 },
  codeInput: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
});
