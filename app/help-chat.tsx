/**
 * „Zeptej se MoneyBuddy“ — AI průvodce aplikací (edge funkce help-chat).
 * Nevidí data uživatele, radí jen kde co v appce je.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Send, ChevronRight } from 'lucide-react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { BuddyAvatar } from '@/components/BuddyAvatar';
import { markHelpChatIntroSeen } from '@/components/HelpChatIntroCard';

type Msg = { role: 'user' | 'assistant'; content: string; actions?: string[] };

const ACTIONS: Record<string, { label: string; href: string | { pathname: string; params: Record<string, string> } }> = {
  prehled: { label: 'Otevřít Přehled', href: '/(tabs)' },
  plan: { label: 'Otevřít Plán', href: '/(tabs)/plan' },
  domacnost: { label: 'Otevřít Domácnost', href: '/(tabs)/household' },
  profil: { label: 'Otevřít Profil', href: '/(tabs)/profile' },
  import: { label: 'Nahrát výpis', href: '/bank-import' },
  import_navod: { label: 'Jak stáhnout výpis', href: '/import-guide' },
  pravidelne: { label: 'Pravidelné platby', href: '/personal-recurring' },
  upravit_plan: { label: 'Upravit plán', href: { pathname: '/quick-setup', params: { edit: '1' } } },
  uvery: { label: 'Závazky a úvěry', href: '/loans' },
  banky: { label: 'Bankovní účty', href: '/bank-accounts' },
  oznameni: { label: 'Oznámení', href: '/notifications-settings' },
  soukromi: { label: 'Soukromí a bezpečnost', href: '/privacy-settings' },
  sprava_dat: { label: 'Správa dat', href: '/privacy-data-management' },
  rozdel: { label: 'Rozděl útratu', href: '/split-groups' },
  usetri: { label: 'Ušetři', href: '/save' },
  investice: { label: 'Investice', href: '/investice' },
  report: { label: 'Měsíční report', href: '/monthly-report' },
  premium: { label: 'MoneyBuddy Premium', href: '/choose-subscription' },
  napoveda: { label: 'Nápověda', href: '/help-support' },
};

const SUGGESTIONS = [
  'Jak nahraju výpis z banky?',
  'Jak nastavím rozpočet?',
  'Jak pozvu partnera do domácnosti?',
  'Co všechno je v Premium?',
  'Jak zruším předplatné?',
];

/** Jednoduché vykreslení **tučně** a odstranění zbylého markdownu. */
function renderRich(text: string) {
  const clean = text.replace(/^#{1,6}\s*/gm, '').replace(/^\s*[-*]\s+/gm, '• ');
  const parts = clean.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4 ? (
      <Text key={i} style={{ fontWeight: '700' }}>{p.slice(2, -2)}</Text>
    ) : (
      p.replace(/\*\*/g, '')
    ),
  );
}

export default function HelpChatScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  useEffect(() => {
    void markHelpChatIntroSeen();
  }, []);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const send = useCallback(
    async (textRaw: string) => {
      const text = textRaw.trim();
      if (!text || sending) return;
      const next: Msg[] = [...messages, { role: 'user', content: text }];
      setMessages(next);
      setInput('');
      setSending(true);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      let reply: Msg;
      try {
        const { data, error } = await supabase.functions.invoke('help-chat', {
          body: { messages: next.map((m) => ({ role: m.role, content: m.content })) },
        });
        if (error) {
          let status: number | undefined;
          let payload: { limit?: number } | null = null;
          try {
            const ctx = (error as { context?: Response }).context;
            status = ctx?.status;
            payload = ctx ? await ctx.json() : null;
          } catch {
            /* ignore */
          }
          reply = {
            role: 'assistant',
            content:
              status === 429
                ? `Na dnešek jsi vyčerpal ${payload?.limit ?? ''} dotazů. Zkus to zítra, nebo nám napiš na info@moneybuddy.cz.`
                : 'Teď se mi nepodařilo odpovědět. Zkontroluj připojení a zkus to znovu.',
          };
        } else {
          const d = (data ?? {}) as { reply?: string; actions?: string[] };
          reply = {
            role: 'assistant',
            content: d.reply ?? 'Promiň, tohle teď nevím.',
            actions: (d.actions ?? []).filter((k) => ACTIONS[k]),
          };
        }
      } catch {
        reply = { role: 'assistant', content: 'Teď se mi nepodařilo odpovědět. Zkus to prosím znovu.' };
      }
      setMessages((m) => [...m, reply]);
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    },
    [messages, sending],
  );

  const bubbleUser = { backgroundColor: colors.primary };
  const bubbleBot = { backgroundColor: isDark ? '#1F2937' : '#F1F5F9' };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="Zeptej se MoneyBuddy" subtitle="Poradím, kde co v appce najdeš" variant="gradient" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.botRow}>
            <BuddyAvatar size={30} />
            <View style={[styles.bubble, bubbleBot, { flexShrink: 1 }]}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12, marginBottom: 4 }}>MoneyBuddy průvodce</Text>
              <Text style={[styles.text, { color: colors.text }]}>
                Ahoj! Zeptej se mě, kde co v aplikaci najdeš nebo jak něco nastavit. Do tvých financí nevidím — radím jen s appkou.
              </Text>
            </View>
          </View>

          {messages.length === 0 ? (
            <View style={{ marginTop: 10, gap: 8, marginLeft: 38 }}>
              {SUGGESTIONS.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => void send(s)}
                  style={[styles.suggestion, { borderColor: colors.border, backgroundColor: colors.card }]}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{s}</Text>
                  <ChevronRight color={colors.textSecondary} size={16} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {messages.map((m, i) => (
            <View key={i} style={{ marginTop: 10, alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: m.role === 'user' ? '85%' : '100%' }}>
              {m.role === 'user' ? (
                <View style={[styles.bubble, bubbleUser]}>
                  <Text style={[styles.text, { color: '#fff' }]}>{m.content}</Text>
                </View>
              ) : (
                <View style={[styles.botRow, { paddingRight: 24 }]}>
                  <BuddyAvatar size={30} />
                  <View style={[styles.bubble, bubbleBot, { flexShrink: 1 }]}>
                    <Text style={[styles.text, { color: colors.text }]}>{renderRich(m.content)}</Text>
                  </View>
                </View>
              )}
              {m.actions?.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginLeft: 38 }}>
                  {m.actions.map((k) => (
                    <TouchableOpacity
                      key={k}
                      onPress={() => router.push(ACTIONS[k]!.href as never)}
                      style={[styles.actionBtn, { borderColor: colors.primary }]}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{ACTIONS[k]!.label} ›</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
          ))}

          {sending ? (
            <View style={[styles.botRow, { marginTop: 10 }]}>
              <BuddyAvatar size={30} />
              <View style={[styles.bubble, bubbleBot]}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            </View>
          ) : null}
        </ScrollView>

        <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', paddingVertical: 4 }}>
          Odpovídá AI a může se splést. Nejde o finanční poradenství.
        </Text>
        <View
          style={[
            styles.inputBar,
            { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Napiš otázku…"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
            multiline
            maxLength={500}
            onSubmitEditing={() => void send(input)}
            returnKeyType="send"
            blurOnSubmit
          />
          <TouchableOpacity
            onPress={() => void send(input)}
            disabled={!input.trim() || sending}
            style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: !input.trim() || sending ? 0.4 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Odeslat"
          >
            <Send color="#fff" size={18} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
  botRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, alignSelf: 'flex-start' },
  text: { fontSize: 15, lineHeight: 21 },
  suggestion: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  actionBtn: { borderWidth: 1, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 12 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15, maxHeight: 120 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
