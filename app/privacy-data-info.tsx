import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { StackHeaderBackButton } from '@/components/BackButton';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';

export default function PrivacyDataInfoScreen() {
  const { colors } = useTheme();
  const { t } = useLanguageStore();

  const bullets = useMemo(
    () => [
      t('privacyDataEmail'),
      t('privacyDataName'),
      t('privacyDataTransactions'),
      t('privacyDataIncome'),
      t('privacyDataPhoto'),
    ],
    [t],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: t('privacyDataPrivacy'),
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.primary,
          headerLeft: ({ tintColor }) => (
            <StackHeaderBackButton tintColor={tintColor ?? colors.primary} />
          ),
          headerTitleStyle: { fontWeight: '700', color: colors.text },
        }}
      />
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.pad}>
        <Text style={[styles.lead, { color: colors.textSecondary }]}>{t('privacyDataProcessedIntro')}</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {bullets.map((line) => (
            <View key={line} style={styles.row}>
              <Text style={[styles.bullet, { color: colors.primary }]}>•</Text>
              <Text style={[styles.item, { color: colors.text }]}>{line}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.section, { color: colors.text }]}>{t('privacyDataWhereStored')}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{t('privacyDataRetention')}</Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pad: { padding: 20, paddingBottom: 40 },
  lead: { fontSize: 15, lineHeight: 22, marginBottom: 16 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 24 },
  row: { flexDirection: 'row', marginBottom: 8 },
  bullet: { marginRight: 8, fontSize: 15 },
  item: { flex: 1, fontSize: 15, lineHeight: 22 },
  section: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22 },
});
