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

export default function ImportGuideScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ onboarding?: string }>();
  const onboarding = params.onboarding === '1';
  const [bankId, setBankId] = useState<string | null>(null);
  const bank = BANKS.find((b) => b.id === bankId) ?? null;

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
      {onboarding ? null : <ScreenHeader title="Jak stáhnout výpis" />}
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: onboarding ? 64 : 16, paddingBottom: 140 }}>
        {onboarding ? (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.h1, { color: colors.text }]}>Poslední krok: nahraj výpis</Text>
            <Text style={[styles.lead, { color: colors.textSecondary }]}>
              MoneyBuddy z výpisu sám roztřídí platby do kategorií a ukáže ti, kam ti mizí peníze. Stačí výpis za poslední měsíc.
            </Text>
          </View>
        ) : (
          <Text style={[styles.lead, { color: colors.textSecondary, marginBottom: 16 }]}>
            Výpis stáhneš v aplikaci nebo internetovém bankovnictví své banky. Stačí poslední měsíc — PDF nebo CSV.
          </Text>
        )}

        <Text style={[styles.label, { color: colors.textSecondary }]}>Vyber svoji banku</Text>
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
              Názvy menu se mohou podle verze aplikace banky trochu lišit.
            </Text>
          </View>
        ) : null}

        <View style={cardStyle}>
          <View style={styles.cardHead}>
            <Smartphone color={colors.primary} size={20} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Stahuješ v mobilu?</Text>
          </View>
          <Text style={[styles.stepText, { color: colors.text }]}>
            Po stažení PDF zvol „Sdílet“ → „Uložit do Souborů“. V MoneyBuddy ho pak vybereš ze Souborů.
          </Text>
        </View>

        <View style={cardStyle}>
          <View style={styles.cardHead}>
            <Laptop color={colors.primary} size={20} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Stahuješ v počítači?</Text>
          </View>
          <Text style={[styles.stepText, { color: colors.text }]}>
            Pošli si soubor do mobilu — přes iCloud Drive, AirDrop nebo e-mailem sám sobě — a ulož ho do Souborů.
          </Text>
        </View>

        <View style={[styles.privacy, { backgroundColor: colors.muted }]}>
          <ShieldCheck color={colors.primary} size={18} />
          <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 }}>
            Výpis používáme jen k načtení tvých plateb. Data jsou šifrovaná a uložená v EU.
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
            <Text style={styles.primaryText}>Nahrát výpis</Text>
          </LinearGradient>
        </TouchableOpacity>
        {onboarding ? (
          <TouchableOpacity onPress={skip} style={{ paddingVertical: 12, alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Teď ne, nahraju později</Text>
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
