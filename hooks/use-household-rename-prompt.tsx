import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { renameHouseholdInSupabase } from '@/lib/rename-household';
import { logAndGetUserFacingError } from '@/lib/user-facing-error';
import { useLanguageStore } from '@/store/language-store';
import { useTheme } from '@/hooks/use-theme';

type OnRenamed = (newName: string) => void;

export function useHouseholdRenamePrompt() {
  const { t } = useLanguageStore();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const pendingRef = useRef<{ householdId: string; onRenamed: OnRenamed } | null>(null);

  const applyRename = useCallback(
    async (householdId: string, rawName: string, onRenamed: OnRenamed) => {
      const { name, error } = await renameHouseholdInSupabase(householdId, rawName);
      if (!name) return;
      if (error) {
        Alert.alert(t('error'), error ? logAndGetUserFacingError('household-rename', error) : t('hhRenameFailed'));
        return;
      }
      onRenamed(name);
    },
    [t],
  );

  const promptRename = useCallback(
    (householdId: string, currentName: string, onRenamed: OnRenamed) => {
      if (Platform.OS === 'ios') {
        Alert.prompt(
          t('hhRenameTitle'),
          t('hhRenameHint'),
          (newName) => {
            void applyRename(householdId, newName ?? '', onRenamed);
          },
          'plain-text',
          currentName,
        );
        return;
      }

      pendingRef.current = { householdId, onRenamed };
      setDraft(currentName);
      setVisible(true);
    },
    [applyRename, t],
  );

  const closeModal = useCallback(() => {
    if (saving) return;
    setVisible(false);
    pendingRef.current = null;
  }, [saving]);

  const confirmModal = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    setSaving(true);
    try {
      await applyRename(pending.householdId, draft, pending.onRenamed);
      setVisible(false);
      pendingRef.current = null;
    } finally {
      setSaving(false);
    }
  }, [applyRename, draft]);

  const RenameModal = (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeModal}>
      <Pressable style={styles.overlay} onPress={closeModal}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: colors.text }]}>{t('hhRenameTitle')}</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('hhRenameHint')}</Text>
          <TextInput
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
            ]}
            value={draft}
            onChangeText={setDraft}
            autoFocus
            editable={!saving}
          />
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, { borderColor: colors.border }]}
              onPress={closeModal}
              disabled={saving}
            >
              <Text style={[styles.btnText, { color: colors.text }]}>{t('cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.btnPrimary, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
              onPress={() => void confirmModal()}
              disabled={saving}
            >
              <Text style={[styles.btnText, { color: colors.onPrimary }]}>{t('save')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  return { promptRename, RenameModal };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  hint: { fontSize: 14, marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  actions: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnPrimary: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: { fontSize: 16, fontWeight: '600' },
});
