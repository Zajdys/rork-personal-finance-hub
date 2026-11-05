/**
 * Návod: jak stáhnout výpis z banky a nahrát ho do MoneyBuddy.
 * Po úvodním nastavení (onboarding=1) nabídne rovnou nahrání výpisu.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { FileText, Upload, Smartphone, Laptop, ShieldCheck } from 'lucide-react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';

type BankGuide = {
  id: string;
  name: string;
  format: string;
  steps: string[];
};

const BANKS: BankGuide[] = [
  {
    id: 'cs',
    name: 'Česká spořitelna',
    format: 'PDF nebo CSV',
    steps: [
      'Otevři George (aplikaci nebo george.csas.cz).',
      'Vyber svůj účet a najdi „Výpisy“ (v aplikaci bývají pod účtem v nabídce dokumentů).',
      'Stáhni PDF výpis za poslední měsíc.',
    ],
  },
  {
    id: 'csob',
    name: 'ČSOB',
    format: 'PDF nebo CSV',
    steps: [
      'Otevři ČSOB Smart nebo internetové bankovnictví.',
      'Vyber účet a přejdi do „Výpisy“ (případně „Dokumenty“).',
      'Stáhni PDF výpis za poslední měsíc.',
    ],
  },
  {
    id: 'kb',
    name: 'Komerční banka',
    format: 'PDF nebo CSV',
    steps: [
      'Otevři aplikaci KB+ nebo internetové bankovnictví KB.',
      'U účtu najdi „Výpisy“ (v dokumentech k účtu).',
      'Stáhni PDF výpis za poslední měsíc.',
    ],
  },
  {
    id: 'fio',
    name: 'Fio banka',
    format: 'PDF, CSV nebo automaticky',
    steps: [
      'Nejjednodušší: v MoneyBuddy napoj Fio přes API token (Profil → Bankovní účty) a transakce se načítají samy.',
      'Nebo v internetovém bankovnictví Fio otevři „Přehledy“ → pohyby na účtu a exportuj je do CSV.',
      'PDF výpisy najdeš v části „Výpisy“.',
    ],
  },
  {
    id: 'airbank',
    name: 'Air Bank',
    format: 'PDF',
    steps: [
      'Otevři aplikaci nebo internetové bankovnictví Air Bank.',
      'U účtu najdi „Výpisy“.',
      'Stáhni PDF výpis za poslední měsíc.',
    ],
  },
  {
    id: 'rb',
    name: 'Raiffeisenbank',
    format: 'PDF nebo CSV',
    steps: [
      'Otevři mobilní nebo online bankovnictví Raiffeisenbank.',
      'U účtu najdi „Výpisy“.',
      'Stáhni PDF výpis za poslední měsíc.',
    ],
  },
  {
    id: 'moneta',
    name: 'MONETA',
    format: 'PDF nebo CSV',
    steps: [
      'Otevři Smart Banku nebo Internet Banku.',
      'U účtu najdi „Výpisy“.',
      'Stáhni PDF výpis za poslední měsíc.',
    ],
  },
  {
    id: 'mbank',
    name: 'mBank',
    format: 'CSV',
    steps: [
      'Otevři internetové bankovnictví mBank.',
      'V historii transakcí zvol období (např. poslední měsíc).',
      'Exportuj historii do CSV.',
    ],
  },
  {
    id: 'revolut',
    name: 'Revolut',
    format: 'CSV',
    steps: [
      'V aplikaci Revolut otevři účet v Kč (nebo jiné měně).',
      'Najdi „Výpis“ (Statement) a vyber formát Excel/CSV.',
      'Zvol období a výpis vygeneruj.',
    ],
  },
];

/** Anglická verze formátu a kroků (podle id banky). */
const BANKS_EN: Record<string, { format: string; steps: string[] }> = {
  cs: {
    format: 'PDF or CSV',
    steps: [
      'Open George (the app or george.csas.cz).',
      'Choose your account and find “Výpisy” (Statements) — in the app usually under the account’s documents menu.',
      'Download the PDF statement for the last month.',
    ],
  },
  csob: {
    format: 'PDF or CSV',
    steps: [
      'Open ČSOB Smart or internet banking.',
      'Choose the account and go to “Výpisy” (Statements) or “Dokumenty” (Documents).',
      'Download the PDF statement for the last month.',
    ],
  },
  kb: {
    format: 'PDF or CSV',
    steps: [
      'Open the KB+ app or KB internet banking.',
      'Find “Výpisy” (Statements) in the account’s documents.',
      'Download the PDF statement for the last month.',
    ],
  },
  fio: {
    format: 'PDF, CSV or automatic',
    steps: [
      'Easiest: connect Fio in MoneyBuddy with an API token (Profile → Banks & Accounts) and transactions load automatically.',
      'Or in Fio internet banking open “Přehledy” (Overviews) → account transactions and export them to CSV.',
      'PDF statements are in the “Výpisy” (Statements) section.',
    ],
  },
  airbank: {
    format: 'PDF',
    steps: [
      'Open the Air Bank app or internet banking.',
      'Find “Výpisy” (Statements) under the account.',
      'Download the PDF statement for the last month.',
    ],
  },
  rb: {
    format: 'PDF or CSV',
    steps: [
      'Open Raiffeisenbank mobile or online banking.',
      'Find “Výpisy” (Statements) under the account.',
      'Download the PDF statement for the last month.',
    ],
  },
  moneta: {
    format: 'PDF or CSV',
    steps: [
      'Open Smart Banka or Internet Banka.',
      'Find “Výpisy” (Statements) under the account.',
      'Download the PDF statement for the last month.',
    ],
  },
  mbank: {
    format: 'CSV',
    steps: [
      'Open mBank internet banking.',
      'In the transaction history choose a period (e.g. the last month).',
      'Export the history to CSV.',
    ],
  },
  revolut: {
    format: 'CSV',
    steps: [
      'In the Revolut app open your CZK (or other currency) account.',
      'Find “Statement” and choose the Excel/CSV format.',
      'Pick the period and generate the statement.',
    ],
  },
};

export default function ImportGuideScreen() {
  const { colors, isDark } = useTheme();
  const { tr, language } = useLanguageStore();
  const router = useRouter();
  const params = useLocalSearchParams<{ onboarding?: string }>();
  const onboarding = params.onboarding === '1';
  const [bankId, setBankId] = useState<string | null>(null);
  const bankCs = BANKS.find((b) => b.id === bankId) ?? null;
  const bank =
    bankCs && language === 'en' && BANKS_EN[bankCs.id] ? { ...bankCs, ...BANKS_EN[bankCs.id] } : bankCs;

  const goImport = () => {
    if (onboarding) {
      // Pod import dát hlavní obrazovku, ať „Zpět“ z importu vede do appky.
      router.replace('/(tabs)');
      setTimeout(() => router.push('/bank-import'), 50);
    } else {
      router.push('/bank-import');
    }
  };
  const skip = () => router.replace('/(tabs)');

  const cardStyle = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !onboarding }} />
      {onboarding ? null : <ScreenHeader title={tr('Jak stáhnout výpis', 'How to get a statement')} />}
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: onboarding ? 64 : 16, paddingBottom: 140 }}>
        {onboarding ? (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.h1, { color: colors.text }]}>{tr('Poslední krok: nahraj výpis', 'Last step: upload a statement')}</Text>
            <Text style={[styles.lead, { color: colors.textSecondary }]}>
              {tr(
                'MoneyBuddy z výpisu sám roztřídí platby do kategorií a ukáže ti, kam ti mizí peníze. Stačí výpis za poslední měsíc.',
                'MoneyBuddy sorts the payments from your statement into categories and shows you where your money goes. Last month’s statement is enough.',
              )}
            </Text>
          </View>
        ) : (
          <Text style={[styles.lead, { color: colors.textSecondary, marginBottom: 16 }]}>
            {tr(
              'Výpis stáhneš v aplikaci nebo internetovém bankovnictví své banky. Stačí poslední měsíc — PDF nebo CSV.',
              'Download the statement in your bank’s app or internet banking. The last month is enough — PDF or CSV.',
            )}
          </Text>
        )}

        <Text style={[styles.label, { color: colors.textSecondary }]}>{tr('Vyber svoji banku', 'Choose your bank')}</Text>
        <View style={styles.chips}>
          {BANKS.map((b) => {
            const sel = b.id === bankId;
            return (
              <TouchableOpacity
                key={b.id}
                onPress={() => setBankId(sel ? null : b.id)}
                style={[
                  styles.chip,
                  {
                    borderColor: sel ? colors.primary : colors.border,
                    backgroundColor: sel ? (isDark ? '#312E81' : '#EEF2FF') : colors.card,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
              >
                <Text style={{ color: colors.text, fontWeight: sel ? '700' : '500', fontSize: 14 }}>{b.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {bank ? (
          <View style={cardStyle}>
            <View style={styles.cardHead}>
              <FileText color={colors.primary} size={20} />
              <Text style={[styles.cardTitle, { color: colors.text }]}>{bank.name}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{bank.format}</Text>
            </View>
            {bank.steps.map((s, i) => (
              <View key={i} style={styles.step}>
                <View style={[styles.stepNum, { backgroundColor: colors.primary }]}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={[styles.stepText, { color: colors.text }]}>{s}</Text>
              </View>
            ))}
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>
              {tr('Názvy menu se mohou podle verze aplikace banky trochu lišit.', 'Menu names may differ slightly depending on your bank’s app version.')}
            </Text>
          </View>
        ) : null}

        <View style={cardStyle}>
          <View style={styles.cardHead}>
            <Smartphone color={colors.primary} size={20} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>{tr('Stahuješ v mobilu?', 'Downloading on your phone?')}</Text>
          </View>
          <Text style={[styles.stepText, { color: colors.text }]}>
            {tr(
              'Po stažení PDF zvol „Sdílet“ → „Uložit do Souborů“. V MoneyBuddy ho pak vybereš ze Souborů.',
              'After downloading the PDF choose “Share” → “Save to Files”. Then pick it from Files in MoneyBuddy.',
            )}
          </Text>
        </View>

        <View style={cardStyle}>
          <View style={styles.cardHead}>
            <Laptop color={colors.primary} size={20} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>{tr('Stahuješ v počítači?', 'Downloading on a computer?')}</Text>
          </View>
          <Text style={[styles.stepText, { color: colors.text }]}>
            {tr(
              'Pošli si soubor do mobilu — přes iCloud Drive, AirDrop nebo e-mailem sám sobě — a ulož ho do Souborů.',
              'Send the file to your phone — via iCloud Drive, AirDrop or by e-mailing yourself — and save it to Files.',
            )}
          </Text>
        </View>

        <View style={[styles.privacy, { backgroundColor: colors.muted }]}>
          <ShieldCheck color={colors.primary} size={18} />
          <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 }}>
            {tr(
              'Výpis používáme jen k načtení tvých plateb. Data jsou šifrovaná a uložená v EU.',
              'We use the statement only to load your payments. Data is encrypted and stored in the EU.',
            )}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity onPress={goImport} activeOpacity={0.9} accessibilityRole="button">
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.primary}
          >
            <Upload color="#fff" size={20} />
            <Text style={styles.primaryText}>{tr('Nahrát výpis', 'Upload statement')}</Text>
          </LinearGradient>
        </TouchableOpacity>
        {onboarding ? (
          <TouchableOpacity onPress={skip} style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>{tr('Teď ne, nahraju později', 'Not now, I’ll upload later')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: '800', marginBottom: 8 },
  lead: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
  step: { flexDirection: 'row', gap: 10, marginBottom: 10, alignItems: 'flex-start' },
  stepNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  stepText: { fontSize: 14, lineHeight: 20, flex: 1 },
  privacy: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: 12 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 32, borderTopWidth: StyleSheet.hairlineWidth },
  primary: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16 },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
