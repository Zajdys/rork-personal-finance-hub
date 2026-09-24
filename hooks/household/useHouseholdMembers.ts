import { useCallback, useState, type MutableRefObject } from 'react';
import { Alert, Platform, Share } from 'react-native';
import { supabase } from '@/lib/supabase';
import {
  fetchHouseholdMembersWithProfiles,
  householdMemberRpcErrorKey,
  rpcLeaveHousehold,
} from '@/lib/household-members';
import { hasSupabaseSession, logSupabaseDataError } from '@/lib/supabase-session';
import { useAuth } from '@/store/auth-store';
import { useLanguageStore } from '@/store/language-store';
import { useHouseholdActiveStore, type UserHousehold } from '@/store/household-active-store';
import type { Member } from '@/components/household/types';
import { formatSupabaseError } from './utils';

type LoadHouseholdDataFn = (hid: string, currentUserId: string) => Promise<void>;

type UseHouseholdMembersParams = {
  loadHouseholdDataRef: MutableRefObject<LoadHouseholdDataFn>;
  setLoadingRef: MutableRefObject<(v: boolean) => void>;
  setHouseholdSwitcherOpenRef: MutableRefObject<(v: boolean) => void>;
  clearDependentData: () => void;
};

export function useHouseholdMembers({
  loadHouseholdDataRef,
  setLoadingRef,
  setHouseholdSwitcherOpenRef,
  clearDependentData,
}: UseHouseholdMembersParams) {
  const { t } = useLanguageStore();
  const { user } = useAuth();
  const fetchUserHouseholds = useHouseholdActiveStore((s) => s.fetchHouseholds);
  const setActiveHouseholdId = useHouseholdActiveStore((s) => s.setActiveHouseholdId);

  const [members, setMembers] = useState<Member[]>([]);
  const [inviteSheetHousehold, setInviteSheetHousehold] = useState<UserHousehold | null>(null);
  const [householdActionBusy, setHouseholdActionBusy] = useState(false);

  const clearData = useCallback(() => {
    setMembers([]);
  }, []);

  const fetchMembers = useCallback(async (hid: string) => {
    if (!(await hasSupabaseSession())) return;
    try {
      const { members: list, error } = await fetchHouseholdMembersWithProfiles(
        hid,
        useLanguageStore.getState().t('hhMemberFallback'),
      );
      if (error) {
        logSupabaseDataError('Failed to load household members', error);
        return;
      }
      setMembers(list.map((m) => ({ userId: m.userId, name: m.displayName })));
    } catch (e) {
      logSupabaseDataError('Failed to load household members', e);
    }
  }, []);

  const openInviteSheet = useCallback(
    async (item: UserHousehold) => {
      console.log('[household] openInviteSheet household object', JSON.stringify(item));

      let code = item.inviteCode;
      if (!code) {
        const fetched = await useHouseholdActiveStore.getState().fetchInviteCode(item.id);
        console.log('[household] openInviteSheet fetched invite_code', fetched);
        code = fetched;
        if (fetched) {
          useHouseholdActiveStore.getState().patchHousehold(item.id, { inviteCode: fetched });
        }
      }

      const resolved: UserHousehold = { ...item, inviteCode: code };
      console.log('[household] openInviteSheet resolved for sheet', JSON.stringify(resolved));

      if (!resolved.inviteCode) {
        Alert.alert(t('error'), t('hhInviteCodeMissing'));
        return;
      }
      setInviteSheetHousehold(resolved);
    },
    [t],
  );

  const handleShareHouseholdInvite = useCallback(async () => {
    if (!inviteSheetHousehold?.inviteCode) return;
    const message = t('hhShareInviteMessage', {
      name: inviteSheetHousehold.name,
      code: inviteSheetHousehold.inviteCode,
    });
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(message);
        Alert.alert(t('monthlyReportCopied'), t('monthlyReportCopiedMessage'));
        return;
      }
      await Share.share({ message, title: t('hhInvitePartnerTitle') });
    } catch (e) {
      console.warn('[household] share invite', e);
    }
  }, [inviteSheetHousehold, t]);

  const refreshAfterHouseholdMembershipChange = useCallback(async () => {
    if (!user) return;
    setLoadingRef.current(true);
    try {
      const list = await fetchUserHouseholds(user.id);
      const nextId = useHouseholdActiveStore.getState().activeHouseholdId;
      clearData();
      clearDependentData();
      if (nextId && list.some((h) => h.id === nextId)) {
        await loadHouseholdDataRef.current(nextId, user.id);
      } else if (list[0]) {
        await setActiveHouseholdId(user.id, list[0].id);
        await loadHouseholdDataRef.current(list[0].id, user.id);
      } else {
        await setActiveHouseholdId(user.id, null);
      }
    } finally {
      setLoadingRef.current(false);
      setHouseholdSwitcherOpenRef.current(false);
      setInviteSheetHousehold(null);
    }
  }, [
    clearData,
    clearDependentData,
    fetchUserHouseholds,
    loadHouseholdDataRef,
    setActiveHouseholdId,
    setHouseholdSwitcherOpenRef,
    setLoadingRef,
    user,
  ]);

  const deleteHouseholdAsCreator = useCallback(
    async (item: UserHousehold) => {
      if (!user) return;
      setHouseholdActionBusy(true);
      try {
        const { error } = await supabase.from('households').delete().eq('id', item.id).eq('created_by', user.id);
        if (error) {
          Alert.alert(t('error'), t('hhDeleteHouseholdFailed', { detail: formatSupabaseError(error) }));
          return;
        }
        await refreshAfterHouseholdMembershipChange();
      } finally {
        setHouseholdActionBusy(false);
      }
    },
    [refreshAfterHouseholdMembershipChange, t, user],
  );

  const leaveHouseholdAsMember = useCallback(
    async (item: UserHousehold) => {
      if (!user) return;
      setHouseholdActionBusy(true);
      try {
        const res = await rpcLeaveHousehold(item.id);
        if (!res.ok) {
          Alert.alert(t('error'), t(householdMemberRpcErrorKey(res.error)));
          return;
        }
        await refreshAfterHouseholdMembershipChange();
      } finally {
        setHouseholdActionBusy(false);
      }
    },
    [refreshAfterHouseholdMembershipChange, t, user],
  );

  const confirmDeleteOrLeaveHousehold = useCallback(
    (item: UserHousehold) => {
      if (!user) return;
      const isCreator = item.createdBy === user.id;
      if (isCreator) {
        Alert.alert(t('hhDeleteHousehold'), t('hhDeleteHouseholdConfirm'), [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t('hhDeleteHousehold'),
            style: 'destructive',
            onPress: () => void deleteHouseholdAsCreator(item),
          },
        ]);
        return;
      }
      Alert.alert(t('hhLeaveHousehold'), t('hhLeaveHouseholdConfirm', { name: item.name }), [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('hhLeaveHousehold'),
          style: 'destructive',
          onPress: () => void leaveHouseholdAsMember(item),
        },
      ]);
    },
    [deleteHouseholdAsCreator, leaveHouseholdAsMember, t, user],
  );

  return {
    data: {
      members,
      inviteSheetHousehold,
      householdActionBusy,
    },
    loading: false,
    error: null as string | null,
    setMembers,
    setInviteSheetHousehold,
    clearData,
    fetchMembers,
    openInviteSheet,
    handleShareHouseholdInvite,
    refreshAfterHouseholdMembershipChange,
    deleteHouseholdAsCreator,
    leaveHouseholdAsMember,
    confirmDeleteOrLeaveHousehold,
  };
}
