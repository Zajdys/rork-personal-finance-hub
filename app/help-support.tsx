import React, { useCallback, useMemo, useState } from 'react';
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
import { ScreenHeader } from '@/components/ScreenHeader';
import { ChevronDown, ChevronRight, BookOpen, Mail } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type FaqItem = { id: string; question: string; answer: string };

export default function HelpSupportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLanguageStore();
  const [openId, setOpenId] = useState<string | null>(null);

  const faqs = useMemo<FaqItem[]>(
    () => [
      { id: 'import', question: t('helpFaqImportQ'), answer: t('helpFaqImportA') },
      { id: 'banks', question: t('helpFaqBanksQ'), answer: t('helpFaqBanksA') },
      { id: 'partner', question: t('helpFaqPartnerQ'), answer: t('helpFaqPartnerA') },
      { id: 'cancel', question: t('helpFaqCancelSubQ'), answer: t('helpFaqCancelSubA') },
      { id: 'delete', question: t('helpFaqDeleteAccountQ'), answer: t('helpFaqDeleteAccountA') },
      { id: 'safety', question: t('helpFaqDataSafeQ'), answer: t('helpFaqDataSafeA') },
      { id: 'manual', question: t('helpFaqManualQ'), answer: t('helpFaqManualA') },
      { id: 'household', question: t('helpFaqHouseholdQ'), answer: t('helpFaqHouseholdA') },
    ],
    [t],
  );

  const toggle = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  const openMail = useCallback(() => {
    void Linking.openURL('mailto:info@moneybuddy.cz?subject=MoneyBuddy%20podpora');
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={t('help')} subtitle={t('helpSupportSubtitle')} variant="gradient" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('helpFaqSection')}</Text>

        {faqs.map((item) => {
          const open = openId === item.id;
          return (
            <View
              key={item.id}
              style={[styles.faqCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <TouchableOpacity
                style={styles.faqHeader}
                onPress={() => toggle(item.id)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
              >
                <Text style={[styles.faqQuestion, { color: colors.text }]}>{item.question}</Text>
                <ChevronDown
                  color={colors.textSecondary}
                  size={20}
                  style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
                />
              </TouchableOpacity>
              {open ? (
                <Text style={[styles.faqAnswer, { color: colors.textSecondary }]}>{item.answer}</Text>
              ) : null}
            </View>
          );
        })}

        <TouchableOpacity
          style={[styles.mailBtn, { backgroundColor: colors.primary }]}
          onPress={openMail}
          activeOpacity={0.9}
        >
          <Mail color="#FFFFFF" size={20} />
          <Text style={styles.mailBtnText}>{t('helpWriteUs')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.guideRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push('/user-guide')}
          activeOpacity={0.85}
        >
          <View style={[styles.guideIcon, { backgroundColor: colors.muted }]}>
            <BookOpen color={colors.primary} size={22} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.guideTitle, { color: colors.text }]}>{t('helpUserGuide')}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
              {t('helpUserGuideSubtitle')}
            </Text>
          </View>
          <ChevronRight color={colors.textSecondary} size={20} />
        </TouchableOpacity>

        <Text style={[styles.version, { color: colors.textSecondary }]}>
          {t('moneyBuddy')} · info@moneybuddy.cz
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  faqCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  faqAnswer: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
  },
  mailBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 14,
  },
  mailBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  guideRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  guideIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  version: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 13,
  },
});
