/**
 * Vytvoření vlastní kategorie (s emoji a barvou) nebo podkategorie.
 * Používá CategoryPicker — rychlé přidání i tab Přidat.
 */
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { categoryLabel } from '@/lib/category-labels';
import { useLanguageStore } from '@/store/language-store';

export const CATEGORY_EMOJIS: string[] = [
  '🛒', '🍽️', '☕', '🍺', '🍕', '🥗',
  '🏠', '💡', '🔧', '🧹', '🛋️', '🪴',
  '🚗', '⛽', '🚆', '✈️', '🚲', '🅿️',
  '🎬', '🎮', '🎵', '🎉', '📺', '🎁',
  '💊', '🏋️', '🧘', '🦷', '💇', '💅',
  '👕', '👟', '🛍️', '📚', '🎓', '💻',
  '📱', '🐶', '🐱', '👶', '🧸', '🎒',
  '💰', '💳', '🏦', '📈', '🧾', '💼',
  '🌍', '🏖️', '⛷️', '⚽', '🎨', '📦',
];

export const CATEGORY_COLORS = [
  '#8B5CF6', '#6366F1', '#06B6D4', '#10B981', '#84CC16',
  '#F59E0B', '#F97316', '#EF4444', '#EC4899', '#6B7280',
];

export type CreateCategoryResult = { name: string; icon: string; color: string };

type Props = {
  visible: boolean;
  /** Když je vyplněno, vytváří se podkategorie této kategorie (bez emoji/barvy). */
  parentCategory?: string | null;
  onClose: () => void;
  onCreate: (r: CreateCategoryResult) => void;
};

export function CreateCategoryModal({ visible, parentCategory, onClose, onCreate }: Props) {
  const { colors } = useTheme();
  const { tr } = useLanguageStore();
  const isSub = !!parentCategory;
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🛒');
  const [color, setColor] = useState(CATEGORY_COLORS[0]!);
  const [customEmoji, setCustomEmoji] = useState('');
  const { height: winH } = useWindowDimensions();
  const [kbH, setKbH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      setKbH(e.endCoordinates?.height ?? 0),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKbH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  // Výška seznamu emoji tak, aby se okno vešlo i s klávesnicí (hlavička + tlačítka ≈ 230 pt).
  const listMaxH = Math.max(150, Math.min(440, winH - kbH - 290));

  useEffect(() => {
    if (visible) {
      setName('');
      setIcon('🛒');
      setColor(CATEGORY_COLORS[0]!);
      setCustomEmoji('');
    }
  }, [visible]);

  const canSave = name.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    onCreate({ name: name.trim(), icon, color });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text }]}>
            {isSub ? tr('Nová podkategorie', 'New subcategory') : tr('Nová kategorie', 'New category')}
          </Text>
          {isSub ? (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>{tr('Patří pod', 'Belongs to')}: {categoryLabel(parentCategory)}</Text>
          ) : null}

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: listMaxH }} contentContainerStyle={{ paddingBottom: 8 }}>
            {/* Náhled + název */}
            <View style={[styles.nameRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              {!isSub ? (
                <View style={[styles.preview, { backgroundColor: color + '33' }]}>
                  <Text style={{ fontSize: 22 }}>{icon}</Text>
                </View>
              ) : null}
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={isSub ? tr('Např. Benzín, Oběd v práci…', 'E.g. Fuel, Lunch at work…') : tr('Název, např. Kluby, Vaping, Golf…', 'Name, e.g. Clubs, Vaping, Golf…')}
                placeholderTextColor={colors.textSecondary}
                style={[styles.nameInput, { color: colors.text }]}
                autoFocus
                maxLength={30}
                returnKeyType="done"
                onSubmitEditing={save}
              />
            </View>

            {!isSub ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Ikonka</Text>
                <View style={styles.emojiGrid}>
                  {CATEGORY_EMOJIS.map((e) => {
                    const active = e === icon;
                    return (
                      <TouchableOpacity
                        key={e}
                        onPress={() => {
                          setIcon(e);
                          setCustomEmoji('');
                        }}
                        style={[
                          styles.emojiCell,
                          { backgroundColor: active ? color + '33' : colors.surface, borderColor: active ? color : 'transparent' },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Ikonka ${e}`}
                      >
                        <Text style={{ fontSize: 22 }}>{e}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={[styles.customEmojiRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>
                    {tr('Jiná ikonka? Ťukni sem a vyber emoji z klávesnice 🙂', 'Another icon? Tap here and pick an emoji from the keyboard 🙂')}
                  </Text>
                  <TextInput
                    value={customEmoji}
                    onChangeText={(v) => {
                      const chars = [...v.trim()];
                      const e = chars[chars.length - 1] ?? '';
                      setCustomEmoji(e);
                      if (e) setIcon(e);
                    }}
                    style={[styles.customEmojiInput, { color: colors.text, borderColor: colors.border }]}
                    placeholder="＋"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>

                <Text style={[styles.label, { color: colors.textSecondary }]}>Barva</Text>
                <View style={styles.colorRow}>
                  {CATEGORY_COLORS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setColor(c)}
                      style={[styles.colorDot, { backgroundColor: c, borderColor: c === color ? colors.text : 'transparent' }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Barva ${c}`}
                    />
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={[styles.btn, { backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{tr('Zrušit', 'Cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={save}
              disabled={!canSave}
              style={[styles.btn, { backgroundColor: colors.primary, opacity: canSave ? 1 : 0.4 }]}
              testID="create-category-save"
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{tr('Uložit', 'Save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 30 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800' },
  hint: { fontSize: 13, marginTop: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, padding: 8, marginTop: 14 },
  preview: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nameInput: { flex: 1, fontSize: 16, paddingVertical: 8, paddingHorizontal: 4 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emojiCell: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  customEmojiRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 10 },
  customEmojiInput: { width: 48, height: 40, borderWidth: 1, borderRadius: 10, textAlign: 'center', fontSize: 22 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 3 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
});
