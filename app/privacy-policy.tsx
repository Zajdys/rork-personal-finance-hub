import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
} from 'react-native';
import { Stack } from 'expo-router';
import { StackHeaderBackButton } from '@/components/BackButton';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { PRIVACY_POLICY_URL } from '@/constants/legal-urls';

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: { text: string; textSecondary: string };
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function Body({ children, colors }: { children: React.ReactNode; colors: { textSecondary: string } }) {
  return <Text style={[styles.body, { color: colors.textSecondary }]}>{children}</Text>;
}

function Bullet({ children, colors }: { children: React.ReactNode; colors: { textSecondary: string } }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={[styles.bullet, { color: colors.textSecondary }]}>•</Text>
      <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{children}</Text>
    </View>
  );
}

export default function PrivacyPolicyScreen() {
  const { colors } = useTheme();
  const { t } = useLanguageStore();

  const openUrl = (url: string) => {
    void Linking.openURL(url);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t('privacyPolicyModalTitle'),
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.primary,
          headerLeft: ({ tintColor }) => (
            <StackHeaderBackButton tintColor={tintColor ?? colors.primary} />
          ),
          headerTitleStyle: { fontWeight: '700', color: colors.text },
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.pad}
        showsVerticalScrollIndicator
      >
        <Text style={[styles.mainTitle, { color: colors.text }]}>{t('privacyPolicyModalTitle')}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>MoneyBuddy – Czech Finance</Text>
        <Text style={[styles.updated, { color: colors.textSecondary }]}>{t('privacyPolicyLastUpdated')}</Text>

        <Pressable onPress={() => openUrl(PRIVACY_POLICY_URL)} style={styles.webLink}>
          <Text style={[styles.webLinkText, { color: colors.primary }]}>{PRIVACY_POLICY_URL}</Text>
        </Pressable>

        <Section title="1. Správce osobních údajů" colors={colors}>
          <Body colors={colors}>
            {`Aplikaci MoneyBuddy provozuje Jan Hájek (dále jen „my“ nebo „správce“).`}
            {'\n'}
            Kontakt:{' '}
            <Text style={{ color: colors.primary }} onPress={() => openUrl('mailto:privacy@moneybuddy.cz')}>
              privacy@moneybuddy.cz
            </Text>
          </Body>
        </Section>

        <Section title="2. Jaké údaje zpracováváme" colors={colors}>
          <Bullet colors={colors}>
            <Text style={styles.bold}>Údaje účtu:</Text> e-mailová adresa, jméno (volitelné)
          </Bullet>
          <Bullet colors={colors}>
            <Text style={styles.bold}>Finanční data:</Text> transakce, příjmy, výdaje, investice které sami zadáte
          </Bullet>
          <Bullet colors={colors}>
            <Text style={styles.bold}>Technické údaje:</Text> typ zařízení, verze OS, anonymní identifikátor
          </Bullet>
        </Section>

        <Section title="3. Proč údaje zpracováváme" colors={colors}>
          <Bullet colors={colors}>Poskytování služeb aplikace (správa financí, synchronizace)</Bullet>
          <Bullet colors={colors}>Sdílení dat v rámci domácnosti (pokud tuto funkci využíváte)</Bullet>
          <Bullet colors={colors}>Technická podpora a oprava chyb</Bullet>
        </Section>

        <Section title="4. Kde data ukládáme" colors={colors}>
          <Body colors={colors}>
            Data jsou uložena na serverech Supabase (EU region).{'\n'}
            Více informací:{' '}
            <Text style={{ color: colors.primary }} onPress={() => openUrl('https://supabase.com/privacy')}>
              supabase.com/privacy
            </Text>
          </Body>
        </Section>

        <Section title="5. Sdílení dat" colors={colors}>
          <Body colors={colors}>
            Vaše data NESDÍLÍME s třetími stranami za účelem reklamy.{'\n'}
            Data mohou být zpřístupněna pouze:
          </Body>
          <Bullet colors={colors}>Supabase (poskytovatel infrastruktury)</Bullet>
          <Bullet colors={colors}>Apple (technické údaje pro App Store)</Bullet>
        </Section>

        <Section title="6. Vaše práva" colors={colors}>
          <Body colors={colors}>Máte právo na:</Body>
          <Bullet colors={colors}>Přístup ke svým datům (export v sekci Profil → Exportovat data)</Bullet>
          <Bullet colors={colors}>Smazání účtu a všech dat (Profil → Smazat účet)</Bullet>
          <Bullet colors={colors}>Opravu nesprávných údajů</Bullet>
        </Section>

        <Section title="7. Bankovní výpisy" colors={colors}>
          <Body colors={colors}>
            PDF výpisy nahrané do aplikace jsou zpracovány na našich serverech (Supabase Edge Function) pouze za
            účelem extrakce transakcí. PDF soubory nejsou trvale ukládány.
          </Body>
        </Section>

        <Section title="8. Investiční data" colors={colors}>
          <Body colors={colors}>
            Ceny akcií jsou načítány z Yahoo Finance API. Do Yahoo Finance nejsou odesílána žádná vaše osobní data.
          </Body>
        </Section>

        <Section title="9. Kontakt" colors={colors}>
          <Pressable onPress={() => openUrl('mailto:privacy@moneybuddy.cz')}>
            <Text style={[styles.contact, { color: colors.primary }]}>privacy@moneybuddy.cz</Text>
          </Pressable>
        </Section>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pad: { padding: 20, paddingBottom: 40 },
  mainTitle: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 15, marginBottom: 4 },
  updated: { fontSize: 14, marginBottom: 16 },
  webLink: { marginBottom: 24 },
  webLinkText: { fontSize: 14, fontWeight: '600' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  body: { fontSize: 15, lineHeight: 24 },
  bulletRow: { flexDirection: 'row', marginBottom: 8, paddingRight: 8 },
  bullet: { marginRight: 8, fontSize: 15, lineHeight: 24 },
  bulletText: { flex: 1, fontSize: 15, lineHeight: 24 },
  bold: { fontWeight: '700' },
  contact: { fontSize: 16, fontWeight: '600' },
});
