import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { StackHeaderBackButton } from '@/components/BackButton';
import { Download, Trash2, ChevronRight, Landmark } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { useAuth } from '@/store/auth-store';
import { shareUserDataExport } from '@/lib/user-data-export';
import { clearAppDataCacheAndRefetch } from '@/lib/clear-app-data-cache';

export default function GeneralSettingsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t } = useLanguageStore();
  const { user } = useAuth();
  const shadowSoft = isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.08)';

  const [busy, setBusy] = useState<'export' | 'cache' | null>(null);

  const onExport = async () => {
    if (!user?.id) {
      Alert.alert(t('error'), t('privacyNotSignedIn'));
      return;
    }
    setBusy('export');
    try {
      const result = await shareUserDataExport(user.id, {
        webHint: t('privacyExportWebHint'),
        cacheUnavailable: t('privacyCacheUnavailable'),
        sharingUnavailable: t('privacySharingUnavailable'),
        dialogTitle: t('privacyExportDialogTitle'),
      });
      if (!result.ok) {
        if (result.webOnly) {
          Alert.alert(t('importLabel'), result.error);
        } else {
          Alert.alert(t('privacyExportFailed'), result.error);
        }
        return;
      }
      if (result.warnings.length) {
        Alert.alert(t('privacyExportPartial'), result.warnings.join('\n'));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('privacyExportFailed'), msg);
    } finally {
      setBusy(null);
    }
  };

  const onClearCache = () => {
    Alert.alert(t('generalSettingsClearCache'), t('generalSettingsClearCacheConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('generalSettingsClearCache'),
        style: 'destructive',
        onPress: () => void runClearCache(),
      },
    ]);
  };

  const runClearCache = async () => {
    setBusy('cache');
    try {
      await clearAppDataCacheAndRefetch(user?.id);
      Alert.alert(t('done'), t('generalSettingsClearCacheDone'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('error'), msg);
    } finally {
      setBusy(null);
    }
  };

  const SettingItem = ({
    icon: Icon,
    title,
    subtitle,
    onPress,
    rightElement,
    disabled,
  }: {
    icon: typeof Download;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
    disabled?: boolean;
  }) => (
    <TouchableOpacity
      style={[
        styles.settingItem,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          shadowColor: shadowSoft,
          opacity: disabled ? 0.6 : 1,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={disabled}
    >
      <View style={styles.settingContent}>
        <View style={[styles.iconContainer, { backgroundColor: colors.muted }]}>
          <Icon color={colors.primary} size={24} />
        </View>
        <View style={styles.settingText}>
          <Text style={[styles.settingTitle, { color: colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.settingSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {rightElement || <ChevronRight color={colors.textSecondary} size={20} />}
    </TouchableOpacity>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: t('generalSettings'),
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.primary,
          headerLeft: ({ tintColor }) => (
            <StackHeaderBackButton tintColor={tintColor ?? colors.primary} />
          ),
          headerTitleStyle: { fontWeight: '700', color: colors.text },
        }}
      />

      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          style={[styles.header, { shadowColor: shadowSoft }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('generalSettings')}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.text, opacity: 0.92 }]}>
            {t('generalSettingsSubtitle')}
          </Text>
        </LinearGradient>

        <View style={[styles.content, { backgroundColor: colors.background }]}>
          <SettingItem
                icon={Landmark}
                title={t('bankAccountsTitle')}
                subtitle={t('bankAccountsSubtitle')}
                onPress={() => router.push('/bank-accounts')}
              />

          <SettingItem
                icon={Download}
                title={t('generalSettingsExportData')}
                subtitle={t('generalSettingsExportDataSubtitle')}
                onPress={() => void onExport()}
                disabled={busy !== null}
                rightElement={
                  busy === 'export' ? <ActivityIndicator color={colors.primary} /> : undefined
                }
              />

              <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('generalSettingsMaintenance')}</Text>

              <SettingItem
                icon={Trash2}
                title={t('generalSettingsClearCache')}
                subtitle={t('generalSettingsClearCacheSubtitle')}
                onPress={onClearCache}
                disabled={busy !== null}
                rightElement={
                  busy === 'cache' ? <ActivityIndicator color={colors.primary} /> : undefined
                }
              />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
  },
  content: {
    padding: 20,
    flexGrow: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 8,
    marginBottom: 10,
    marginLeft: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 2,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
});
