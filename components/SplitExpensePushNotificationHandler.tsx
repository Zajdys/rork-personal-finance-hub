import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/store/auth-store';

export const SPLIT_EXPENSE_PUSH_TYPE = 'split_expense';

/**
 * Po klepnutí na remote push o split výdaji otevře detail skupiny.
 */
export function SplitExpensePushNotificationHandler() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const lastOpenRef = useRef<{ groupId: string; at: number } | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web' || !isAuthenticated || !user?.id) return;

    const openIfSplitExpense = (data: Record<string, unknown> | undefined) => {
      if (data?.type !== SPLIT_EXPENSE_PUSH_TYPE) return;
      const groupId = typeof data.groupId === 'string' ? data.groupId : undefined;
      if (!groupId) return;

      const now = Date.now();
      const prev = lastOpenRef.current;
      if (prev && prev.groupId === groupId && now - prev.at < 2500) return;
      lastOpenRef.current = { groupId, at: now };

      router.push({ pathname: '/split-group-detail', params: { id: groupId } });
    };

    const subscriptionRef: { current?: { remove: () => void } } = { current: undefined };
    let cancelled = false;

    void import('expo-notifications').then((Notifications) => {
      if (cancelled) return;

      void Notifications.getLastNotificationResponseAsync().then((last) => {
        if (cancelled || !last?.notification) return;
        openIfSplitExpense(last.notification.request.content.data as Record<string, unknown> | undefined);
      });

      subscriptionRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
        openIfSplitExpense(response.notification.request.content.data as Record<string, unknown> | undefined);
      });
    });

    return () => {
      cancelled = true;
      subscriptionRef.current?.remove();
    };
  }, [isAuthenticated, router, user?.id]);

  return null;
}
