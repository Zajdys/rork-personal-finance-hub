import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { X, ChevronUp, ChevronDown } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';
import {
  DEFAULT_QUICK_ACTION_IDS,
  MAX_QUICK_ACTIONS,
  QUICK_ACTIONS_CATALOG,
  getQuickActionDef,
  saveQuickActionIds,
  type QuickActionId,
  quickActionLabel,
} from '@/lib/quick-actions';
import { showToast } from '@/store/toast-store';
import { useLanguageStore } from '@/store/language-store';

type Props = {
  visible: boolean;
  userId: string | null | undefined;
  selectedIds: QuickActionId[];
  onClose: () => void;
  onSaved: (ids: QuickActionId[]) => void;
};

export function QuickActionsEditSheet({
  visible,
  userId,
  selectedIds,
  onClose,
  onSaved,
}: Props) {
  const { colors } = useTheme();
  const { tr } = useLanguageStore();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<QuickActionId[]>(selectedIds);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setDraft(selectedIds);
  }, [visible, selectedIds]);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  const available = useMemo(
    () => QUICK_ACTIONS_CATALOG.filter((a) => !draft.includes(a.id)),
    [draft],
  );

  const move = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= draft.length) return;
    setDraft((prev) => {
      const copy = [...prev];
      const tmp = copy[index]!;
      copy[index] = copy[next]!;
      copy[next] = tmp;
      return copy;
    });
  };

  const remove = (id: QuickActionId) => {
    setDraft((prev) => prev.filter((x) => x !== id));
  };

  const add = (id: QuickActionId) => {
    if (draft.length >= MAX_QUICK_ACTIONS) {
      showToast({ type: 'error', message: tr('Max 8 akcí', 'Max 8 actions') });
      return;
    }
    if (draft.includes(id)) return;
    setDraft((prev) => [...prev, id]);
  };

  const resetDefault = () => {
    setDraft([...DEFAULT_QUICK_ACTION_IDS]);
  };

  const save = async () => {
    if (!userId) {
      onSaved(draft);
      close();
      return;
    }
    setSaving(true);
    const { error } = await saveQuickActionIds(userId, draft);
    setSaving(false);
    if (error) {
      showToast({ type: 'error', message: tr('Nepodařilo se uložit', 'Couldn’t save') });
      return;
    }
    onSaved(draft);
    showToast({ type: 'success', message: tr('✓ Rychlé akce uložené', '✓ Quick actions saved') });
    close();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.modalRoot}>
        <Pressable
          style={[styles.backdrop, { backgroundColor: colors.overlay ?? 'rgba(0,0,0,0.45)' }]}
          onPress={close}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                paddingBottom: Math.max(insets.bottom, 16) + 8,
              },
            ]}
          >
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <View style={styles.headerSpacer} />
              <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                {tr('Upravit rychlé akce', 'Edit quick actions')}
              </Text>
              <TouchableOpacity
                onPress={close}
                style={[styles.closeBtn, { backgroundColor: colors.muted }]}
                hitSlop={8}
              >
                <X color={colors.textSecondary} size={18} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              <Text style={[styles.sectionLabel, { color: colors.text }]}>{tr('Na Přehledu', 'On Overview')}</Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                {tr(`Pořadí změníš šipkami · max ${MAX_QUICK_ACTIONS}`, `Reorder with the arrows · max ${MAX_QUICK_ACTIONS}`)}
              </Text>
              {draft.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>
                  {tr('Žádné vybrané akce', 'No actions selected')}
                </Text>
              ) : (
                draft.map((id, index) => {
                  const def = getQuickActionDef(id);
                  if (!def) return null;
                  const Icon = def.icon;
                  return (
                    <View
                      key={id}
                      style={[
                        styles.row,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <View style={[styles.iconCircle, { backgroundColor: `${def.color}22` }]}>
                        <Icon color={def.color} size={18} />
                      </View>
                      <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
                        {quickActionLabel(def)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => move(index, -1)}
                        disabled={index === 0}
                        hitSlop={8}
                        style={{ opacity: index === 0 ? 0.3 : 1 }}
                      >
                        <ChevronUp color={colors.textSecondary} size={22} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => move(index, 1)}
                        disabled={index === draft.length - 1}
                        hitSlop={8}
                        style={{ opacity: index === draft.length - 1 ? 0.3 : 1 }}
                      >
                        <ChevronDown color={colors.textSecondary} size={22} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => remove(id)} hitSlop={8}>
                        <X color={colors.textSecondary} size={18} />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}

              <Text style={[styles.sectionLabel, { color: colors.text, marginTop: 20 }]}>
                {tr('Další akce', 'More actions')}
              </Text>
              {available.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>
                  {tr('Všechny akce jsou na Přehledu', 'All actions are on the Overview')}
                </Text>
              ) : (
                available.map((def) => {
                  const Icon = def.icon;
                  return (
                    <TouchableOpacity
                      key={def.id}
                      style={[
                        styles.row,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                      onPress={() => add(def.id)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.iconCircle, { backgroundColor: `${def.color}22` }]}>
                        <Icon color={def.color} size={18} />
                      </View>
                      <Text style={[styles.rowLabel, { color: colors.text }]} numberOfLines={1}>
                        {quickActionLabel(def)}
                      </Text>
                      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 18 }}>+</Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity onPress={resetDefault} style={styles.resetBtn}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>{tr('Obnovit výchozí', 'Reset to default')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveBtn,
                { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 },
              ]}
              onPress={() => void save()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>{tr('Hotovo', 'Done')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  kav: { width: '100%', maxHeight: '92%' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    width: '100%',
    maxHeight: '100%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
    marginTop: 10,
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  headerSpacer: { width: 32, height: 32 },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { paddingBottom: 12 },
  sectionLabel: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  hint: { fontSize: 12, marginBottom: 10 },
  empty: { fontSize: 13, paddingVertical: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  resetBtn: { alignItems: 'center', paddingVertical: 10 },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
