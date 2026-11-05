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
import { ScreenHeader } from '@/components/ScreenHeader';
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
  const { t, tr, language } = useLanguageStore();

  const openUrl = (url: string) => {
    void Linking.openURL(url);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={t('privacyPolicyModalTitle')} />

      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.pad}
        showsVerticalScrollIndicator
      >
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>MoneyBuddy – Czech Finance</Text>
        <Text style={[styles.updated, { color: colors.textSecondary }]}>
          {tr('Poslední aktualizace: 29. 10. 2026', 'Last updated: 29 October 2026')}
        </Text>
        {language === 'en' ? (
          <Text style={[styles.updated, { color: colors.textSecondary, marginTop: -8 }]}>
            This is a translation for convenience; the Czech version is legally binding.
          </Text>
        ) : null}

        <Pressable onPress={() => openUrl(PRIVACY_POLICY_URL)} style={styles.webLink}>
          <Text style={[styles.webLinkText, { color: colors.primary }]}>{PRIVACY_POLICY_URL}</Text>
        </Pressable>

        <Section title={tr('1. Správce osobních údajů', '1. Data controller')} colors={colors}>
          <Body colors={colors}>
            {tr(
              'Aplikaci MoneyBuddy provozuje Jan Hájek (dále jen „my“ nebo „správce“).',
              'The MoneyBuddy app is operated by Jan Hájek (“we” or the “controller”).',
            )}
            {'\n'}
            {tr('Kontakt', 'Contact')}:{' '}
            <Text style={{ color: colors.primary }} onPress={() => openUrl('mailto:privacy@moneybuddy.cz')}>
              privacy@moneybuddy.cz
            </Text>
          </Body>
        </Section>

        <Section title={tr('2. Jaké údaje zpracováváme', '2. What data we process')} colors={colors}>
          <Bullet colors={colors}>
            <Text style={styles.bold}>{tr('Údaje účtu:', 'Account data:')}</Text>{' '}
            {tr('e-mailová adresa, jméno (volitelné)', 'e-mail address, name (optional)')}
          </Bullet>
          <Bullet colors={colors}>
            <Text style={styles.bold}>{tr('Finanční data:', 'Financial data:')}</Text>{' '}
            {tr(
              'transakce, příjmy, výdaje, investice které sami zadáte',
              'transactions, income, expenses and investments you enter yourself',
            )}
          </Bullet>
          <Bullet colors={colors}>
            <Text style={styles.bold}>{tr('Technické údaje:', 'Technical data:')}</Text>{' '}
            {tr('typ zařízení, verze OS, anonymní identifikátor', 'device type, OS version, anonymous identifier')}
          </Bullet>
          <Bullet colors={colors}>
            <Text style={styles.bold}>{tr('Předplatné:', 'Subscription:')}</Text>{' '}
            {tr(
              'stav nákupu přes App Store / Google Play (RevenueCat)',
              'purchase status via the App Store / Google Play (RevenueCat)',
            )}
          </Bullet>
          <Bullet colors={colors}>
            <Text style={styles.bold}>{tr('Notifikace:', 'Notifications:')}</Text>{' '}
            {tr('push token zařízení (Expo)', 'device push token (Expo)')}
          </Bullet>
          <Bullet colors={colors}>
            <Text style={styles.bold}>{tr('E-maily s novinkami:', 'Newsletter e-mails:')}</Text>{' '}
            {tr(
              'jen s tvým výslovným souhlasem (zaškrtnutí při registraci nebo v Profil → Notifikace). Souhlas můžeš kdykoli odvolat tamtéž nebo odkazem v patičce každého e-mailu.',
              'only with your explicit consent (a checkbox at sign-up or in Profile → Notifications). You can withdraw consent at any time in the same place or via the link in the footer of every e-mail.',
            )}
          </Bullet>
        </Section>

        <Section title={tr('3. Proč údaje zpracováváme', '3. Why we process data')} colors={colors}>
          <Bullet colors={colors}>
            {tr('Poskytování služeb aplikace (správa financí, synchronizace)', 'Providing the app’s services (managing finances, sync)')}
          </Bullet>
          <Bullet colors={colors}>
            {tr('Sdílení dat v rámci domácnosti (pokud tuto funkci využíváte)', 'Sharing data within a household (if you use this feature)')}
          </Bullet>
          <Bullet colors={colors}>{tr('Správa předplatného a obnovení nákupů', 'Managing subscriptions and restoring purchases')}</Bullet>
          <Bullet colors={colors}>{tr('Technická podpora a oprava chyb', 'Technical support and bug fixing')}</Bullet>
          <Bullet colors={colors}>
            {tr('Připomínky splatností a předplatného (pokud je povolíte)', 'Payment and subscription reminders (if you enable them)')}
          </Bullet>
        </Section>

        <Section title={tr('4. Kde data ukládáme', '4. Where we store data')} colors={colors}>
          <Body colors={colors}>
            {tr('Data jsou uložena na serverech Supabase (EU region).', 'Data is stored on Supabase servers (EU region).')}
            {'\n'}
            {tr('Více informací', 'More information')}:{' '}
            <Text style={{ color: colors.primary }} onPress={() => openUrl('https://supabase.com/privacy')}>
              supabase.com/privacy
            </Text>
          </Body>
        </Section>

        <Section title={tr('5. Sdílení dat / zpracovatelé', '5. Data sharing / processors')} colors={colors}>
          <Body colors={colors}>
            {tr(
              'Vaše data NESDÍLÍME s třetími stranami za účelem reklamy.',
              'We do NOT share your data with third parties for advertising.',
            )}
            {'\n'}
            {tr('Zpracovatelé v rozsahu nutném pro provoz:', 'Processors, to the extent necessary to run the service:')}
          </Body>
          <Bullet colors={colors}>
            {tr(
              'Supabase (infrastruktura, databáze, autentizace) — EU',
              'Supabase (infrastructure, database, authentication) — EU',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'RevenueCat (předplatné a ověření nákupů App Store / Google Play)',
              'RevenueCat (subscriptions and App Store / Google Play purchase verification)',
            )}
          </Bullet>
          <Bullet colors={colors}>{tr('Expo (doručování push notifikací)', 'Expo (push notification delivery)')}</Bullet>
          <Bullet colors={colors}>
            {tr(
              'Anthropic (AI průvodce „Zeptej se MoneyBuddy“ — zpracuje jen text otázky, kterou sám napíšeš, bez tvých finančních dat; nepoužívá se k trénování)',
              'Anthropic (the “Ask MoneyBuddy” AI guide — processes only the text of the question you type, without your financial data; not used for training)',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Brevo (odesílání e-mailů — obnova hesla, uvítací e-mail a novinky, pokud k nim dáš souhlas) — EU',
              'Brevo (sending e-mails — password reset, welcome e-mail and news if you consent) — EU',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr('ČNB (veřejné kurzy měn; neodesíláme osobní údaje)', 'Czech National Bank (public exchange rates; no personal data sent)')}
          </Bullet>
          <Bullet colors={colors}>
            {tr('Yahoo Finance (tržní ceny; neodesíláme osobní údaje)', 'Yahoo Finance (market prices; no personal data sent)')}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Apple / Google (technické údaje a platby přes obchod s aplikacemi)',
              'Apple / Google (technical data and payments via the app store)',
            )}
          </Bullet>
        </Section>

        <Section title={tr('6. Automatické napojení banky', '6. Automatic bank connection')} colors={colors}>
          <Body colors={colors}>
            {tr(
              'Automatické napojení bank připravujeme; v aktuální verzi se nepoužívá – výpisy nahráváš ručně (PDF/CSV) nebo přes Fio API token.',
              'Automatic bank connection is in preparation; it isn’t used in the current version – you upload statements manually (PDF/CSV) or via a Fio API token.',
            )}
          </Body>
        </Section>

        <Section title={tr('7. Vaše práva', '7. Your rights')} colors={colors}>
          <Body colors={colors}>{tr('Máte právo na:', 'You have the right to:')}</Body>
          <Bullet colors={colors}>
            {tr(
              'Přístup ke svým datům (Profil → Soukromí a bezpečnost → Správa dat)',
              'Access your data (Profile → Privacy & Security → Data management)',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Smazání účtu a všech dat (Profil → Soukromí a bezpečnost → Správa dat → Smazat účet)',
              'Delete your account and all data (Profile → Privacy & Security → Data management → Delete account)',
            )}
          </Bullet>
          <Bullet colors={colors}>{tr('Opravu nesprávných údajů', 'Correct inaccurate data')}</Bullet>
        </Section>

        <Section title={tr('8. Bankovní výpisy (PDF / CSV)', '8. Bank statements (PDF / CSV)')} colors={colors}>
          <Body colors={colors}>
            {tr(
              'PDF a CSV výpisy jsou zpracovány na našich serverech (Supabase Edge Function) nebo na zařízení pouze za účelem extrakce transakcí. PDF soubory nejsou trvale ukládány.',
              'PDF and CSV statements are processed on our servers (Supabase Edge Function) or on your device solely to extract transactions. PDF files are not stored permanently.',
            )}
          </Body>
        </Section>

        <Section title={tr('9. Investiční data', '9. Investment data')} colors={colors}>
          <Body colors={colors}>
            {tr(
              'Ceny akcií: Yahoo Finance API. Kurzy měn: veřejné API České národní banky (ČNB). Do těchto služeb neodesíláme osobní údaje.',
              'Stock prices: Yahoo Finance API. Exchange rates: the public API of the Czech National Bank (ČNB). We don’t send personal data to these services.',
            )}
          </Body>
        </Section>

        <Section title={tr('10. Kontakt', '10. Contact')} colors={colors}>
          <Pressable onPress={() => openUrl('mailto:privacy@moneybuddy.cz')}>
            <Text style={[styles.contact, { color: colors.primary }]}>privacy@moneybuddy.cz</Text>
          </Pressable>
        </Section>
      </ScrollView>
    </View>
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
