import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SAVE_PENDING_NOTIFICATION_TYPE } from '@/store/save-pending-store';

/**
 * Po klepnutí na naplánované upozornění „Rozmyslet“ otevře detail položky.
 */
export function SavePendingNotificationHandler() {
  const router = useRouter();
  const lastOpenRef = useRef<{ pendingItemId: string; at: number } | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const openIfSavePending = (data: Record<string, unknown> | undefined) => {
      if (data?.type !== SAVE_PENDING_NOTIFICATION_TYPE) return;
      const id = typeof data.pendingItemId === 'string' ? data.pendingItemId : undefined;
      if (!id) return;
      const now = Date.now();
      const prev = lastOpenRef.current;
      if (prev && prev.pendingItemId === id && now - prev.at < 2500) return;
      lastOpenRef.current = { pendingItemId: id, at: now };
      router.push({ pathname: '/save-pending-detail', params: { id } });
    };

    const subscriptionRef: { current?: { remove: () => void } } = { current: undefined };
    let cancelled = false;

    void import('expo-notifications').then((Notifications) => {
      if (cancelled) return;

      void Notifications.getLastNotificationResponseAsync().then((last) => {
        if (cancelled || !last?.notification) return;
        openIfSavePending(last.notification.request.content.data as Record<string, unknown> | undefined);
      });

      subscriptionRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
        openIfSavePending(response.notification.request.content.data as Record<string, unknown> | undefined);
      });
    });

    return () => {
      cancelled = true;
      subscriptionRef.current?.remove();
    };
  }, [router]);

  return null;
}
