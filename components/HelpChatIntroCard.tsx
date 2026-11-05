/**
 * Jednorázová karta na Přehledu: upozorní na AI průvodce „Zeptej se MoneyBuddy“.
 * Zmizí po zavření křížkem nebo po prvním otevření chatu.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { X } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { safePush } from '@/lib/safe-navigate';
import { BuddyAvatar } from '@/components/BuddyAvatar';
import { useLanguageStore } from '@/store/language-store';

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
  const { tr } = useLanguageStore();
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
    <View style={[styles.wrap, style]}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          dismiss();
          safePush('/help-chat');
        }}
        style={[styles.pill, { backgroundColor: colors.card, borderColor: colors.primary + '66' }]}
        accessibilityRole="button"
        accessibilityLabel={tr('Zeptej se MoneyBuddy, průvodce aplikací', 'Ask MoneyBuddy, the app guide')}
      >
        <BuddyAvatar size={22} />
        <Text style={[styles.text, { color: colors.text }]} numberOfLines={1}>
          {tr('Nevíš si rady? Zeptej se mě', 'Not sure? Ask me')}
        </Text>
        <TouchableOpacity onPress={dismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel={tr('Zavřít', 'Close')}>
          <X color={colors.textSecondary} size={14} />
        </TouchableOpacity>
      </TouchableOpacity>
      <View style={[styles.arrow, { borderBottomColor: colors.primary + '66' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'flex-end' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
  },
  text: { fontSize: 13, fontWeight: '600' },
  arrow: {
    position: 'absolute',
    top: -6,
    right: 76,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
