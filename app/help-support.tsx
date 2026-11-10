/**
 * Nápověda a podpora — rychlé akce + FAQ podle témat (aktuální podoba appky).
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import {
  ChevronDown,
  FileUp,
  Mail,
  CreditCard,
  ShieldCheck,
  Sparkles,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { IS_ANDROID_STORE, MANAGE_SUBSCRIPTIONS_URL } from '@/lib/store-platform';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Faq = { q: string; a: string };
type FaqGroup = { title: string; items: Faq[] };

const FAQ: FaqGroup[] = [
  {
    title: 'Začínáme',
    items: [
      {
        q: 'Jak nahraju výpis z banky?',
        a: 'Klepni na + uprostřed dole → „Nahrát výpis z banky“ (nebo Přehled → Rychlé akce → Nahrát výpis). Vyber PDF nebo CSV ze Souborů, zkontroluj náhled a potvrď. Stejný výpis můžeš nahrát znovu — duplicity se přeskočí.',
      },
      {
        q: 'Které banky podporujete?',
        a: 'PDF výpisy: Česká spořitelna, ČSOB, Komerční banka, Fio, Air Bank, Raiffeisenbank a MONETA. CSV: navíc mBank a Revolut. Fio můžeš v Premium napojit automaticky přes API token (Profil → Bankovní účty).',
      },
      {
        q: 'Jak přidám výdaj ručně?',
        a: 'Klepni na + uprostřed dole, zadej částku, popis a kategorii. U plateb, které se opakují (nájem, Netflix), zvol „Opakovat“ — přidají se do Pravidelných plateb.',
      },
      {
        q: 'Jak změním kategorii platby?',
        a: 'Klepni na platbu v seznamu a vyber jinou kategorii nebo podkategorii. Vlastní kategorii vytvoříš přes „+ Vlastní“ v nabídce kategorií.',
      },
    ],
  },
  {
    title: 'Plán a rozpočty',
    items: [
      {
        q: 'Jak funguje Plán?',
        a: 'Plán počítá: příjem − pravidelné platby − rozpočty − spoření = volné peníze. Příjem, nájem, energie a úvěry nastavíš v Profil → Upravit plán, rozpočty a cíle přímo v Plánu.',
      },
      {
        q: 'Co znamená „Rozpočty: zbývá“ na Přehledu?',
        a: 'Kolik ti ještě zbývá utratit v rozpočtech, které sis nastavil (jídlo, doprava…), a kolik to dělá na den do konce měsíce.',
      },
      {
        q: 'Jak odškrtnu zaplacenou platbu?',
        a: 'Profil → Pravidelné platby (nebo dlaždice Pravidelné platby na Přehledu). U platby klepni na kolečko — zapíše se jako výdaj. Pokud nahráváš výpisy, platby z výpisu se spárují a odškrtnou samy.',
      },
    ],
  },
  {
    title: 'Domácnost',
    items: [
      {
        q: 'Jak pozvu partnera?',
        a: 'Na záložce Domácnost klepni na ikonu pozvání a pošli partnerovi pozvánku nebo kód. Partner si nainstaluje MoneyBuddy, zaregistruje se a kód zadá.',
      },
      {
        q: 'Co partner uvidí?',
        a: 'Jen to, co sdílíte v Domácnosti — společné a pravidelné výdaje a vyrovnání. Tvoje osobní platby a výpisy nevidí.',
      },
    ],
  },
  {
    title: 'Premium a předplatné',
    items: [
      {
        q: 'Co získám s Premium?',
        a: 'Domácnost s partnerem, neomezený import výpisů, automatickou synchronizaci Fio, neomezené rozpočty s upozorněním, spořicí cíle, Ušetři, investice a měsíční reporty. Nový uživatel má 14 dní zdarma. Domácnost odemyká Premium oběma partnerům, i když platí jen jeden.',
      },
      {
        q: 'Jak zruším předplatné?',
        a: IS_ANDROID_STORE
          ? 'Předplatné spravuje Google Play: Profil → Můj účet → Spravovat předplatné, nebo Google Play → Platby a předplatná → Předplatná → MoneyBuddy. Zrušit ho můžeš kdykoli, Premium ti vydrží do konce zaplaceného období.'
          : 'Předplatné spravuje Apple: Profil → Můj účet → Spravovat předplatné, nebo Nastavení iPhonu → tvoje jméno → Předplatná → MoneyBuddy. Zrušit ho můžeš kdykoli, Premium ti vydrží do konce zaplaceného období.',
      },
      {
        q: 'Koupil jsem Premium, ale nemám ho.',
        a: IS_ANDROID_STORE
          ? 'Profil → Můj účet → „Obnovit předchozí nákupy“. Předplatné patří k účtu Google — musíš být v Google Play přihlášený stejným účtem, kterým jsi platil.'
          : 'Profil → Můj účet → „Obnovit předchozí nákupy“. Předplatné patří k Apple ID — musíš být přihlášený stejným Apple ID, kterým jsi platil.',
      },
    ],
  },
  {
    title: 'Účet a bezpečnost',
    items: [
      {
        q: 'Jsou moje data v bezpečí?',
        a: 'Data jsou šifrovaná a uložená na serverech v EU. Neprodáváme je a nikomu je nedáváme. Appku si navíc můžeš zamknout PIN kódem nebo Face ID (Profil → Soukromí a bezpečnost).',
      },
      {
        q: 'Zapomněl jsem heslo.',
        a: 'Na přihlašovací obrazovce klepni na „Zapomněl jsi heslo?“. Pošleme ti na e-mail kód, kterým si nastavíš nové heslo. Když jsi přihlášený, změníš ho v Profil → Změnit heslo.',
      },
      {
        q: 'Jak si stáhnu svoje data?',
        a: 'Profil → Soukromí a bezpečnost → Export dat. Dostaneš soubor se všemi svými daty.',
      },
      {
        q: 'Jak smažu účet?',
        a: 'Profil → Soukromí a bezpečnost → Smazat účet. Smazání je nevratné a odstraní všechna tvoje data. Aktivní předplatné je potřeba zrušit zvlášť u ' + (IS_ANDROID_STORE ? 'Google Play.' : 'Applu.'),
      },
    ],
  },
];

const FAQ_EN: FaqGroup[] = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'How do I upload a bank statement?',
        a: 'Tap + at the bottom centre → “Upload bank statement” (or Overview → Quick Actions → Upload statement). Pick a PDF or CSV from Files, check the preview and confirm. You can upload the same statement again — duplicates are skipped.',
      },
      {
        q: 'Which banks are supported?',
        a: 'PDF statements: Česká spořitelna, ČSOB, Komerční banka, Fio, Air Bank, Raiffeisenbank and MONETA. CSV: also mBank and Revolut. With Premium you can connect Fio automatically via an API token (Profile → Banks & Accounts).',
      },
      {
        q: 'How do I add an expense manually?',
        a: 'Tap + at the bottom centre and enter the amount, description and category. For payments that repeat (rent, Netflix), choose “Repeat” — they will be added to Regular payments.',
      },
      {
        q: 'How do I change a payment’s category?',
        a: 'Tap the payment in the list and pick another category or subcategory. You can create your own category with “+ Custom” in the category picker.',
      },
    ],
  },
  {
    title: 'Plan & budgets',
    items: [
      {
        q: 'How does the Plan work?',
        a: 'The Plan calculates: income − regular payments − budgets − savings = free money. Set your income, rent, energy and loans in Profile → Edit plan; budgets and goals directly in the Plan.',
      },
      {
        q: 'What does “Budgets: left” on the Overview mean?',
        a: 'How much you still have left to spend in the budgets you set (food, transport…) and how much that is per day until the end of the month.',
      },
      {
        q: 'How do I tick off a paid payment?',
        a: 'Profile → Regular payments (or the Regular payments tile on the Overview). Tap the circle next to a payment — it is recorded as an expense. If you upload statements, payments from the statement are matched and ticked off automatically.',
      },
    ],
  },
  {
    title: 'Household',
    items: [
      {
        q: 'How do I invite my partner?',
        a: 'On the Household tab tap the invite icon and send your partner an invitation or a code. Your partner installs MoneyBuddy, signs up and enters the code.',
      },
      {
        q: 'What will my partner see?',
        a: 'Only what you share in the Household — shared and regular expenses and settlements. Your personal payments and statements stay private.',
      },
    ],
  },
  {
    title: 'Premium & subscription',
    items: [
      {
        q: 'What do I get with Premium?',
        a: 'Household with a partner, unlimited statement imports, automatic Fio sync, unlimited budgets with alerts, savings goals, Save, investments and monthly reports. New users get 14 days free. A Household unlocks Premium for both partners, even if only one pays.',
      },
      {
        q: 'How do I cancel my subscription?',
        a: IS_ANDROID_STORE
          ? 'Subscriptions are managed by Google Play: Profile → My account → Manage subscription, or Google Play → Payments & subscriptions → Subscriptions → MoneyBuddy. You can cancel any time; Premium stays active until the end of the paid period.'
          : 'Subscriptions are managed by Apple: Profile → My account → Manage subscription, or iPhone Settings → your name → Subscriptions → MoneyBuddy. You can cancel any time; Premium stays active until the end of the paid period.',
      },
      {
        q: 'I bought Premium but don’t have it.',
        a: IS_ANDROID_STORE
          ? 'Profile → My account → “Restore purchases”. The subscription belongs to your Google account — you must be signed in to Google Play with the same account you paid with.'
          : 'Profile → My account → “Restore purchases”. The subscription belongs to your Apple ID — you must be signed in with the same Apple ID you paid with.',
      },
    ],
  },
  {
    title: 'Account & security',
    items: [
      {
        q: 'Is my data safe?',
        a: 'Your data is encrypted and stored on servers in the EU. We don’t sell it or share it with anyone. You can also lock the app with a PIN or Face ID (Profile → Privacy & Security).',
      },
      {
        q: 'I forgot my password.',
        a: 'On the sign-in screen tap “Forgot password?”. We’ll e-mail you a code to set a new password. If you are signed in, you can change it in Profile → Change password.',
      },
      {
        q: 'How do I download my data?',
        a: 'Profile → Privacy & Security → Export data. You’ll get a file with all your data.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Profile → Privacy & Security → Delete account. Deletion is permanent and removes all your data. An active subscription must be cancelled separately with ' + (IS_ANDROID_STORE ? 'Google Play.' : 'Apple.'),
      },
    ],
  },
];

export default function HelpSupportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { tr, language } = useLanguageStore();
  const faq = language === 'en' ? FAQ_EN : FAQ;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const toggle = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenKey((prev) => (prev === key ? null : key));
  }, []);

  const openMail = useCallback(() => {
    void Linking.openURL(`mailto:info@moneybuddy.cz?subject=MoneyBuddy%20${language === 'en' ? 'support' : 'podpora'}`);
  }, [language]);

  const quick: { icon: LucideIcon; title: string; sub: string; onPress: () => void }[] = [
    {
      icon: FileUp,
      title: tr('Jak stáhnout výpis', 'How to get a statement'),
      sub: tr('Návod pro tvoji banku', 'Guide for your bank'),
      onPress: () => router.push('/import-guide' as never),
    },
    {
      icon: Mail,
      title: tr('Napiš nám', 'Contact us'),
      sub: 'info@moneybuddy.cz',
      onPress: openMail,
    },
    {
      icon: CreditCard,
      title: tr('Předplatné', 'Subscription'),
      sub: IS_ANDROID_STORE ? tr('Spravovat v Google Play', 'Manage in Google Play') : tr('Spravovat u Applu', 'Manage with Apple'),
      onPress: () => void Linking.openURL(MANAGE_SUBSCRIPTIONS_URL),
    },
    {
      icon: ShieldCheck,
      title: tr('Zásady', 'Policies'),
      sub: tr('Ochrana údajů a podmínky', 'Privacy & terms'),
      onPress: () => router.push('/privacy-policy' as never),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={tr('Nápověda a podpora', 'Help & support')}
        subtitle={tr('Rychlé odpovědi a kontakt', 'Quick answers and contact')}
        variant="gradient"
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          onPress={() => router.push('/help-chat' as never)}
          activeOpacity={0.9}
          accessibilityRole="button"
          style={[styles.aiCard, { backgroundColor: colors.primary }]}
        >
          <View style={styles.aiIcon}>
            <Sparkles color="#fff" size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>{tr('Zeptej se MoneyBuddy', 'Ask MoneyBuddy')}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 }}>
              {tr('AI průvodce poradí, kde co v appce najdeš', 'AI guide helps you find your way around the app')}
            </Text>
          </View>
          <ChevronRight color="#fff" size={20} />
        </TouchableOpacity>

        <View style={styles.grid}>
          {quick.map((q) => {
            const Icon = q.icon;
            return (
              <TouchableOpacity
                key={q.title}
                style={[styles.quick, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={q.onPress}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <View style={[styles.quickIcon, { backgroundColor: colors.muted }]}>
                  <Icon color={colors.primary} size={20} />
                </View>
                <Text style={[styles.quickTitle, { color: colors.text }]}>{q.title}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                  {q.sub}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {faq.map((group) => (
          <View key={group.title} style={{ marginTop: 18 }}>
            <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>{group.title.toLocaleUpperCase(language === 'en' ? 'en' : 'cs')}</Text>
            <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {group.items.map((item, i) => {
                const key = `${group.title}-${i}`;
                const open = openKey === key;
                return (
                  <View
                    key={key}
                    style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : undefined}
                  >
                    <TouchableOpacity
                      style={styles.faqHeader}
                      onPress={() => toggle(key)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                    >
                      <Text style={[styles.faqQ, { color: colors.text }]}>{item.q}</Text>
                      <ChevronDown
                        color={colors.textSecondary}
                        size={18}
                        style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
                      />
                    </TouchableOpacity>
                    {open ? <Text style={[styles.faqA, { color: colors.textSecondary }]}>{item.a}</Text> : null}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <View style={[styles.contact, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.contactTitle, { color: colors.text }]}>{tr('Nenašel jsi odpověď?', 'Didn’t find an answer?')}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
            {tr('Napiš nám — odpovídáme obvykle do 1–2 pracovních dnů.', 'Write to us — we usually reply within 1–2 business days.')}
          </Text>
          <TouchableOpacity
            style={[styles.mailBtn, { backgroundColor: colors.primary }]}
            onPress={openMail}
            activeOpacity={0.9}
          >
            <Mail color="#fff" size={18} />
            <Text style={styles.mailBtnText}>{tr('Napsat na info@moneybuddy.cz', 'E-mail info@moneybuddy.cz')}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.version, { color: colors.textSecondary }]}>MoneyBuddy {version}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  aiCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18, marginBottom: 12 },
  aiIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quick: { width: '48%', flexGrow: 1, borderWidth: 1, borderRadius: 16, padding: 14 },
  quickIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  quickTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  groupTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  groupCard: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14 },
  faqHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  faqQ: { flex: 1, fontSize: 15, fontWeight: '600' },
  faqA: { fontSize: 14, lineHeight: 21, paddingBottom: 14 },
  contact: { marginTop: 22, borderWidth: 1, borderRadius: 16, padding: 18, alignItems: 'center', gap: 8 },
  contactTitle: { fontSize: 17, fontWeight: '700' },
  mailBtn: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12 },
  mailBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  version: { textAlign: 'center', fontSize: 12, marginTop: 18 },
});
