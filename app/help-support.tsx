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
        a: 'Předplatné spravuje Apple: Profil → Můj účet → Spravovat předplatné, nebo Nastavení iPhonu → tvoje jméno → Předplatná → MoneyBuddy. Zrušit ho můžeš kdykoli, Premium ti vydrží do konce zaplaceného období.',
      },
      {
        q: 'Koupil jsem Premium, ale nemám ho.',
        a: 'Profil → Můj účet → „Obnovit předchozí nákupy“. Předplatné patří k Apple ID — musíš být přihlášený stejným Apple ID, kterým jsi platil.',
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
        a: 'Na přihlašovací obrazovce klepni na „Zapomněl jsi heslo?“. Pošleme ti na e-mail kód, kterým si nastavíš nové heslo.',
      },
      {
        q: 'Jak si stáhnu svoje data?',
        a: 'Profil → Soukromí a bezpečnost → Export dat. Dostaneš soubor se všemi svými daty.',
      },
      {
        q: 'Jak smažu účet?',
        a: 'Profil → Soukromí a bezpečnost → Smazat účet. Smazání je nevratné a odstraní všechna tvoje data. Aktivní předplatné je potřeba zrušit zvlášť u Applu.',
      },
    ],
  },
];

export default function HelpSupportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const toggle = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenKey((prev) => (prev === key ? null : key));
  }, []);

  const openMail = useCallback(() => {
    void Linking.openURL('mailto:info@moneybuddy.cz?subject=MoneyBuddy%20podpora');
  }, []);

  const quick: { icon: LucideIcon; title: string; sub: string; onPress: () => void }[] = [
    {
      icon: FileUp,
      title: 'Jak stáhnout výpis',
      sub: 'Návod pro tvoji banku',
      onPress: () => router.push('/import-guide' as never),
    },
    {
      icon: Mail,
      title: 'Napiš nám',
      sub: 'info@moneybuddy.cz',
      onPress: openMail,
    },
    {
      icon: CreditCard,
      title: 'Předplatné',
      sub: 'Spravovat u Applu',
      onPress: () => void Linking.openURL('https://apps.apple.com/account/subscriptions'),
    },
    {
      icon: ShieldCheck,
      title: 'Zásady',
      sub: 'Ochrana údajů a podmínky',
      onPress: () => router.push('/privacy-policy' as never),
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Nápověda a podpora" subtitle="Rychlé odpovědi a kontakt" variant="gradient" />
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
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>Zeptej se MoneyBuddy</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 }}>
              AI průvodce poradí, kde co v appce najdeš
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

        {FAQ.map((group) => (
          <View key={group.title} style={{ marginTop: 18 }}>
            <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>{group.title.toUpperCase()}</Text>
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
          <Text style={[styles.contactTitle, { color: colors.text }]}>Nenašel jsi odpověď?</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
            Napiš nám — odpovídáme obvykle do 1–2 pracovních dnů.
          </Text>
          <TouchableOpacity
            style={[styles.mailBtn, { backgroundColor: colors.primary }]}
            onPress={openMail}
            activeOpacity={0.9}
          >
            <Mail color="#fff" size={18} />
            <Text style={styles.mailBtnText}>Napsat na info@moneybuddy.cz</Text>
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
