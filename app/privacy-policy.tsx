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
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>MoneyBuddy</Text>
        <Text style={[styles.updated, { color: colors.textSecondary }]}>
          {tr('Poslední aktualizace: 26. 11. 2026', 'Last updated: 26 November 2026')}
        </Text>
        {language === 'en' ? (
          <Text style={[styles.updated, { color: colors.textSecondary, marginTop: -8 }]}>
            This is a translation for convenience; the Czech version is legally binding.
          </Text>
        ) : null}

        <Pressable onPress={() => openUrl(PRIVACY_POLICY_URL)} style={styles.webLink}>
          <Text style={[styles.webLinkText, { color: colors.primary }]}>{PRIVACY_POLICY_URL}</Text>
        </Pressable>

        <Section title={tr('1. Správce', '1. Controller')} colors={colors}>
          <Body colors={colors}>
            {tr(
              'Správcem osobních údajů je Jan Hájek, IČO 30080568, Komenského 481, 332 03 Šťáhlavy, provozovatel aplikace MoneyBuddy a webu moneybuddy.cz. Kontakt pro otázky k osobním údajům: privacy@moneybuddy.cz. Pověřence pro ochranu osobních údajů jsme nejmenovali, protože to zákon nevyžaduje.',
              'The controller is Jan Hájek, business ID (IČO) 30080568, Komenského 481, 332 03 Šťáhlavy, Czech Republic, operator of the MoneyBuddy app and moneybuddy.cz. Privacy contact: privacy@moneybuddy.cz. No data protection officer has been appointed as none is required by law.',
            )}
          </Body>
        </Section>

        <Section title={tr('2. Jaké údaje zpracováváme', '2. Data we process')} colors={colors}>
          <Bullet colors={colors}>
            {tr(
              'Účet: e-mail, jméno nebo přezdívka, heslo (jen v zašifrované podobě), profilová fotka, pokud ji nahraješ, souhlasy a datum registrace.',
              'Account: email, name or nickname, password (stored only in hashed form), profile photo if you upload one, consents and registration date.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Finanční údaje, které zadáš nebo nahraješ: transakce, kategorie, rozpočty, cíle, pravidelné platby, sdílené výdaje, investice, fotky účtenek přiložené k výdajům.',
              'Financial data you enter or import: transactions, categories, budgets, goals, recurring payments, shared expenses, investments, receipt photos attached to expenses.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Bankovní výpisy (PDF/CSV) a exporty od brokerů: zpracujeme je jen pro načtení transakcí, soubor samotný neukládáme.',
              'Bank statements (PDF/CSV) and broker exports: processed only to read the transactions; the file itself is not stored.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Fio API token: pokud ho zadáš, je uložený v tvém zařízení a použije se jen ke stažení tvých transakcí z Fio banky.',
              'Fio API token: if you enter it, it is stored on your device and used only to download your own Fio bank transactions.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Domácnost a skupiny: údaje, které sdílíš s partnerem nebo členy skupiny, a jména lidí, které do skupiny přidáš.',
              'Household and groups: data you share with your partner or group members, and names of people you add to a group.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Předplatné: anonymní identifikátor zákazníka, stav a historie předplatného z App Store nebo Google Play. Údaje o platební kartě nemáme.',
              'Subscription: an anonymous customer identifier and subscription status and history from the App Store or Google Play. We have no payment card details.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'AI průvodce: text otázek, které napíšeš, a počet dotazů za den.',
              'AI guide: the text of questions you type and the number of questions per day.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Technické údaje: typ zařízení, verze systému a aplikace, token pro push notifikace, záznamy o chybách a přihlášení.',
              'Technical data: device type, OS and app version, push notification token, error and sign-in logs.',
            )}
          </Bullet>
          <Body colors={colors}>
            {'\n'}
            {tr(
              'Nezpracováváme údaje o poloze, kontakty z telefonu, reklamní identifikátory ani údaje pro cílenou reklamu.',
              'We do not process location data, phone contacts, advertising identifiers or data for targeted advertising.',
            )}
          </Body>
        </Section>

        <Section title={tr('3. Proč a na jakém základě', '3. Purposes and legal bases')} colors={colors}>
          <Bullet colors={colors}>
            {tr(
              'Vytvoření účtu, evidence financí, přehledy, import, synchronizace s Fio – plnění smlouvy (čl. 6 odst. 1 písm. b) GDPR).',
              'Account, financial records, overviews, imports, Fio sync – performance of contract (Art. 6(1)(b) GDPR).',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Domácnost a skupiny – plnění smlouvy; sdílíš jen to, co sám nastavíš.',
              'Household and groups – performance of contract; only what you choose to share.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Předplatné a obnovení nákupů – plnění smlouvy.',
              'Subscription and restoring purchases – performance of contract.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'AI průvodce – plnění smlouvy, jen když funkci použiješ.',
              'AI guide – performance of contract, only when you use it.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Servisní e-maily (ověření e-mailu, reset hesla, uvítání, důležité změny) – plnění smlouvy.',
              'Service emails (email verification, password reset, welcome, important changes) – performance of contract.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Připomínky a notifikace – plnění smlouvy, jen když je zapneš.',
              'Reminders and notifications – performance of contract, only when you turn them on.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Newsletter, tipy a nabídky e-mailem – souhlas (čl. 6 odst. 1 písm. a) GDPR), lze kdykoli odvolat.',
              'Newsletter, tips and offers by email – consent (Art. 6(1)(a) GDPR), can be withdrawn at any time.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Zabezpečení, prevence zneužití, oprava chyb a vyřízení tvých dotazů – oprávněný zájem (čl. 6 odst. 1 písm. f) GDPR).',
              'Security, abuse prevention, bug fixing and handling your questions – legitimate interest (Art. 6(1)(f) GDPR).',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Účetní a daňové doklady – právní povinnost (čl. 6 odst. 1 písm. c) GDPR).',
              'Accounting and tax records – legal obligation (Art. 6(1)(c) GDPR).',
            )}
          </Bullet>
          <Body colors={colors}>
            {'\n'}
            {tr(
              'Automatické zařazování transakcí do kategorií je jen pomocná funkce. Neděláme žádná automatizovaná rozhodnutí s právními nebo podobně závažnými účinky a nevytváříme profily pro reklamu.',
              'Automatic categorisation of transactions is only a helper feature. We make no automated decisions with legal or similarly significant effects and do not build advertising profiles.',
            )}
          </Body>
        </Section>

        <Section title={tr('4. Komu údaje předáváme', '4. Recipients')} colors={colors}>
          <Body colors={colors}>
            {tr(
              'Údaje neprodáváme a nesdílíme pro reklamu. Používáme tyto zpracovatele, kteří s nimi smí nakládat jen podle našich pokynů:',
              'We do not sell data or share it for advertising. We use these processors, who may handle data only on our instructions:',
            )}
          </Body>
          <Bullet colors={colors}>
            {tr(
              'Supabase – databáze, přihlašování, úložiště souborů, serverové funkce (EU)',
              'Supabase – database, authentication, file storage, server functions (EU)',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Brevo (Sendinblue SAS) – servisní e-maily a newsletter (EU, Francie)',
              'Brevo (Sendinblue SAS) – service emails and newsletter (EU, France)',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'RevenueCat – správa a ověření předplatného (USA)',
              'RevenueCat – subscription management and verification (USA)',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Expo (650 Industries) – doručování push notifikací (USA)',
              'Expo (650 Industries) – push notification delivery (USA)',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Anthropic – odpovědi AI průvodce, jen text otázky, žádná finanční data (USA)',
              'Anthropic – AI guide answers, question text only, no financial data (USA)',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Apple, Google – distribuce aplikace a platby za předplatné, samostatní správci (EU / USA)',
              'Apple, Google – app distribution and subscription payments, independent controllers (EU / USA)',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Framer – hosting webu moneybuddy.cz (EU / USA)',
              'Framer – hosting of moneybuddy.cz (EU / USA)',
            )}
          </Bullet>
          <Body colors={colors}>
            {'\n'}
            {tr(
              'Kurzy od ČNB a ceny z Yahoo Finance stahujeme bez osobních údajů. Anthropic podle svých podmínek nepoužívá otázky k trénování AI a po krátké době je maže.',
              'Exchange rates from the Czech National Bank and prices from Yahoo Finance are fetched without personal data. Under its terms, Anthropic does not use questions to train AI and deletes them after a short period.',
            )}
          </Body>
        </Section>

        <Section title={tr('5. Předávání mimo EU', '5. Transfers outside the EU')} colors={colors}>
          <Body colors={colors}>
            {tr(
              'U zpracovatelů v USA je předání chráněné rozhodnutím Evropské komise o rámci EU–USA pro ochranu osobních údajů (Data Privacy Framework), pokud je zpracovatel certifikovaný, jinak standardními smluvními doložkami schválenými Evropskou komisí. Kopii záruk ti na vyžádání pošleme.',
              "Transfers to processors in the USA are covered by the European Commission's EU–US Data Privacy Framework adequacy decision where the processor is certified, and otherwise by Standard Contractual Clauses approved by the European Commission. We will send you a copy of the safeguards on request.",
            )}
          </Body>
        </Section>

        <Section title={tr('6. Jak dlouho údaje uchováváme', '6. Retention')} colors={colors}>
          <Bullet colors={colors}>
            {tr(
              'Účet a finanční data: po dobu existence účtu. Po smazání účtu je ihned odstraníme, ze záloh zmizí nejpozději do 30 dnů.',
              'Account and financial data: for as long as the account exists. After deletion they are removed immediately and disappear from backups within 30 days.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Bankovní výpisy a exporty: neukládáme, jen je zpracujeme.',
              'Bank statements and exports: not stored, only processed.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Kontakt pro newsletter: do odvolání souhlasu nebo smazání účtu.',
              'Newsletter contact: until consent is withdrawn or the account is deleted.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Technické záznamy a logy: nejdéle 90 dní.',
              'Technical records and logs: up to 90 days.',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Komunikace s podporou: 3 roky od vyřízení (kvůli případným nárokům).',
              'Support communication: 3 years after resolution (for possible claims).',
            )}
          </Bullet>
          <Bullet colors={colors}>
            {tr(
              'Účetní doklady: po dobu stanovenou zákonem (zpravidla 10 let).',
              'Accounting records: for the period required by law (usually 10 years).',
            )}
          </Bullet>
        </Section>

        <Section title={tr('7. Tvoje práva', '7. Your rights')} colors={colors}>
          <Body colors={colors}>
            {tr(
              'Máš právo na přístup ke svým údajům, opravu, výmaz, omezení zpracování, přenositelnost (export dat ve strojově čitelné podobě) a právo vznést námitku proti zpracování na základě oprávněného zájmu. Souhlas s newsletterem můžeš kdykoli odvolat v aplikaci nebo odkazem v každém e-mailu.',
              'You have the right of access, rectification, erasure, restriction of processing, data portability (export in a machine-readable format) and the right to object to processing based on legitimate interest. You can withdraw newsletter consent at any time in the app or via the link in every email.',
            )}
            {'\n\n'}
            {tr(
              'Veškerá data si stáhneš v Profil → Soukromí a bezpečnost → Správa dat a tamtéž můžeš smazat účet. Ostatní žádosti piš na privacy@moneybuddy.cz, odpovíme do 30 dnů.',
              'Download all your data in Profile → Privacy & Security → Data management, where you can also delete your account. Send other requests to privacy@moneybuddy.cz; we reply within 30 days.',
            )}
            {'\n\n'}
            {tr(
              'Máš také právo podat stížnost u Úřadu pro ochranu osobních údajů, Pplk. Sochora 27, 170 00 Praha 7, www.uoou.cz.',
              'You may also lodge a complaint with the Czech Office for Personal Data Protection (ÚOOÚ), Pplk. Sochora 27, 170 00 Prague 7, www.uoou.cz.',
            )}
          </Body>
        </Section>

        <Section title={tr('8. Zabezpečení', '8. Security')} colors={colors}>
          <Body colors={colors}>
            {tr(
              'Data jsou uložená v EU, přenášejí se šifrovaně (HTTPS) a každý uživatel má v databázi přístup jen ke svým údajům a k údajům, které s ním někdo sdílí. Aplikaci můžeš zamknout Face ID. Pokud by došlo k úniku dat s rizikem pro tebe, oznámíme ho ÚOOÚ do 72 hodin a tobě bez zbytečného odkladu.',
              'Data is stored in the EU, transmitted encrypted (HTTPS), and each user can access only their own data and data others share with them. You can lock the app with Face ID. If a data breach poses a risk to you, we will notify ÚOOÚ within 72 hours and you without undue delay.',
            )}
          </Body>
        </Section>

        <Section title={tr('9. Věk', '9. Age')} colors={colors}>
          <Body colors={colors}>
            {tr(
              'Aplikace je určená osobám starším 18 let. Vědomě nezpracováváme údaje dětí.',
              'The app is intended for people aged 18 and over. We do not knowingly process children\'s data.',
            )}
          </Body>
        </Section>

        <Section title={tr('10. Web a cookies', '10. Website and cookies')} colors={colors}>
          <Body colors={colors}>
            {tr(
              'Web moneybuddy.cz používá jen technicky nezbytné cookies potřebné pro jeho zobrazení. Pokud začneme měřit návštěvnost nebo používat reklamní nástroje, vyžádáme si předem souhlas přes cookie lištu.',
              'moneybuddy.cz uses only strictly necessary cookies required to display it. If we start measuring traffic or using advertising tools, we will ask for your consent in advance via a cookie banner.',
            )}
          </Body>
        </Section>

        <Section title={tr('11. Změny zásad', '11. Changes')} colors={colors}>
          <Body colors={colors}>
            {tr(
              'O podstatných změnách tě informujeme v aplikaci nebo e-mailem. Aktuální verze je vždy na moneybuddy.cz/privacy.',
              'We will inform you about material changes in the app or by email. The current version is always at moneybuddy.cz/privacy.',
            )}
          </Body>
        </Section>

        <Section title={tr('Kontakt', 'Contact')} colors={colors}>
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
