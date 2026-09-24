import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StackHeaderBackButton } from '@/components/BackButton';
import { Download, Trash2, X } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { useAuth } from '@/store/auth-store';
import { shareUserDataExport } from '@/lib/user-data-export';
import {
  fetchHouseholdDeletionWarnings,
  reauthenticateWithPassword,
  type HouseholdDeletionWarning,
} from '@/lib/account-deletion';

export default function PrivacyDataManagementScreen() {
  const { colors } = useTheme();
  const { t } = useLanguageStore();
  const { user, deleteAccount } = useAuth();
  const router = useRouter();

  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [warnings, setWarnings] = useState<HouseholdDeletionWarning[]>([]);
  const [loadingWarnings, setLoadingWarnings] = useState(false);

  const themedInput = useMemo(
    () => [
      styles.passwordInput,
      { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
    ],
    [colors],
  );

  const onExport = useCallback(async () => {
    if (!user?.id) {
      Alert.alert(t('error'), t('privacyNotSignedIn'));
      return;
    }
    setExporting(true);
    try {
      const result = await shareUserDataExport(user.id, {
        webHint: t('privacyExportWebHint'),
        cacheUnavailable: t('privacyCacheUnavailable'),
        sharingUnavailable: t('privacySharingUnavailable'),
        dialogTitle: t('privacyExportDialogTitle'),
      });
      if (!result.ok) {
        if (result.webOnly) {
          Alert.alert(t('importLabel'), result.error);
        } else {
          Alert.alert(
            result.error === t('privacySharingUnavailable') ? t('privacySharing') : t('privacyExportFailed'),
            result.error,
          );
        }
        return;
      }
      if (result.warnings.length) {
        Alert.alert(t('privacyExportPartial'), result.warnings.join('\n'));
      } else {
        Alert.alert(t('privacyExportData'), t('privacyExportDoneHint'));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('privacyExportFailed'), msg);
    } finally {
      setExporting(false);
    }
  }, [t, user?.id]);

  const closeDeleteModal = useCallback(() => {
    if (deleting) return;
    setDeleteModalOpen(false);
    setPassword('');
  }, [deleting]);

  const openDeleteModal = useCallback(async () => {
    if (!user?.id) {
      Alert.alert(t('error'), t('privacyNotSignedIn'));
      return;
    }
    setPassword('');
    setDeleteModalOpen(true);
    setLoadingWarnings(true);
    try {
      const { warnings: w, error } = await fetchHouseholdDeletionWarnings(user.id);
      if (error) {
        Alert.alert(t('error'), error);
      }
      setWarnings(w);
    } finally {
      setLoadingWarnings(false);
    }
  }, [t, user?.id]);

  const runDelete = useCallback(async () => {
    if (!user?.email) {
      Alert.alert(t('error'), t('privacyNotSignedIn'));
      return;
    }
    setDeleting(true);
    try {
      const auth = await reauthenticateWithPassword(user.email, password);
      if (!auth.ok) {
        Alert.alert(
          t('privacyDeletionFailed'),
          auth.message === 'empty_password' ? t('privacyDeletePasswordRequired') : t('privacyDeletePasswordWrong'),
        );
        return;
      }

      const res = await deleteAccount();
      if (!res.success) {
        Alert.alert(t('privacyDeletionFailed'), res.error ?? t('privacyUnknownError'));
        return;
      }
      setDeleteModalOpen(false);
      setPassword('');
      router.replace('/landing');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('error'), msg);
    } finally {
      setDeleting(false);
    }
  }, [deleteAccount, password, router, t, user?.email]);

  const warningLines = warnings.map((w) => {
    if (w.kind === 'transfer') {
      return t('privacyDeleteHouseholdTransfer', {
        name: w.householdName,
        successor: w.successorName,
      });
    }
    return t('privacyDeleteHouseholdSolo', { name: w.householdName });
  });

  return (
    <>
      <Stack.Screen
        options={{
          title: t('privacyDataManagement'),
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.primary,
          headerLeft: ({ tintColor }) => (
            <StackHeaderBackButton tintColor={tintColor ?? colors.primary} />
          ),
          headerTitleStyle: { fontWeight: '700', color: colors.text },
        }}
      />
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.pad}>
        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => void onExport()}
          disabled={exporting || deleting}
          activeOpacity={0.85}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
            {exporting ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Download color={colors.primary} size={26} />
            )}
          </View>
          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, { color: colors.text }]}>{t('privacyExportData')}</Text>
            <Text style={[styles.actionSub, { color: colors.textSecondary }]}>{t('privacyExportDescription')}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.error }]}
          onPress={() => void openDeleteModal()}
          disabled={exporting || deleting}
          activeOpacity={0.85}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
            {deleting ? (
              <ActivityIndicator color={colors.error} />
            ) : (
              <Trash2 color={colors.error} size={26} />
            )}
          </View>
          <View style={styles.actionText}>
            <Text style={[styles.actionTitle, { color: colors.error }]}>{t('privacyDeleteAccount')}</Text>
            <Text style={[styles.actionSub, { color: colors.textSecondary }]}>{t('privacyDeleteAccountDetail')}</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={deleteModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]} onPress={closeDeleteModal} />
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('privacyDeleteAccount')}</Text>
              <TouchableOpacity onPress={closeDeleteModal} hitSlop={12} disabled={deleting}>
                <X color={colors.textSecondary} size={22} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScroll}>
              <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
                {t('privacyDeleteAccountConfirm')}
              </Text>

              {loadingWarnings ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
              ) : warningLines.length > 0 ? (
                <View style={[styles.warningBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  {warnings.map((w, i) => (
                    <Text key={`${w.kind}-${w.householdId}`} style={[styles.warningLine, { color: colors.text }]}>
                      {warningLines[i]}
                    </Text>
                  ))}
                </View>
              ) : null}

              <Text style={[styles.modalBody, { color: colors.textSecondary, marginTop: 8 }]}>
                {t('privacyDeleteExportBeforeHint')}
              </Text>
              <TouchableOpacity
                style={[styles.secondaryBtn, { backgroundColor: colors.muted }]}
                onPress={() => void onExport()}
                disabled={exporting || deleting}
              >
                {exporting ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
                    {t('privacyExportData')}
                  </Text>
                )}
              </TouchableOpacity>

              <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('privacyDeletePasswordLabel')}</Text>
              <TextInput
                style={themedInput}
                value={password}
                onChangeText={setPassword}
                placeholder={t('privacyDeletePasswordPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!deleting}
                textContentType="password"
              />
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.dangerBtn,
                { backgroundColor: colors.error },
                (deleting || !password.trim()) && { opacity: 0.5 },
              ]}
              onPress={() => void runDelete()}
              disabled={deleting || !password.trim()}
            >
              {deleting ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={[styles.dangerBtnText, { color: colors.onPrimary }]}>
                  {t('privacyDeleteConfirmButton')}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: colors.muted, marginTop: 8 }]}
              onPress={closeDeleteModal}
              disabled={deleting}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pad: { padding: 20, gap: 16, paddingBottom: 40 },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 14,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { flex: 1 },
  actionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 6 },
  actionSub: { fontSize: 14, lineHeight: 20 },
  modalRoot: { flex: 1, justifyContent: 'center', padding: 20 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  modalCard: {
    borderRadius: 16,
    padding: 20,
    maxHeight: '90%',
    zIndex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', flex: 1, marginRight: 8 },
  modalScroll: { maxHeight: 360 },
  modalBody: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  warningBox: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 8,
    marginBottom: 10,
  },
  warningLine: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  fieldLabel: { fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 6 },
  passwordInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 4,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700' },
  dangerBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  dangerBtnText: { fontSize: 16, fontWeight: '800' },
});
