import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/auth-store';

/**
 * Při novém záznamu v household_partner_alerts zobrazí lokální push ostatním členům domácnosti.
 */
export function SavePartnerAlertsHandler() {
  const { user } = useAuth();
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (Platform.OS === 'web' || !user?.id) return;

    const userId = user.id;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const showLocalPush = async (title: string, body: string, id: string) => {
      if (seenIdsRef.current.has(id)) return;
      seenIdsRef.current.add(id);
      try {
        const Notifications = await import('expo-notifications');
        const permission = await Notifications.getPermissionsAsync();
        if (permission.status !== 'granted') return;
        await Notifications.scheduleNotificationAsync({
          content: { title, body, sound: true },
          trigger: null,
        });
        await supabase
          .from('household_partner_alerts')
          .update({ read_at: new Date().toISOString() })
          .eq('id', id)
          .eq('recipient_user_id', userId);
      } catch (e) {
        console.warn('[save-partner-alerts]', e);
      }
    };

    channel = supabase
      .channel(`save-partner-alerts:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'household_partner_alerts',
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { id?: string; title?: string; body?: string };
          if (!row?.id || !row.title || !row.body) return;
          void showLocalPush(row.title, row.body, row.id);
        },
      )
      .subscribe();

    void (async () => {
      const { data } = await supabase
        .from('household_partner_alerts')
        .select('id, title, body')
        .eq('recipient_user_id', userId)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(5);
      for (const row of data ?? []) {
        if (row.title && row.body) {
          await showLocalPush(row.title, row.body, row.id);
        }
      }
    })();

    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return null;
}
