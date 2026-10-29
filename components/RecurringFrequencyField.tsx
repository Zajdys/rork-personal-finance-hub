import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import type { RecurringFrequency } from '@/lib/recurring-expense-cycle';

/** null = jednorázově */
export type PersonalRecurringChoice = RecurringFrequency | null;

type Props = {
  value: PersonalRecurringChoice;
  onChange: (next: PersonalRecurringChoice) => void;
  label?: string;
};

/**
 * Stejný styl frekvence jako v household ExpenseFormModal,
 * plus volba „Jednorázově“.
 */
export function RecurringFrequencyField({ value, onChange, label }: Props) {
  const { colors } = useTheme();
  const { t } = useLanguageStore();

  const options = useMemo(
    () =>
      [
        { value: null as PersonalRecurringChoice, label: t('personalRecurring.once') },
        { value: 'weekly' as const, label: t('personalRecurring.everyWeek') },
        { value: 'monthly' as const, label: t('personalRecurring.everyMonth') },
        { value: 'quarterly' as const, label: t('personalRecurring.everyQuarter') },
        { value: 'biannual' as const, label: t('personalRecurring.everyHalfYear') },
        { value: 'yearly' as const, label: t('personalRecurring.everyYear') },
      ] as const,
    [t],
  );

  return (
    <View>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {label ?? t('personalRecurring.repeat')}
      </Text>
      <View style={styles.grid}>
        {options.map(({ value: opt, label: optLabel }) => {
          const isSelected = value === opt;
          return (
            <TouchableOpacity
              key={String(opt)}
              style={[
                styles.pill,
                isSelected
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: colors.muted },
              ]}
              onPress={() => onChange(opt)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.pillLabel,
                  isSelected ? styles.pillLabelSelected : { color: colors.text },
                ]}
              >
                {optLabel}
              </Text>
              {isSelected ? <Check color="#fff" size={16} style={styles.check} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  pillLabel: { fontSize: 13, fontWeight: '600' },
  pillLabelSelected: { color: '#FFFFFF' },
  check: { marginLeft: 2 },
});
