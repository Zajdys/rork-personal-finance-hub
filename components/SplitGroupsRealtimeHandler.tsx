import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { fetchMySplitGroupIds } from '@/lib/split-groups-realtime';
import { useAuth } from '@/store/auth-store';
import { useLanguageStore } from '@/store/language-store';
import { useSplitGroupsStore } from '@/store/split-groups-store';

type RealtimeChannel = ReturnType<typeof supabase.channel>;

/**
 * Realtime pro split_expenses a split_settlements ve všech skupinách, kde je uživatel členem.
 * Refetchnutí store + lokální push při novém výdaji od jiného uživatele.
 */
export function SplitGroupsRealtimeHandler() {
  const { user } = useAuth();
  const { t } = useLanguageStore();
  const fetchGroups = useSplitGroupsStore((s) => s.fetchGroups);
  const fetchExpensesForGroups = useSplitGroupsStore((s) => s.fetchExpensesForGroups);
  const seenExpenseIdsRef = useRef<Set<string>>(new Set());
  const channelsRef = useRef<RealtimeChannel[]>([]);

  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;
    let cancelled = false;

    const removeAllChannels = () => {
      for (const channel of channelsRef.current) {
        void supabase.removeChannel(channel);
      }
      channelsRef.current = [];
    };

    const refetchGroup = (groupId: string) => {
      void fetchExpensesForGroups([groupId]);
    };

    const groupName = (groupId: string) =>
      useSplitGroupsStore.getState().groups.find((g) => g.id === groupId)?.name ?? t('splitGroups');

    const showExpensePush = async (groupId: string, description: string, expenseId: string) => {
      if (seenExpenseIdsRef.current.has(expenseId)) return;
      seenExpenseIdsRef.current.add(expenseId);

      const existing = useSplitGroupsStore.getState().expensesByGroupId[groupId] ?? [];
      if (existing.some((e) => e.id === expenseId)) return;

      if (Platform.OS === 'web') return;

      try {
        const Notifications = await import('expo-notifications');
        const permission = await Notifications.getPermissionsAsync();
        if (permission.status !== 'granted') return;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: groupName(groupId),
            body: t('splitGroupsRealtimeNewExpense', {
              description: description.trim() || t('splitGroupsUntitledExpense'),
            }),
            sound: true,
          },
          trigger: null,
        });
      } catch (e) {
        console.warn('[split-groups-realtime] push failed', e);
      }
    };

    const handleExpenseChange = (
      groupId: string,
      payload: { eventType: string; new: Record<string, unknown> },
    ) => {
      if (payload.eventType === 'INSERT') {
        const row = payload.new;
        const expenseId = row.id == null ? '' : String(row.id);
        if (!expenseId) return;

        if (seenExpenseIdsRef.current.has(expenseId)) {
          refetchGroup(groupId);
          return;
        }

        const existing = useSplitGroupsStore.getState().expensesByGroupId[groupId] ?? [];
        if (existing.some((e) => e.id === expenseId)) {
          refetchGroup(groupId);
          return;
        }

        const description = row.description == null ? '' : String(row.description);
        void showExpensePush(groupId, description, expenseId);
      }
      refetchGroup(groupId);
    };

    const subscribeGroups = async () => {
      removeAllChannels();
      if (cancelled) return;

      await fetchGroups();
      const groupIds = await fetchMySplitGroupIds(userId);
      if (cancelled || !groupIds.length) return;

      for (const groupId of groupIds) {
        const channel = supabase
          .channel(`split-realtime:${userId}:${groupId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'split_expenses',
              filter: `group_id=eq.${groupId}`,
            },
            (payload) => handleExpenseChange(groupId, payload),
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'split_settlements',
              filter: `group_id=eq.${groupId}`,
            },
            () => refetchGroup(groupId),
          )
          .subscribe();
        channelsRef.current.push(channel);
      }

      const membersChannel = supabase
        .channel(`split-my-members:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'split_group_members',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            void subscribeGroups();
          },
        )
        .subscribe();
      channelsRef.current.push(membersChannel);
    };

    void subscribeGroups();

    return () => {
      cancelled = true;
      removeAllChannels();
    };
  }, [fetchExpensesForGroups, fetchGroups, t, user?.id]);

  return null;
}
