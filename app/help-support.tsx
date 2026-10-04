import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Clipboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { StackHeaderBackButton } from '@/components/BackButton';
import {
  HelpCircle,
  MessageCircle,
  Mail,
  BookOpen,
  ChevronRight,
} from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import type { ThemeColors } from '@/constants/theme-colors';
import { useLanguageStore } from '@/store/language-store';

type HelpItemProps = {
  icon: React.ComponentType<{ color: string; size: number }>;
  title: string;
  subtitle: string;
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
};

function HelpItem({ icon: Icon, title, subtitle, onPress, colors, styles }: HelpItemProps) {
  return (
    <TouchableOpacity
      style={[styles.helpItem, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.helpContent}>
        <View style={[styles.iconContainer, { backgroundColor: colors.muted }]}>
          <Icon color={colors.primary} size={24} />
        </View>
        <View style={styles.helpText}>
          <Text style={[styles.helpTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.helpSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        </View>
      </View>
      <ChevronRight color={colors.textSecondary} size={20} />
    </TouchableOpacity>
  );
}

export default function HelpSupportScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useLanguageStore();
  const styles = useMemo(() => createStyles(), []);

  const faqItems = useMemo(
    () => [
      {
        question: t('faqImportQuestion'),
        answer: t('faqImportAnswer'),
      },
      {
        question: t('faqManualQuestion'),
        answer: t('faqManualAnswer'),
      },
      {
        question: t('faqHouseholdQuestion'),
        answer: t('faqHouseholdAnswer'),
      },
      {
        question: t('faqDeleteImportQuestion'),
        answer: t('faqDeleteImportAnswer'),
      },
    ],
    [t],
  );

  const openFaq = useCallback(() => {
    Alert.alert(
      t('helpFaqSection'),
      t('helpFaqSelect'),
      [
        ...faqItems.map((item) => ({
          text: item.question,
          onPress: () => Alert.alert(item.question, item.answer),
        })),
        { text: t('close'), style: 'cancel' as const },
      ],
    );
  }, [faqItems, t]);

  return (
    <>
      <Stack.Screen
        options={{
          title: t('help'),
          headerStyle: { backgroundColor: colors.gradientStart },
          headerTintColor: colors.onPrimary,
          headerLeft: ({ tintColor }) => (
            <StackHeaderBackButton tintColor={tintColor ?? colors.onPrimary} />
          ),
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />

      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={[styles.headerTitle, { color: colors.onPrimary }]}>{t('help')}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.onPrimary }]}>{t('helpSupportSubtitle')}</Text>
        </LinearGradient>

        <View style={styles.content}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('helpFaqSection')}</Text>

          <HelpItem
            icon={HelpCircle}
            title={t('faqContact')}
            subtitle={t('helpFaqAnswers')}
            onPress={openFaq}
            colors={colors}
            styles={styles}
          />

          <HelpItem
            icon={BookOpen}
            title={t('helpUserGuide')}
            subtitle={t('helpUserGuideSubtitle')}
            onPress={() => router.push('/user-guide')}
            colors={colors}
            styles={styles}
          />

          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('helpContactUs')}</Text>

          <HelpItem
            icon={MessageCircle}
            title={t('screenSupport')}
            subtitle={t('helpLiveChat')}
            onPress={() => router.push('/support-chat')}
            colors={colors}
            styles={styles}
          />

          <HelpItem
            icon={Mail}
            title={t('helpEmailSupport')}
            subtitle="support@moneybuddy.cz"
            onPress={() => {
              Clipboard.setString('support@moneybuddy.cz');
              Alert.alert(t('helpEmailCopied'), t('helpEmailCopiedMessage'));
            }}
            colors={colors}
            styles={styles}
          />

          <View style={[styles.versionInfo, { borderTopColor: colors.border }]}>
            <Text style={[styles.versionText, { color: colors.text }]}>
              {t('moneyBuddy')} verze 1.0.0
            </Text>
            <Text style={[styles.buildText, { color: colors.textSecondary }]}>Build 2024.1.1</Text>
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function createStyles() {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      paddingTop: 20,
      paddingBottom: 24,
      paddingHorizontal: 20,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      marginBottom: 4,
    },
    headerSubtitle: {
      fontSize: 16,
      opacity: 0.9,
    },
    content: {
      padding: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 16,
      marginTop: 16,
    },
    helpItem: {
      borderRadius: 16,
      padding: 20,
      marginBottom: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    helpContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    helpText: {
      flex: 1,
    },
    helpTitle: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 2,
    },
    helpSubtitle: {
      fontSize: 14,
    },
    versionInfo: {
      alignItems: 'center',
      marginTop: 32,
      paddingTop: 24,
      borderTopWidth: 1,
    },
    versionText: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 4,
    },
    buildText: {
      fontSize: 14,
    },
  });
}
