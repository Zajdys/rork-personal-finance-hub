import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  RefreshControl,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import {
  Bell,
  HelpCircle,
  Palette,
  ChevronRight,
  Sparkles,
  CreditCard,
  Users,
  UsersRound,
  PiggyBank,
  Building2,
  Lock,
  FileText,
  Target,
  Landmark,
  LogOut,
  Crown,
  Pencil,
  Camera,
} from 'lucide-react-native';

import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useAuth } from '@/store/auth-store';
import { usePremium } from '@/hooks/usePremium';
import { useFinanceStore } from '@/store/finance-store';
import { useSavePendingStore } from '@/store/save-pending-store';
import { fetchUserProfileFromSupabase, updateUserProfileFields } from '@/lib/user-profile-supabase';
import { fetchSavedTotalFromDb } from '@/lib/save-decisions';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';
import { TERMS_OF_USE_URL } from '@/constants/legal-urls';

function profileInitials(firstName: string, lastName: string, fallbackName: string, email: string): string {
  const f = firstName.trim();
  const l = lastName.trim();
  if (f && l) return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  const fb = fallbackName.trim();
  if (fb.length >= 2) return fb.slice(0, 2).toUpperCase();
  if (fb.length === 1) return fb.toUpperCase();
  const local = email.split('@')[0] ?? '';
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  return local.charAt(0).toUpperCase() || '?';
}

function formatCzkWhole(amount: number): string {
  const n = Math.round(amount);
  try {
    return `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(n)} Kč`;
  } catch {
    return `${n} Kč`;
  }
}

function formatMemberSince(iso: string | undefined, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${mm}/${d.getFullYear()}`;
}

async function resizeAvatarUri(uri: string, width?: number, height?: number): Promise<string> {
  const w = width ?? 1024;
  const h = height ?? 1024;
  const actions: ImageManipulator.Action[] = [];
  if (w > 500 || h > 500) {
    if (w >= h) actions.push({ resize: { width: 500 } });
    else actions.push({ resize: { height: 500 } });
  }
  const out = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return out.uri;
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { userProfile, setUserProfile } = useSettingsStore();
  const { isPremium, isHouseholdPremium } = usePremium();
  const transactions = useFinanceStore((s) => s.transactions);
  const savedTotalLocal = useSavePendingStore((s) => s.savedTotal);
  const loadSaveStore = useSavePendingStore((s) => s.loadFromStorage);
  const { colors } = useTheme();
  const { t } = useLanguageStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [savedTotalDb, setSavedTotalDb] = useState<number | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      const row = await fetchUserProfileFromSupabase(user.id);
      if (row) {
        setUserProfile({
          firstName: row.first_name ?? '',
          lastName: row.last_name ?? '',
          avatarUrl: row.avatar_url ?? null,
        });
      }
    } catch (e) {
      console.warn('[profile] load', e);
    }
  }, [user?.id, setUserProfile]);

  const loadSaved = useCallback(async () => {
    if (!user?.id || !isHouseholdPremium) {
      setSavedTotalDb(null);
      return;
    }
    try {
      await loadSaveStore();
      const total = await fetchSavedTotalFromDb(user.id, null);
      setSavedTotalDb(total);
    } catch (e) {
      console.warn('[profile] saved total', e);
    }
  }, [user?.id, isHouseholdPremium, loadSaveStore]);

  useFocusRefresh(
    useCallback(async () => {
      await Promise.all([loadProfile(), loadSaved()]);
    }, [loadProfile, loadSaved]),
  );

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadProfile(), loadSaved()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadProfile, loadSaved]);

  const uploadAvatarFromUri = useCallback(
    async (uri: string) => {
      if (!user?.id) return;
      setAvatarUploading(true);
      try {
        const path = `${user.id}/avatar.jpg`;
        let uploadBody: Blob | ArrayBuffer;
        if (Platform.OS === 'web') {
          const response = await fetch(uri);
          uploadBody = await response.blob();
        } else {
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          uploadBody = decode(base64);
        }
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, uploadBody, {
          contentType: 'image/jpeg',
          upsert: true,
        });
        if (upErr) throw new Error(upErr.message);
        const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
        const nextAvatarUrl = `${pub.publicUrl}?t=${Date.now()}`;
        const { error } = await updateUserProfileFields(user.id, { avatar_url: nextAvatarUrl });
        if (error) throw error;
        setUserProfile({ avatarUrl: nextAvatarUrl });
      } catch (e) {
        console.error(e);
        Alert.alert(t('error'), e instanceof Error ? e.message : t('editProfile.photoEditFailed'));
      } finally {
        setAvatarUploading(false);
      }
    },
    [user?.id, setUserProfile, t],
  );

  const pickAvatar = useCallback(
    async (source: 'library' | 'camera') => {
      try {
        if (source === 'library') {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert(t('editProfile.accessDenied'), t('editProfile.photosPermission'));
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: Platform.OS !== 'web',
            aspect: [1, 1],
            quality: 1,
          });
          if (result.canceled || !result.assets[0]) return;
          const asset = result.assets[0];
          const uri = await resizeAvatarUri(asset.uri, asset.width, asset.height);
          await uploadAvatarFromUri(uri);
        } else {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert(t('editProfile.accessDenied'), t('editProfile.cameraPermission'));
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: Platform.OS !== 'web',
            aspect: [1, 1],
            quality: 1,
          });
          if (result.canceled || !result.assets[0]) return;
          const asset = result.assets[0];
          const uri = await resizeAvatarUri(asset.uri, asset.width, asset.height);
          await uploadAvatarFromUri(uri);
        }
      } catch (e) {
        console.error(e);
        Alert.alert(t('error'), t('editProfile.photoEditFailed'));
      }
    },
    [t, uploadAvatarFromUri],
  );

  const onCameraPress = useCallback(() => {
    if (Platform.OS === 'web') {
      void pickAvatar('library');
      return;
    }
    Alert.alert(t('editProfile.profilePhoto'), t('editProfile.chooseSource'), [
      { text: t('editProfile.gallery'), onPress: () => void pickAvatar('library') },
      { text: t('editProfile.camera'), onPress: () => void pickAvatar('camera') },
      { text: t('cancel'), style: 'cancel' },
    ]);
  }, [pickAvatar, t]);

  const MenuButton = ({ icon: Icon, title, subtitle, onPress }: any) => (
    <TouchableOpacity style={[styles.menuButton, { backgroundColor: colors.card }]} onPress={onPress}>
      <View style={styles.menuButtonContent}>
        <View style={[styles.menuButtonIcon, { backgroundColor: colors.muted }]}>
          <Icon color={colors.primary} size={24} />
        </View>
        <View style={styles.menuButtonText}>
          <Text style={[styles.menuButtonTitle, { color: colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.menuButtonSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
          ) : null}
        </View>
        <ChevronRight color={colors.textSecondary} size={20} />
      </View>
    </TouchableOpacity>
  );

  const displayName =
    [userProfile.firstName, userProfile.lastName].filter(Boolean).join(' ').trim() ||
    user?.name ||
    `MoneyBuddy ${t('user')}`;
  const initials = profileInitials(
    userProfile.firstName,
    userProfile.lastName,
    user?.name ?? '',
    user?.email ?? '',
  );

  const txCount = transactions.length;
  const savedDisplay = useMemo(() => {
    if (!isHouseholdPremium) return formatCzkWhole(0);
    const amount = savedTotalDb != null ? savedTotalDb : savedTotalLocal;
    return formatCzkWhole(amount || 0);
  }, [isHouseholdPremium, savedTotalDb, savedTotalLocal]);

  const memberSince = formatMemberSince(user?.registrationDate, '—');

  const appVersion =
    Constants.expoConfig?.version ??
    (Constants as { nativeAppVersion?: string }).nativeAppVersion ??
    '—';

  const openLegalPicker = () => {
    Alert.alert(t('profileLegalTitle'), t('profileLegalSubtitle'), [
      {
        text: t('privacyPolicyGdpr'),
        onPress: () => router.push('/privacy-policy'),
      },
      {
        text: t('termsOfUse'),
        onPress: () => void Linking.openURL(TERMS_OF_USE_URL),
      },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const handleLogout = () => {
    Alert.alert(t('account.logoutTitle'), t('account.logoutConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('account.logoutTitle'),
        style: 'destructive',
        onPress: () => void logout(),
      },
    ]);
  };

  return (
    <View style={[styles.rootFill, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor="#FFFFFF"
            colors={['#FFFFFF', colors.primary]}
            progressBackgroundColor={colors.primary}
          />
        }
      >
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          style={[styles.hero, { paddingTop: Math.max(insets.top, 12) + 12 }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.avatarWrap}>
            {userProfile.avatarUrl ? (
              <Image source={{ uri: userProfile.avatarUrl }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.cameraBadge}
              onPress={onCameraPress}
              disabled={avatarUploading}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('editProfile.profilePhoto')}
            >
              {avatarUploading ? (
                <ActivityIndicator color="#667eea" size="small" />
              ) : (
                <Camera color="#667eea" size={16} />
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.heroName} numberOfLines={1}>
            {displayName}
          </Text>
          {user?.email ? (
            <Text style={styles.heroEmail} numberOfLines={1}>
              {user.email}
            </Text>
          ) : null}

          <View style={styles.heroActions}>
            {isPremium ? (
              <TouchableOpacity
                style={styles.premiumBtn}
                onPress={() => router.push('/account')}
                activeOpacity={0.88}
              >
                <Crown color="#92400E" size={16} />
                <Text style={styles.premiumBtnText}>{t('premium.tabBadge')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.editProfileBtn}
              onPress={() => router.push('/edit-profile')}
              activeOpacity={0.88}
            >
              <Pencil color="#FFFFFF" size={16} />
              <Text style={styles.editProfileBtnText}>{t('profileEditProfileShort')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{txCount}</Text>
              <Text style={styles.statLabel}>{t('profileStatTransactions')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{savedDisplay}</Text>
              <Text style={styles.statLabel}>{t('profileStatSaved')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{memberSince}</Text>
              <Text style={styles.statLabel}>{t('profileStatMemberSince')}</Text>
            </View>
          </View>
        </LinearGradient>

        {!isPremium ? (
          <TouchableOpacity
            style={styles.tryPremiumCard}
            onPress={() => router.push('/choose-subscription')}
            activeOpacity={0.9}
          >
            <View style={[styles.menuButtonIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Sparkles color="#FFFFFF" size={22} />
            </View>
            <View style={styles.menuButtonText}>
              <Text style={styles.tryPremiumTitle}>{t('profileTryPremiumTitle')}</Text>
              <Text style={styles.tryPremiumSub}>{t('profileTryPremiumSubtitle')}</Text>
            </View>
            <ChevronRight color="rgba(255,255,255,0.85)" size={20} />
          </TouchableOpacity>
        ) : null}

        <View style={styles.menuContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profileSectionMyMoney')}</Text>
          <MenuButton
            icon={Target}
            title={t('financialGoals')}
            subtitle={t('profileGoalsReserveSubtitle')}
            onPress={() => router.push('/financial-goals')}
          />
          <MenuButton
            icon={Landmark}
            title={t('profileReserveTitle')}
            subtitle={t('profileReserveSubtitle')}
            onPress={() => router.push('/reserve-detail')}
          />
          <MenuButton
            icon={PiggyBank}
            title={t('piggyBankFeature')}
            subtitle={t('profileSaveSubtitle')}
            onPress={() => router.push('/save')}
          />
          <MenuButton
            icon={CreditCard}
            title={t('profileMyLiabilities')}
            subtitle={t('profileLoansSubtitle')}
            onPress={() => router.push('/loans')}
          />
          <MenuButton
            icon={Building2}
            title={t('bankAccountsTitle')}
            subtitle={t('bankAccountsSubtitle')}
            onPress={() => router.push('/bank-accounts')}
          />
        </View>

        <View style={styles.menuContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profileSectionSharing')}</Text>
          <MenuButton
            icon={Users}
            title={t('profileHouseholdSettings')}
            subtitle={t('profileHouseholdSubtitle')}
            onPress={() => router.push('/(tabs)/household')}
          />
          <MenuButton
            icon={UsersRound}
            title={t('splitGroups')}
            subtitle={t('profileSplitGroupsSubtitle')}
            onPress={() => router.push('/split-groups')}
          />
        </View>

        <View style={styles.menuContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('settings')}</Text>
          <MenuButton
            icon={Palette}
            title={t('profileAppearanceTitle')}
            subtitle={t('profileAppearanceMenuSubtitle')}
            onPress={() => router.push('/appearance-settings')}
          />
          <MenuButton
            icon={Bell}
            title={t('notifications')}
            subtitle={t('profileNotificationsSubtitle')}
            onPress={() => router.push('/notifications-settings')}
          />
          <MenuButton
            icon={Lock}
            title={t('privacySecurity')}
            subtitle={t('profilePrivacySubtitle')}
            onPress={() => router.push('/privacy-settings')}
          />
        </View>

        <View style={styles.menuContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('profileSectionInfo')}</Text>
          <MenuButton
            icon={HelpCircle}
            title={t('helpSupport')}
            subtitle={t('profileHelpSubtitle')}
            onPress={() => router.push('/help-support')}
          />
          <MenuButton
            icon={FileText}
            title={t('profileLegalTitle')}
            subtitle={t('profileLegalMenuSubtitle')}
            onPress={openLegalPicker}
          />
          <Text style={[styles.versionText, { color: colors.textSecondary }]}>
            {t('profileAppVersion', { version: appVersion })}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={handleLogout}
          activeOpacity={0.88}
        >
          <View style={[styles.menuButtonIcon, { backgroundColor: '#FEE2E2' }]}>
            <LogOut color="#EF4444" size={22} />
          </View>
          <Text style={styles.logoutText}>{t('account.logoutTitle')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootFill: { flex: 1 },
  container: { flex: 1 },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 22,
    alignItems: 'center',
  },
  avatarWrap: {
    marginBottom: 14,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(102,126,234,0.25)',
  },
  heroName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  heroEmail: {
    marginTop: 4,
    fontSize: 14,
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
  },
  heroActions: {
    width: '100%',
    alignItems: 'stretch',
    gap: 10,
    marginTop: 16,
  },
  editProfileBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
  },
  editProfileBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  premiumBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#FBBF24',
  },
  premiumBtnText: {
    color: '#92400E',
    fontSize: 14,
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    width: '100%',
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.25)',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  statLabel: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    textAlign: 'center',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  tryPremiumCard: {
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 4,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#667eea',
  },
  tryPremiumTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  tryPremiumSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginTop: 2,
  },
  menuContainer: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  menuButton: {
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  menuButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  menuButtonIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuButtonText: {
    flex: 1,
  },
  menuButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  menuButtonSubtitle: {
    fontSize: 14,
  },
  versionText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  logoutButton: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EF4444',
  },
});
