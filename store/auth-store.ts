import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { flushPendingOnboardingProfileSync } from '@/lib/onboarding-completion';
import { clearLocalStorageAfterAccountDeletion, invokeDeleteAccountEdge } from '@/lib/account-deletion';
import { supabase, supabaseUrl } from '@/lib/supabase';
import { useFinanceStore } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';

export interface User {
  id: string;
  email: string;
  name: string;
  registrationDate: string;
  /** Loaded from Supabase `users.onboarding_completed`; defaults to false until profile is fetched. */
  onboardingCompleted: boolean;
  /** Loaded from Supabase `users.welcome_tour_completed`; false → show short welcome tour after onboarding. */
  welcomeTourCompleted: boolean;
  subscription: {
    active: boolean;
    plan: 'monthly' | 'quarterly' | 'yearly' | null;
    expiresAt: string | null;
  };
}

// Simple storage abstraction to avoid direct AsyncStorage import
const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      return await AsyncStorage.default.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      await AsyncStorage.default.setItem(key, value);
    } catch {
      // Ignore storage errors
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      const AsyncStorage = await import('@react-native-async-storage/async-storage');
      await AsyncStorage.default.removeItem(key);
    } catch {
      // Ignore storage errors
    }
  },
};

const STORAGE_KEY = 'auth_state';

const SUPABASE_PROJECT_REF =
  supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? 'jcwbkydaeeqcbdcxgnad';
const SUPABASE_AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

/** Pouze chyby vypršeného / neplatného refresh tokenu — ne ostatní auth errory. */
export function isInvalidRefreshTokenError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error ?? '');
  const lower = message.toLowerCase();
  return lower.includes('invalid refresh token') || lower.includes('refresh token not found');
}

async function purgeAuthStorage(): Promise<void> {
  await AsyncStorage.multiRemove([
    'session',
    'refreshToken',
    STORAGE_KEY,
    SUPABASE_AUTH_STORAGE_KEY,
  ]);
}

export async function syncLocalFinanceDataForAuthUser(userId: string | null): Promise<void> {
  if (!userId) return;

  const lastUserId = await AsyncStorage.getItem('last_user_id');

  if (lastUserId !== userId) {
    await AsyncStorage.multiRemove([
      'finance_transactions',
      'finance_goals',
      'finance_reports',
      'finance_subscriptions',
      'finance_custom_categories',
      'finance_loans',
      'ignored_detected_subscriptions',
    ]);
    await AsyncStorage.setItem('last_user_id', userId);
  }
}

async function readUserGateFlagsFromSupabase(userId: string): Promise<{
  onboardingCompleted: boolean;
  welcomeTourCompleted: boolean;
}> {
  const legacy = await storage.getItem('onboarding_completed');

  const { data, error } = await supabase
    .from('users')
    .select('onboarding_completed, welcome_tour_completed')
    .eq('id', userId)
    .maybeSingle();

  console.log('[auth] gate flags raw', { userId, data, error: error?.message ?? null });

  let onboardingCompleted = false;
  if (!error && data?.onboarding_completed === true) {
    onboardingCompleted = true;
  } else if (legacy === 'true') {
    const { error: upErr } = await supabase
      .from('users')
      .update({ onboarding_completed: true })
      .eq('id', userId);
    if (!upErr) {
      onboardingCompleted = true;
    } else {
      console.warn('[auth] trust local onboarding_completed; server sync deferred', upErr.message);
      onboardingCompleted = true;
    }
  } else if (error) {
    console.warn('[auth] read onboarding/welcome flags', error.message);
  }

  // Jen explicitní true v DB = tour hotový. false / null / chybějící sloupec → ukázat tour.
  const welcomeTourCompleted = data?.welcome_tour_completed === true;

  console.log('[auth] gate flags computed', { onboardingCompleted, welcomeTourCompleted });

  return { onboardingCompleted, welcomeTourCompleted };
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasActiveSubscription, setHasActiveSubscription] = useState<boolean>(false);
  const intentionalLogoutRef = useRef(false);
  const invalidRefreshHandledRef = useRef(false);
  const isAuthenticatedRef = useRef(false);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  const handleInvalidRefreshToken = useCallback(async (source: string): Promise<void> => {
    if (invalidRefreshHandledRef.current) return;
    invalidRefreshHandledRef.current = true;
    console.warn('[auth] invalid refresh token — clearing session', { source });

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (signOutError) {
      console.warn('[auth] local signOut after invalid refresh', signOutError);
    }

    await purgeAuthStorage();
    useSettingsStore.getState().clearUserProfile();
    setUser(null);
    setIsAuthenticated(false);
    setHasActiveSubscription(false);
    setIsLoading(false);

    router.replace('/auth');
    Alert.alert('Session vypršela', 'Tvoje session vypršela. Přihlaš se prosím znova.');
  }, []);

  const recoverSession = useCallback(async (): Promise<boolean> => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      if (isInvalidRefreshTokenError(error)) {
        await handleInvalidRefreshToken('getSession');
        return false;
      }
      console.error('[auth] getSession failed', error);
      return false;
    }

    if (data.session) return true;

    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      if (isInvalidRefreshTokenError(refreshError)) {
        await handleInvalidRefreshToken('refreshSession');
        return false;
      }
      console.warn('[auth] refreshSession failed (non-fatal)', refreshError.message);
      return false;
    }

    return true;
  }, [handleInvalidRefreshToken]);

  const login = useCallback(async (email: string, password: string): Promise<{
    success: boolean;
    error?: string;
    onboardingCompleted?: boolean;
    welcomeTourCompleted?: boolean;
  }> => {
    try {
      const safeEmail = String(email ?? '').trim().toLowerCase();
      const safePassword = String(password ?? '').trim();

      console.log('[auth] login → signInWithPassword (input)', {
        email: safeEmail,
        passwordLength: safePassword.length,
      });

      if (!safeEmail || !safePassword) {
        console.warn('[auth] login rejected: empty email or password');
        return { success: false, error: 'Vyplňte email a heslo' };
      }
      if (safeEmail.length > 100 || safePassword.length > 100) {
        console.warn('[auth] login rejected: email or password too long');
        return { success: false, error: 'Údaje jsou příliš dlouhé' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: safeEmail,
        password: safePassword,
      });

      if (error) {
        console.error('[auth] signInWithPassword error (full)', {
          message: error.message,
          name: error.name,
          status: (error as { status?: number }).status,
          code: (error as { code?: string }).code,
          raw: error,
        });
        return { success: false, error: error.message || 'Přihlášení selhalo' };
      }

      if (!data.user) {
        console.error('[auth] signInWithPassword: no data.user in response', { data });
        return { success: false, error: 'Neplatná odpověď serveru' };
      }

      console.log('[auth] signInWithPassword ok', {
        userId: data.user.id,
        hasSession: Boolean(data.session),
        emailConfirmedAt: data.user.email_confirmed_at,
      });

      const userId = data.user.id;
      const createdAt = data.user.created_at ?? new Date().toISOString();
      const profileName =
        (typeof data.user.user_metadata?.name === 'string' && data.user.user_metadata.name) ||
        (typeof data.user.user_metadata?.display_name === 'string' && data.user.user_metadata.display_name) ||
        safeEmail.split('@')[0] ||
        'User';

      let onboardingCompleted = false;
      let welcomeTourCompleted = false;
      try {
        const flags = await readUserGateFlagsFromSupabase(userId);
        onboardingCompleted = flags.onboardingCompleted;
        welcomeTourCompleted = flags.welcomeTourCompleted;
      } catch (e) {
        console.error('[auth] readUserGateFlagsFromSupabase failed (login continues)', e);
      }
      const newUser: User = {
        id: userId,
        email: safeEmail,
        name: profileName,
        registrationDate: createdAt,
        onboardingCompleted,
        welcomeTourCompleted,
        subscription: {
          active: true,
          plan: null,
          expiresAt: null,
        },
      };

      setUser(newUser);
      setIsAuthenticated(true);
      setHasActiveSubscription(true);
      setIsLoading(false);

      await storage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          user: newUser,
          isAuthenticated: true,
          hasActiveSubscription: true,
        })
      );

      await syncLocalFinanceDataForAuthUser(userId);

      invalidRefreshHandledRef.current = false;
      console.log('[auth] login completed', { userId: newUser.id, onboardingCompleted, welcomeTourCompleted });
      void flushPendingOnboardingProfileSync();
      return { success: true, onboardingCompleted, welcomeTourCompleted };
    } catch (error) {
      console.error('[auth] login unexpected error', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Nastala chyba při přihlášení',
      };
    }
  }, []);

  const register = useCallback(async (email: string, password: string, name: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const safeEmail = String(email ?? '').trim().toLowerCase();
      const safePassword = String(password ?? '').trim();
      const safeName = String(name ?? '').trim();

      if (!safeEmail || !safePassword || !safeName) {
        return { success: false, error: 'Vyplňte všechna pole' };
      }
      if (safeEmail.length > 100 || safePassword.length > 100 || safeName.length > 100) {
        return { success: false, error: 'Údaje jsou příliš dlouhé' };
      }

      const { data, error } = await supabase.auth.signUp({
        email: safeEmail,
        password: safePassword,
        options: {
          data: {
            name: safeName,
            display_name: safeName,
          },
        },
      });
      if (error) {
        const errorMsg = error.message || 'Registrace selhala';
        console.error('[auth] register failed', error);
        return { success: false, error: errorMsg };
      }
      const authUser = data.user;
      if (!authUser) {
        return { success: false, error: 'Uživatel nebyl vytvořen' };
      }

      console.log('[auth] register signUp ok', {
        userId: authUser.id,
        hasSession: Boolean(data.session),
        emailConfirmedAt: authUser.email_confirmed_at,
      });
      if (!data.session) {
        console.warn(
          '[auth] register: no session returned — Supabase may require email confirmation before signInWithPassword works. Check Auth → Providers → Email → Confirm email.'
        );
      }
      const userId = authUser.id;
      const createdAt = authUser.created_at ?? new Date().toISOString();

      const newUser: User = {
        id: userId,
        email: safeEmail,
        name: safeName,
        registrationDate: createdAt,
        onboardingCompleted: false,
        welcomeTourCompleted: false,
        subscription: {
          active: true,
          plan: null,
          expiresAt: null,
        },
      };

      const { error: profileError } = await supabase.from('users').upsert({
        id: userId,
        email: safeEmail,
        display_name: safeName,
        onboarding_completed: false,
        welcome_tour_completed: false,
      });
      if (profileError) {
        console.error('[auth] profile upsert failed', profileError);
        Alert.alert('Chyba registrace', `Profil se nepodařilo uložit: ${profileError.message}`);
      }

      setUser(newUser);
      setIsAuthenticated(true);
      setHasActiveSubscription(true);
      setIsLoading(false);

      await storage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          user: newUser,
          isAuthenticated: true,
          hasActiveSubscription: true,
        })
      );

      // Při registraci nového účtu vždy vymaž lokální data
      await AsyncStorage.multiRemove([
        'finance_transactions',
        'finance_goals',
        'finance_reports',
        'finance_subscriptions',
        'finance_custom_categories',
        'finance_loans',
        'ignored_detected_subscriptions',
      ]);
      await AsyncStorage.setItem('last_user_id', userId);

      invalidRefreshHandledRef.current = false;
      return { success: true };
    } catch (error) {
      console.error('Registration error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Nelze spojit se serverem';
      return { success: false, error: errorMsg };
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    intentionalLogoutRef.current = true;
    try {
      await supabase.auth.signOut();
      router.replace('/auth');
      await purgeAuthStorage();
      useSettingsStore.getState().clearUserProfile();
      setUser(null);
      setIsAuthenticated(false);
      setHasActiveSubscription(false);
      setIsLoading(false);
      invalidRefreshHandledRef.current = false;
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      intentionalLogoutRef.current = false;
    }
  }, []);

  const activateSubscription = useCallback(async (plan: 'monthly' | 'quarterly' | 'yearly'): Promise<void> => {
    if (!user) return;

    const updatedUser: User = {
      ...user,
      onboardingCompleted: user.onboardingCompleted ?? false,
      welcomeTourCompleted: user.welcomeTourCompleted ?? false,
      subscription: {
        active: true,
        plan,
        expiresAt: new Date(Date.now() + (plan === 'yearly' ? 365 : plan === 'quarterly' ? 90 : 30) * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
    
    setUser(updatedUser);
    setHasActiveSubscription(true);
    
    await storage.setItem(STORAGE_KEY, JSON.stringify({
      user: updatedUser,
      isAuthenticated: true,
      hasActiveSubscription: true,
    }));
  }, [user]);

  const loadAuthState = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      const sessionOk = await recoverSession();
      if (!sessionOk) {
        if (invalidRefreshHandledRef.current) return;
        setUser(null);
        setIsAuthenticated(false);
        setHasActiveSubscription(false);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        if (isInvalidRefreshTokenError(error)) {
          await handleInvalidRefreshToken('loadAuthState:getSession');
          return;
        }
        console.error('[auth] getSession failed', error);
      }
      if (data.session?.user) {
        const sessionUser = data.session.user;
        await syncLocalFinanceDataForAuthUser(sessionUser.id);
        const name =
          (typeof sessionUser.user_metadata?.name === 'string' && sessionUser.user_metadata.name) ||
          (typeof sessionUser.user_metadata?.display_name === 'string' && sessionUser.user_metadata.display_name) ||
          sessionUser.email?.split('@')[0] ||
          'User';
        const flags = await readUserGateFlagsFromSupabase(sessionUser.id);
        const hydratedUser: User = {
          id: sessionUser.id,
          email: sessionUser.email ?? '',
          name,
          registrationDate: sessionUser.created_at ?? new Date().toISOString(),
          onboardingCompleted: flags.onboardingCompleted,
          welcomeTourCompleted: flags.welcomeTourCompleted,
          subscription: {
            active: true,
            plan: null,
            expiresAt: null,
          },
        };
        setUser(hydratedUser);
        setIsAuthenticated(true);
        setHasActiveSubscription(true);
        void flushPendingOnboardingProfileSync();
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setHasActiveSubscription(false);
      }
      setIsLoading(false);
    } catch (error) {
      if (isInvalidRefreshTokenError(error)) {
        await handleInvalidRefreshToken('loadAuthState');
        return;
      }
      console.error('Load auth state error:', error);
      setIsLoading(false);
    }
  }, [handleInvalidRefreshToken, recoverSession]);

  const checkSubscriptionStatus = useCallback((): boolean => {
    if (!user?.subscription?.active) return false;

    if (user.subscription.expiresAt) {
      return new Date(user.subscription.expiresAt) > new Date();
    }

    return false;
  }, [user]);

  useEffect(() => {
    void loadAuthState();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on AuthProvider mount
  }, []);

  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' || intentionalLogoutRef.current) return;
      void (async () => {
        const { error } = await supabase.auth.getUser();
        if (error && isInvalidRefreshTokenError(error)) {
          await handleInvalidRefreshToken('getUser:active');
        }
      })();
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_OUT' || session || intentionalLogoutRef.current) return;
      if (!isAuthenticatedRef.current) return;
      // Supabase po selhání auto-refresh smaže session a emitne SIGNED_OUT bez error objektu.
      void handleInvalidRefreshToken('onAuthStateChange:signedOut');
    });

    return () => {
      appStateSub.remove();
      authListener.subscription.unsubscribe();
    };
  }, [handleInvalidRefreshToken]);

  const completeWelcomeTour = useCallback(async (): Promise<void> => {
    if (!user) return;
    const { error } = await supabase
      .from('users')
      .update({ welcome_tour_completed: true })
      .eq('id', user.id);
    if (error) {
      console.warn('[auth] welcome_tour_completed update', error.message);
    }
    const updatedUser: User = { ...user, welcomeTourCompleted: true };
    setUser(updatedUser);
    await storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        user: updatedUser,
        isAuthenticated: true,
        hasActiveSubscription,
      }),
    );
  }, [user, hasActiveSubscription]);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    storage.setItem(STORAGE_KEY, JSON.stringify({
      user: updatedUser,
      isAuthenticated: true,
      hasActiveSubscription,
    }));
  }, [hasActiveSubscription]);

  const deleteAccount = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const result = await invokeDeleteAccountEdge();
    if (!result.ok) {
      return { success: false, error: result.message };
    }
    await clearLocalStorageAfterAccountDeletion();
    try {
      await useFinanceStore.getState().loadData();
    } catch (e) {
      console.warn('[auth] loadData after account delete', e);
    }
    await logout();
    return { success: true };
  }, [logout]);

  return useMemo(() => ({
    user,
    isAuthenticated,
    isLoading,
    hasActiveSubscription,
    login,
    register,
    logout,
    deleteAccount,
    activateSubscription,
    loadAuthState,
    checkSubscriptionStatus,
    completeWelcomeTour,
    setUser: updateUser,
  }), [
    user,
    isAuthenticated,
    isLoading,
    hasActiveSubscription,
    login,
    register,
    logout,
    deleteAccount,
    activateSubscription,
    loadAuthState,
    checkSubscriptionStatus,
    completeWelcomeTour,
    updateUser,
  ]);
});