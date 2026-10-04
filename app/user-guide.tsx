import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { StackHeaderBackButton } from '@/components/BackButton';
import {
  Rocket,
  FileSpreadsheet,
  PlusCircle,
  Tags,
  Home,
  UsersRound,
  PiggyBank,
  BarChart3,
  TrendingUp,
  Repeat,
  Shield,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';

type GuideSection = {
  title: string;
  icon: LucideIcon;
  lines: string[];
};

function GuideSectionCard({
  section,
  colors,
  styles,
}: {
  section: GuideSection;
  colors: ReturnType<typeof useTheme>['colors'];
  styles: ReturnType<typeof createStyles>;
}) {
  const Icon = section.icon;
  return (
    <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.sectionHeader}>
        <View style={[styles.iconWrap, { backgroundColor: colors.muted }]}>
          <Icon color={colors.primary} size={22} />
        </View>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
      </View>
      {section.lines.map((line, index) => (
        <Text
          key={`${section.title}-${index}`}
          style={[styles.sectionLine, { color: colors.textSecondary }, index > 0 && styles.sectionLineSpaced]}
        >
          {line}
        </Text>
      ))}
    </View>
  );
}

export default function UserGuideScreen() {
  const { colors } = useTheme();
  const { t } = useLanguageStore();
  const styles = useMemo(() => createStyles(), []);

  const guideSections = useMemo<GuideSection[]>(
    () => [
      {
        title: t('guideGettingStarted'),
        icon: Rocket,
        lines: [t('guideGettingStarted1'), t('guideGettingStarted2')],
      },
      {
        title: t('guideBankImport'),
        icon: FileSpreadsheet,
        lines: [
          t('guideBankImport1'),
          t('guideBankImport2'),
          t('guideBankImport3'),
          t('guideBankImport4'),
          t('guideBankImport5'),
        ],
      },
      {
        title: t('guideManualTx'),
        icon: PlusCircle,
        lines: [t('guideManualTx1'), t('guideManualTx2'), t('guideManualTx3')],
      },
      {
        title: t('guideCategories'),
        icon: Tags,
        lines: [t('guideCategories1'), t('guideCategories2'), t('guideCategories3')],
      },
      {
        title: t('guideHousehold'),
        icon: Home,
        lines: [t('guideHousehold1'), t('guideHousehold2'), t('guideHousehold3')],
      },
      {
        title: t('guideSplit'),
        icon: UsersRound,
        lines: [
          t('guideSplit1'),
          t('guideSplit2'),
          t('guideSplit3'),
          t('guideSplit4'),
          t('guideSplit5'),
          t('guideSplit6'),
          t('guideSplit7'),
        ],
      },
      {
        title: t('guideSave'),
        icon: PiggyBank,
        lines: [t('guideSave1')],
      },
      {
        title: t('guideReports'),
        icon: BarChart3,
        lines: [t('guideReports1'), t('guideReports2'), t('guideReports3'), t('guideReports4')],
      },
      {
        title: t('guideInvestments'),
        icon: TrendingUp,
        lines: [t('guideInvestments1'), t('guideInvestments2'), t('guideInvestments3')],
      },
      {
        title: t('guideSubscriptions'),
        icon: Repeat,
        lines: [t('guideSubscriptions1'), t('guideSubscriptions2')],
      },
      {
        title: t('guideSecurity'),
        icon: Shield,
        lines: [t('guideSecurity1'), t('guideSecurity2'), t('guideSecurity3')],
      },
    ],
    [t],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: t('helpUserGuide'),
          headerStyle: { backgroundColor: colors.gradientStart },
          headerTintColor: colors.onPrimary,
          headerLeft: ({ tintColor }) => (
            <StackHeaderBackButton tintColor={tintColor ?? colors.onPrimary} />
          ),
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />

      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={[styles.headerTitle, { color: colors.onPrimary }]}>{t('helpUserGuide')}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.onPrimary }]}>{t('guideIntroSubtitle')}</Text>
        </LinearGradient>

        <View style={styles.content}>
          {guideSections.map((section) => (
            <GuideSectionCard key={section.title} section={section} colors={colors} styles={styles} />
          ))}
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
    scrollContent: {
      paddingBottom: 32,
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
      gap: 16,
    },
    sectionCard: {
      borderRadius: 16,
      padding: 18,
      borderWidth: StyleSheet.hairlineWidth,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    sectionTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
    },
    sectionLine: {
      fontSize: 15,
      lineHeight: 22,
    },
    sectionLineSpaced: {
      marginTop: 8,
    },
  });
}
