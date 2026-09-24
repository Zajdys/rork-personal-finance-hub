import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
  Pressable,
  Share,
  Platform,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserPlus, Shield, LogOut, UserMinus, Crown } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { useAuth } from '@/store/auth-store';
import { useHouseholdActiveStore, type UserHousehold } from '@/store/household-active-store';
import { BackButton } from '@/components/BackButton';
import { EmptyState } from '@/components/EmptyState';
import {
  fetchHouseholdMembersWithProfiles,
  householdMemberRpcErrorKey,
  rpcLeaveHousehold,
  rpcRemoveHouseholdMember,
  rpcTransferHouseholdAdmin,
  type HouseholdMemberProfile,
} from '@/lib/household-members';
import { hasSupabaseSession } from '@/lib/supabase-session';
import { formatHouseholdMemberCountLabel } from '@/lib/plural-cs';

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

export default function HouseholdMembersScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguageStore();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ householdId?: string }>();
  const households = useHouseholdActiveStore((s) => s.households);
  const activeHouseholdId = useHouseholdActiveStore((s) => s.activeHouseholdId);
  const fetchHouseholds = useHouseholdActiveStore((s) => s.fetchHouseholds);
  const setActiveHouseholdId = useHouseholdActiveStore((s) => s.setActiveHouseholdId);
  const fetchInviteCode = useHouseholdActiveStore((s) => s.fetchInviteCode);
  const patchHousehold = useHouseholdActiveStore((s) => s.patchHousehold);

  const householdId = String(params.householdId ?? activeHouseholdId ?? '');
  const household = useMemo(
    () => households.find((h) => h.id === householdId) ?? null,
    [households, householdId],
  );

  const [members, setMembers] = useState<HouseholdMemberProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [inviteSheet, setInviteSheet] = useState<UserHousehold | null>(null);

  const isAdmin = Boolean(user?.id && household?.createdBy === user.id);
  const lang = language === 'en' ? 'en' : 'cs';

  const loadMembers = useCallback(async () => {
    if (!householdId || !(await hasSupabaseSession())) {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { members: list, error } = await fetchHouseholdMembersWithProfiles(
        householdId,
        t('hhMemberFallback'),
      );
      if (error) {
        Alert.alert(t('error'), error.message);
        setMembers([]);
        return;
      }
      setMembers(list);
    } finally {
      setLoading(false);
    }
  }, [householdId, t]);

  const { refresh: refreshMembers } = useFocusRefresh(
    useCallback(async () => {
      await loadMembers();
    }, [loadMembers]),
    { focusKey: householdId ?? '' },
  );

  const showRpcError = useCallback(
    (error: { code: string; message: string }) => {
      Alert.alert(t('error'), t(householdMemberRpcErrorKey(error)));
    },
    [t],
  );

  const afterLeave = useCallback(async () => {
    if (!user?.id) {
      router.replace('/(tabs)');
      return;
    }
    const list = await fetchHouseholds(user.id);
    if (list.length === 0) {
      await setActiveHouseholdId(user.id, null);
      router.replace('/(tabs)/household');
      return;
    }
    const next = list.find((h) => h.id !== householdId) ?? list[0]!;
    await setActiveHouseholdId(user.id, next.id);
    router.replace('/(tabs)/household');
  }, [fetchHouseholds, householdId, router, setActiveHouseholdId, user?.id]);

  const openInvite = useCallback(async () => {
    if (!household) return;
    let code = household.inviteCode;
    if (!code) {
      const fetched = await fetchInviteCode(household.id);
      code = fetched;
      if (fetched) patchHousehold(household.id, { inviteCode: fetched });
    }
    if (!code) {
      Alert.alert(t('error'), t('hhInviteCodeMissing'));
      return;
    }
    setInviteSheet({ ...household, inviteCode: code });
  }, [fetchInviteCode, household, patchHousehold, t]);

  const shareInvite = useCallback(async () => {
    if (!inviteSheet?.inviteCode) return;
    const message = t('hhShareInviteMessage', {
      name: inviteSheet.name,
      code: inviteSheet.inviteCode,
    });
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(message);
        Alert.alert(t('monthlyReportCopied'), t('monthlyReportCopiedMessage'));
        return;
      }
      await Share.share({ message, title: t('hhInvitePartnerTitle') });
    } catch (e) {
      console.warn('[household-members] share invite', e);
    }
  }, [inviteSheet, t]);

  const confirmRemove = useCallback(
    (member: HouseholdMemberProfile) => {
      if (!householdId || busy) return;
      Alert.alert(
        t('hhMembersRemoveTitle'),
        t('hhMembersRemoveConfirm', { name: member.displayName }),
        [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t('hhMembersRemove'),
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setBusy(true);
                try {
                  const res = await rpcRemoveHouseholdMember(householdId, member.userId);
                  if (!res.ok) {
                    showRpcError(res.error);
                    return;
                  }
                  await refreshMembers({ force: true });
                } finally {
                  setBusy(false);
                }
              })();
            },
          },
        ],
      );
    },
    [busy, householdId, refreshMembers, showRpcError, t],
  );

  const confirmTransfer = useCallback(
    (member: HouseholdMemberProfile) => {
      if (!householdId || busy) return;
      Alert.alert(
        t('hhMembersTransferTitle'),
        t('hhMembersTransferConfirm', { name: member.displayName }),
        [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t('hhMembersTransfer'),
            onPress: () => {
              void (async () => {
                setBusy(true);
                try {
                  const res = await rpcTransferHouseholdAdmin(householdId, member.userId);
                  if (!res.ok) {
                    showRpcError(res.error);
                    return;
                  }
                  if (user?.id) await fetchHouseholds(user.id);
                  await refreshMembers({ force: true });
                } finally {
                  setBusy(false);
                }
              })();
            },
          },
        ],
      );
    },
    [busy, fetchHouseholds, householdId, refreshMembers, showRpcError, t, user?.id],
  );

  const confirmLeave = useCallback(() => {
    if (!householdId || busy) return;
    Alert.alert(t('hhLeaveHousehold'), t('hhLeaveHouseholdConfirm', { name: household?.name ?? '' }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('hhLeaveHousehold'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              const res = await rpcLeaveHousehold(householdId);
              if (!res.ok) {
                showRpcError(res.error);
                return;
              }
              await afterLeave();
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }, [afterLeave, busy, household?.name, householdId, showRpcError, t]);

  const confirmTransferAndLeave = useCallback(() => {
    if (!householdId || busy || !user?.id) return;
    const candidates = members.filter((m) => m.userId !== user.id);
    if (candidates.length === 0) {
      Alert.alert(t('error'), t('hhMembersErrInvalid'));
      return;
    }

    const pickAndRun = (member: HouseholdMemberProfile) => {
      Alert.alert(
        t('hhMembersTransferLeaveTitle'),
        t('hhMembersTransferLeaveConfirm', { name: member.displayName }),
        [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t('hhMembersTransferLeave'),
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setBusy(true);
                try {
                  const transfer = await rpcTransferHouseholdAdmin(householdId, member.userId);
                  if (!transfer.ok) {
                    showRpcError(transfer.error);
                    return;
                  }
                  const leave = await rpcLeaveHousehold(householdId);
                  if (!leave.ok) {
                    showRpcError(leave.error);
                    await fetchHouseholds(user.id);
                    await refreshMembers({ force: true });
                    return;
                  }
                  await afterLeave();
                } finally {
                  setBusy(false);
                }
              })();
            },
          },
        ],
      );
    };

    if (candidates.length === 1) {
      pickAndRun(candidates[0]!);
      return;
    }

    Alert.alert(
      t('hhMembersTransferLeaveTitle'),
      t('hhMembersPickNewAdmin'),
      [
        { text: t('cancel'), style: 'cancel' },
        ...candidates.slice(0, 5).map((m) => ({
          text: m.displayName,
          onPress: () => pickAndRun(m),
        })),
      ],
    );
  }, [
    afterLeave,
    busy,
    fetchHouseholds,
    householdId,
    refreshMembers,
    members,
    showRpcError,
    t,
    user?.id,
  ]);

  const titleName = (household?.name || '').trim() || t('household');
  const subtitle = formatHouseholdMemberCountLabel(titleName, members.length, lang);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: t('hhMembersTitle'),
          headerShown: true,
          headerLeft: () => <BackButton color={colors.text} fallback="/(tabs)/household" />,
        }}
      />

      <View style={styles.topBar}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.inviteBtn, { backgroundColor: colors.primary }]}
          onPress={() => void openInvite()}
          disabled={busy || !household}
          accessibilityLabel={t('hhInvite')}
        >
          <UserPlus color={colors.onPrimary ?? '#fff'} size={18} />
          <Text style={[styles.inviteBtnText, { color: colors.onPrimary ?? '#fff' }]}>{t('hhInvite')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : members.length === 0 ? (
        <EmptyState title={t('hhMembersEmpty')} />
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {members.map((member) => {
            const isMe = member.userId === user?.id;
            const isMemberAdmin = household?.createdBy === member.userId;
            return (
              <View
                key={member.userId}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
                  },
                ]}
              >
                <View style={styles.cardMain}>
                  {member.avatarUrl ? (
                    <Image source={{ uri: member.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                      <Text style={styles.avatarInitials}>{initialsFromName(member.displayName)}</Text>
                    </View>
                  )}
                  <View style={styles.cardTextCol}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
                        {member.displayName}
                        {isMe ? ` ${t('hhMembersYouSuffix')}` : ''}
                      </Text>
                      {isMemberAdmin ? (
                        <View style={[styles.adminBadge, { backgroundColor: `${colors.primary}22` }]}>
                          <Shield size={12} color={colors.primary} />
                          <Text style={[styles.adminBadgeText, { color: colors.primary }]}>
                            {t('hhMembersAdminBadge')}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {member.email && !member.firstName ? (
                      <Text style={[styles.memberEmail, { color: colors.textSecondary }]} numberOfLines={1}>
                        {member.email}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {isAdmin && !isMe ? (
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: colors.border }]}
                      onPress={() => confirmTransfer(member)}
                      disabled={busy}
                    >
                      <Crown size={16} color={colors.primary} />
                      <Text style={[styles.actionBtnText, { color: colors.primary }]}>
                        {t('hhMembersTransfer')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: colors.error }]}
                      onPress={() => confirmRemove(member)}
                      disabled={busy}
                    >
                      <UserMinus size={16} color={colors.error} />
                      <Text style={[styles.actionBtnText, { color: colors.error }]}>
                        {t('hhMembersRemove')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {isMe && isAdmin ? (
                  <TouchableOpacity
                    style={styles.selfActionMuted}
                    onPress={confirmTransferAndLeave}
                    disabled={busy}
                  >
                    <LogOut size={16} color={colors.textSecondary} />
                    <Text style={[styles.selfActionMutedText, { color: colors.textSecondary }]}>
                      {t('hhMembersTransferLeave')}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {isMe && !isAdmin ? (
                  <TouchableOpacity
                    style={[styles.selfAction, { borderColor: colors.error }]}
                    onPress={confirmLeave}
                    disabled={busy}
                  >
                    <LogOut size={16} color={colors.error} />
                    <Text style={[styles.selfActionText, { color: colors.error }]}>
                      {t('hhMembersLeave')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal
        visible={inviteSheet != null}
        transparent
        animationType="slide"
        onRequestClose={() => setInviteSheet(null)}
      >
        <Pressable style={styles.inviteBackdrop} onPress={() => setInviteSheet(null)}>
          <Pressable
            style={[styles.inviteSheet, { backgroundColor: colors.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.inviteHandle} />
            <Text style={[styles.inviteTitle, { color: colors.text }]}>{t('hhInvitePartnerTitle')}</Text>
            <Text style={[styles.inviteHint, { color: colors.textSecondary }]}>{t('hhInviteCodeHint')}</Text>
            <Text style={[styles.inviteCode, { color: colors.text }]} selectable>
              {inviteSheet?.inviteCode ?? '——'}
            </Text>
            <TouchableOpacity
              style={[styles.inviteShareBtn, { backgroundColor: colors.primary }]}
              onPress={() => void shareInvite()}
              disabled={!inviteSheet?.inviteCode}
            >
              <Text style={[styles.inviteShareText, { color: colors.onPrimary ?? '#fff' }]}>
                {t('hhInvite')}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  screenTitle: { fontSize: 22, fontWeight: '700' },
  screenSubtitle: { fontSize: 14, marginTop: 2 },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  inviteBtnText: { fontSize: 14, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cardTextCol: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  memberName: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  memberEmail: { fontSize: 13, marginTop: 2 },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  adminBadgeText: { fontSize: 12, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  selfAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
  },
  selfActionText: { fontSize: 14, fontWeight: '700' },
  selfActionMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  selfActionMutedText: { fontSize: 14, fontWeight: '500' },
  inviteBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  inviteSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  inviteHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(127,127,127,0.4)',
    marginBottom: 16,
  },
  inviteTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  inviteHint: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  inviteCode: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 20,
  },
  inviteShareBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  inviteShareText: { fontSize: 16, fontWeight: '700' },
});
