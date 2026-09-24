import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { registerExpoPushTokenForUser } from '@/lib/expo-push-token';
import { useAuth } from '@/store/auth-store';

/**
 * Jednou po přihlášení (a při návratu appky do popředí) uloží Expo push token do Supabase.
 */
export function ExpoPushTokenRegistration() {
  const { user, isAuthenticated } = useAuth();
  const registeredForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web' || !isAuthenticated || !user?.id) return;

    if (registeredForUserRef.current === user.id) return;

    void registerExpoPushTokenForUser(user.id).then((ok) => {
      if (ok) registeredForUserRef.current = user.id;
    });
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (Platform.OS === 'web' || !isAuthenticated || !user?.id) return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void registerExpoPushTokenForUser(user.id).then((ok) => {
          if (ok) registeredForUserRef.current = user.id;
        });
      }
    });

    return () => subscription.remove();
  }, [isAuthenticated, user?.id]);

  return null;
}
