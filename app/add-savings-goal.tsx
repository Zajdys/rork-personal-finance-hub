import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Target } from 'lucide-react-native';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useSavingsGoalsStore } from '@/store/savings-goals-store';
import { safeGoBack } from '@/lib/safe-back';
import { parseMoneyInput } from '@/lib/parse-money-input';
import {
  SAVINGS_GOAL_TEMPLATES,
  SAVINGS_GOAL_EMOJI_OPTIONS,
  SAVINGS_GOAL_COLOR_OPTIONS,
  type SavingsGoalTemplate,
} from '@/constants/savings-goal-templates';
import { AsyncButton } from '@/components/AsyncButton';
import { useAsyncAction } from '@/hooks/use-async-action';

function endOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

export default function AddSavingsGoalScreen() {
  const { isDarkMode, getCurrentCurrency } = useSettingsStore();
  const { t } = useLanguageStore();
  const addGoal = useSavingsGoalsStore((s) => s.addGoal);
  const sym = getCurrentCurrency().symbol;

  const [name, setName] = useState('');
  const [targetStr, setTargetStr] = useState('');
  const [deadline, setDeadline] = useState(() => {
    const x = new Date();
    x.setMonth(x.getMonth() + 6);
    return x;
  });
  const [showDate, setShowDate] = useState(false);
  const [emoji, setEmoji] = useState('💰');
  const [color, setColor] = useState('#10B981');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const primaryText = isDarkMode ? '#F9FAFB' : '#0F172A';
  const subtleText = isDarkMode ? '#94A3B8' : '#6B7280';
  const cardColor = isDarkMode ? '#1F2937' : '#FFFFFF';
  const inputBorder = isDarkMode ? '#334155' : '#E2E8F0';

  const applyTemplate = useCallback((t: SavingsGoalTemplate) => {
    setSelectedTemplateId(t.id);
    setName(t.name);
    setEmoji(t.emoji);
    setColor(t.color);
    setTargetStr(String(t.suggestedTarget));
  }, []);

  const selectCustom = useCallback(() => {
    setSelectedTemplateId('custom');
  }, []);

  const deadlineLabel = useMemo(
    () =>
      deadline.toLocaleDateString('cs-CZ', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [deadline],
  );

  const onDateChange = (_: unknown, date?: Date) => {
    setShowDate(Platform.OS === 'ios');
    if (date) setDeadline(date);
  };

  const { run: handleSave } = useAsyncAction(async () => {
    const target = parseMoneyInput(targetStr);
    if (!name.trim()) {
      Alert.alert(t('error'), t('savingsGoal.enterName'));
      return;
    }
    if (target == null || target <= 0) {
      Alert.alert(t('error'), t('savingsGoal.enterValidTarget'));
      return;
    }
    addGoal({
      name: name.trim(),
      targetAmount: target,
      deadline: endOfDayIso(deadline),
      emoji,
      color,
    });
    safeGoBack();
  });

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC' }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.card, { backgroundColor: cardColor }]}>
        <View style={styles.headerRow}>
          <Target color="#10B981" size={22} />
          <Text style={[styles.sectionTitle, { color: primaryText }]}>{t('savingsGoal.templates')}</Text>
        </View>
        <Text style={[styles.hint, { color: subtleText }]}>
          {t('savingsGoal.templatesHint')}
        </Text>
        <View style={styles.templateGrid}>
          {SAVINGS_GOAL_TEMPLATES.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[
                styles.templateChip,
                {
                  borderColor: selectedTemplateId === t.id ? t.color : inputBorder,
                  backgroundColor:
                    selectedTemplateId === t.id
                      ? isDarkMode
                        ? '#0B1220'
                        : `${t.color}18`
                      : isDarkMode
                        ? '#0B1220'
                        : '#F8FAFC',
                },
              ]}
              onPress={() => applyTemplate(t)}
            >
              <Text style={styles.templateEmoji}>{t.emoji}</Text>
              <Text style={[styles.templateName, { color: primaryText }]} numberOfLines={2}>
                {t.name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[
              styles.templateChip,
              styles.templateCustom,
              {
                borderColor: selectedTemplateId === 'custom' ? '#2563EB' : inputBorder,
                backgroundColor:
                  selectedTemplateId === 'custom'
                    ? isDarkMode
                      ? '#172554'
                      : '#EFF6FF'
                    : isDarkMode
                      ? '#0B1220'
                      : '#F8FAFC',
              },
            ]}
            onPress={selectCustom}
          >
            <Text style={styles.templateEmoji}>✨</Text>
            <Text style={[styles.templateName, { color: primaryText }]}>{t('savingsGoal.custom')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: cardColor }]}>
        <Text style={[styles.sectionTitle, { color: primaryText }]}>{t('savingsGoal.details')}</Text>
        <Text style={[styles.label, { color: subtleText }]}>{t('savingsGoal.name')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('savingsGoal.namePlaceholder')}
          placeholderTextColor={subtleText}
          style={[styles.input, { color: primaryText, borderColor: inputBorder }]}
        />
        <Text style={[styles.label, { color: subtleText }]}>{t('savingsGoal.targetAmount', { symbol: sym })}</Text>
        <TextInput
          value={targetStr}
          onChangeText={setTargetStr}
          placeholder="0"
          placeholderTextColor={subtleText}
          keyboardType="decimal-pad"
          style={[styles.input, { color: primaryText, borderColor: inputBorder }]}
        />
        <Text style={[styles.label, { color: subtleText }]}>{t('savingsGoal.deadline')}</Text>
        <TouchableOpacity
          style={[styles.dateBtn, { borderColor: inputBorder }]}
          onPress={() => setShowDate(true)}
        >
          <Text style={[styles.dateBtnText, { color: primaryText }]}>{deadlineLabel}</Text>
        </TouchableOpacity>
        {showDate && (
          <DateTimePicker
            value={deadline}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onDateChange}
            minimumDate={new Date()}
          />
        )}

        <Text style={[styles.label, { color: subtleText, marginTop: 12 }]}>{t('savingsGoal.emoji')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiScroll}>
          {SAVINGS_GOAL_EMOJI_OPTIONS.map((e) => (
            <TouchableOpacity
              key={e}
              style={[
                styles.emojiBtn,
                { borderColor: emoji === e ? color : inputBorder },
                emoji === e && { backgroundColor: `${color}22` },
              ]}
              onPress={() => setEmoji(e)}
            >
              <Text style={styles.emojiLarge}>{e}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.label, { color: subtleText }]}>{t('savingsGoal.color')}</Text>
        <View style={styles.colorRow}>
          {SAVINGS_GOAL_COLOR_OPTIONS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[
                styles.colorDot,
                { backgroundColor: c },
                color === c && styles.colorDotSelected,
              ]}
              onPress={() => setColor(c)}
            />
          ))}
        </View>
      </View>

      <AsyncButton
        variant="success"
        label={t('savingsGoal.save')}
        loadingLabel={t('hhNotifSaving')}
        onPress={handleSave}
        contentStyle={styles.saveBtn}
        textStyle={styles.saveBtnText}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  card: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  hint: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  templateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  templateChip: {
    width: '30%',
    minWidth: 100,
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 2,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  templateCustom: { justifyContent: 'center' },
  templateEmoji: { fontSize: 26, marginBottom: 4 },
  templateName: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  dateBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  dateBtnText: { fontSize: 16, fontWeight: '600' },
  emojiScroll: { marginBottom: 8, maxHeight: 56 },
  emojiBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  emojiLarge: { fontSize: 24 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  colorDotSelected: {
    borderWidth: 3,
    borderColor: '#0F172A',
  },
  saveBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: { color: 'white', fontSize: 17, fontWeight: '700' },
});
