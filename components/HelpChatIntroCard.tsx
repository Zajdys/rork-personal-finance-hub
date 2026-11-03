/**
 * Jednorázová karta na Přehledu: upozorní na AI průvodce „Zeptej se MoneyBuddy“.
 * Zmizí po zavření křížkem nebo po prvním otevření chatu.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { X, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { safePush } from '@/lib/safe-navigate';
import { BuddyAvatar } from '@/components/BuddyAvatar';

export const HELP_CHAT_INTRO_KEY = 'mb_help_chat_intro_seen_v2';

export async function markHelpChatIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(HELP_CHAT_INTRO_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function HelpChatIntroCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(HELP_CHAT_INTRO_KEY)
      .then((v) => {
        if (alive && !v) setVisible(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    void markHelpChatIntroSeen();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => {
        dismiss();
        safePush('/help-chat');
      }}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }, style]}
      accessibilityRole="button"
      accessibilityLabel="Zeptej se MoneyBuddy, průvodce aplikací"
    >
      <BuddyAvatar size={40} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: colors.text }]}>Nevíš si s něčím rady?</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          Zeptej se mě — poradím, kde co v appce najdeš. Najdeš mě vždy pod ✨ vpravo nahoře.
        </Text>
        <View style={styles.ctaRow}>
          <Text style={[styles.cta, { color: colors.primary }]}>Zeptat se</Text>
          <ChevronRight color={colors.primary} size={16} />
        </View>
      </View>
      <TouchableOpacity onPress={dismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Zavřít">
        <X color={colors.textSecondary} size={18} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
  },
  title: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  cta: { fontSize: 14, fontWeight: '700' },
});
