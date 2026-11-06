import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { flushPendingOnboardingProfileSync } from '@/lib/onboarding-completion';
import { clearLocalStorageAfterAccountDeletion, invokeDeleteAccountEdge } from '@/lib/account-deletion';
import { authErrorI18nKey, classifyAuthError, isEmailNotConfirmedError } from '@/lib/auth-errors';
import { fetchTermsAccepted, upsertTermsConsent } from '@/lib/terms-consent';
import { validateRegistrationPassword } from '@/lib/password-validation';
import { supabase, supabaseUrl } from '@/lib/supabase';
import { useFinanceStore } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore, trNow } from '@/store/language-store';
import {
  planFromCustomerInfo,
  useRevenueCatStore,
  logoutUser as rcLogoutUser,
} from '@/store/revenuecat-store';
import { isDevForcePremium } from '@/constants/premium';

function translateAuthError(error: unknown): string {
  const key = authErrorI18nKey(classifyAuthError(error));
  return useLanguageStore.getState().t(key as 'auth.errorGeneric');
}

export interface User {
  id: string;
  email: string;
  name: string;
  registrationDate: string;
  /** Loaded from Supabase `users.onboarding_completed`; defaults to false until profile is fetched. */
  onboardingCompleted: boolean;
  /** Loaded from Supabase `users.welcome_tour_completed`; false → show short welcome tour after onboarding. */
  welcomeTourCompleted: boolean;
  /** true = user_profiles.terms_accepted_at je nastaveno. */
  termsAccepted: boolean;
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

/** Lokální cache welcome tour — výchozí před (a při) DB potvrzení. */
function welcomeTourLocalKey(userId: string): string {
  return `welcome_tour_completed:${userId}`;
}

async function readLocalWelcomeTourCompleted(userId: string): Promise<boolean> {
  return (await storage.getItem(welcomeTourLocalKey(userId))) === 'true';
}

async function writeLocalWelcomeTourCompleted(userId: string, completed: boolean): Promise<void> {
  if (completed) {
    await storage.setItem(welcomeTourLocalKey(userId), 'true');
  } else {
    await storage.removeItem(welcomeTourLocalKey(userId));
  }
}

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

/**
 * public.users + user_profiles až když existuje session (po verifyOtp / přihlášení).
 * Upsert — bezpečné při opakování.
 */
async function ensureUserRowsAfterSession(params: {
  userId: string;
  email: string;
  displayName: string;
  /** Nová registrace: onboarding hotový, welcome tour ne, souhlas s podmínkami (zaškrtnutý při registraci). */
  newRegistration?: boolean;
}): Promise<{ termsOk: boolean }> {
  const { userId, email, displayName, newRegistration } = params;
  const row: Record<string, unknown> = {
    id: userId,
    email,
    display_name: displayName,
  };
  if (newRegistration) {
    row.onboarding_completed = true;
    row.welcome_tour_completed = false;
  }
  // Přihlášení: řádek jen doplnit, když chybí (nepřepisovat jméno z „Upravit profil“).
  const { error: profileError } = newRegistration
    ? await supabase.from('users').upsert(row)
    : await supabase.from('users').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
  if (profileError) {
    console.error('[auth] users upsert failed', profileError);
    Alert.alert(
      useLanguageStore.getState().t('error'),
      useLanguageStore.getState().t('auth.consentSaveFailed' as 'auth.errorGeneric'),
    );
  }
  // Souhlas s podmínkami jen u registrace (při přihlášení rozhodne gate accept-terms).
  if (!newRegistration) return { termsOk: false };
  const consent = await upsertTermsConsent(userId);
  if (!consent.ok) {
    console.error('[auth] terms consent upsert failed', consent.message);
    Alert.alert(
      useLanguageStore.getState().t('error'),
      useLanguageStore.getState().t('auth.consentSaveFailed' as 'auth.errorGeneric'),
    );
  }
  return { termsOk: consent.ok };
}

async function readUserGateFlagsFromSupabase(userId: string): Promise<{
  onboardingCompleted: boolean;
  welcomeTourCompleted: boolean;
  termsAccepted: boolean;
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

  // Lokální cache jako výchozí (cold start); DB jen potvrdí / doplní true.
  const localWelcomeDone = await readLocalWelcomeTourCompleted(userId);
  const dbWelcomeDone = data?.welcome_tour_completed === true;
  let welcomeTourCompleted = localWelcomeDone || dbWelcomeDone;
  if (dbWelcomeDone && !localWelcomeDone) {
    await writeLocalWelcomeTourCompleted(userId, true);
  } else if (localWelcomeDone && !dbWelcomeDone) {
    // Lokálně hotovo, DB ještě ne — dožene sync (nesmí znovu ukázat tour).
    void supabase
      .from('users')
      .update({ welcome_tour_completed: true, onboarding_completed: true })
      .eq('id', userId);
  }

  const termsAccepted = await fetchTermsAccepted(userId);

  console.log('[auth] gate flags computed', {
    onboardingCompleted,
    welcomeTourCompleted,
    localWelcomeDone,
    dbWelcomeDone,
    termsAccepted,
  });

  // Dotazník je vyřazený z flow → pro gate (AppLock apod.) bereme onboarding vždy jako hotový.
  // Řeší i závod, kdy SIGNED_IN přečte flags dřív, než registrace zapíše řádek do `users`.
  void onboardingCompleted;
  return { onboardingCompleted: true, welcomeTourCompleted, termsAccepted };
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  /** false dokud nejsou gate flags (welcome/terms) vyřešené pro aktuální session. */
  const [gateFlagsReady, setGateFlagsReady] = useState<boolean>(false);
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
    try {
      await rcLogoutUser();
    } catch {
      /* ignore */
    }
    useRevenueCatStore.getState().reset();
    setUser(null);
    setIsAuthenticated(false);
    setHasActiveSubscription(false);
    setGateFlagsReady(true);
    setIsLoading(false);

    router.replace('/auth');
    Alert.alert(
      trNow('Session vypršela', 'Session expired'),
      trNow('Tvoje session vypršela. Přihlaš se prosím znova.', 'Your session has expired. Please sign in again.'),
    );
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

  const establishAuthenticatedSession = useCallback(
    async (params: {
      userId: string;
      email: string;
      name: string;
      createdAt: string;
      onboardingCompleted: boolean;
      welcomeTourCompleted: boolean;
      termsAccepted: boolean;
      clearLocalFinance?: boolean;
    }): Promise<User> => {
      const {
        userId,
        email,
        name,
        createdAt,
        onboardingCompleted,
        welcomeTourCompleted,
        termsAccepted,
        clearLocalFinance,
      } = params;

      const baseUser: User = {
        id: userId,
        email,
        name,
        registrationDate: createdAt,
        onboardingCompleted,
        welcomeTourCompleted,
        termsAccepted,
        subscription: {
          active: false,
          plan: null,
          expiresAt: null,
        },
      };

      setUser(baseUser);
      setIsAuthenticated(true);
      setGateFlagsReady(true);
      setIsLoading(false);

      const premium = await useRevenueCatStore.getState().refreshPremium(userId);
      const { plan, expiresAt } = planFromCustomerInfo(
        useRevenueCatStore.getState().customerInfo,
      );
      const withSub: User = {
        ...baseUser,
        subscription: {
          active: premium || isDevForcePremium(),
          plan: premium ? plan : null,
          expiresAt: premium ? expiresAt : null,
        },
      };
      setUser(withSub);
      setHasActiveSubscription(withSub.subscription.active);

      await storage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          user: withSub,
          isAuthenticated: true,
          hasActiveSubscription: withSub.subscription.active,
        }),
      );

      if (clearLocalFinance) {
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
      } else {
        await syncLocalFinanceDataForAuthUser(userId);
      }

      invalidRefreshHandledRef.current = false;
      return withSub;
    },
    [],
  );

  const login = useCallback(async (email: string, password: string): Promise<{
    success: boolean;
    error?: string;
    emailNotConfirmed?: boolean;
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
        return { success: false, error: trNow('Údaje jsou příliš dlouhé', 'The details are too long') };
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
        if (isEmailNotConfirmedError(error)) {
          return {
            success: false,
            emailNotConfirmed: true,
            error: translateAuthError(error),
          };
        }
        return { success: false, error: translateAuthError(error) };
      }

      if (!data.user) {
        console.error('[auth] signInWithPassword: no data.user in response', { data });
        return { success: false, error: trNow('Neplatná odpověď serveru', 'Invalid server response') };
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

      // Řádky v DB až se session (upsert — např. po potvrzení odkazem v e-mailu).
      const { termsOk } = await ensureUserRowsAfterSession({
        userId,
        email: safeEmail,
        displayName: profileName,
      });

      let onboardingCompleted = false;
      let welcomeTourCompleted = false;
      let termsAccepted = termsOk;
      try {
        const flags = await readUserGateFlagsFromSupabase(userId);
        onboardingCompleted = flags.onboardingCompleted;
        welcomeTourCompleted = flags.welcomeTourCompleted;
        termsAccepted = flags.termsAccepted || termsOk;
      } catch (e) {
        console.error('[auth] readUserGateFlagsFromSupabase failed (login continues)', e);
      }

      const withSub = await establishAuthenticatedSession({
        userId,
        email: safeEmail,
        name: profileName,
        createdAt,
        onboardingCompleted,
        welcomeTourCompleted,
        termsAccepted,
      });

      console.log('[auth] login completed', {
        userId: withSub.id,
        onboardingCompleted,
        welcomeTourCompleted,
        isPremium: withSub.subscription.active,
      });
      void flushPendingOnboardingProfileSync();
      return { success: true, onboardingCompleted, welcomeTourCompleted };
    } catch (error) {
      console.error('[auth] login unexpected error', error);
      return { success: false, error: translateAuthError(error) };
    }
  }, [establishAuthenticatedSession]);

  const register = useCallback(async (
    email: string,
    password: string,
    name: string,
  ): Promise<{
    success: boolean;
    error?: string;
    needsEmailVerification?: boolean;
  }> => {
    try {
      const safeEmail = String(email ?? '').trim().toLowerCase();
      const safePassword = String(password ?? '').trim();
      const safeName = String(name ?? '').trim();

      if (!safeEmail || !safePassword || !safeName) {
        return { success: false, error: 'Vyplňte všechna pole' };
      }
      if (safeEmail.length > 100 || safePassword.length > 100 || safeName.length > 100) {
        return { success: false, error: trNow('Údaje jsou příliš dlouhé', 'The details are too long') };
      }

      const pwdErr = validateRegistrationPassword(safePassword);
      if (pwdErr) {
        return { success: false, error: pwdErr };
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
        console.error('[auth] register failed', error);
        return { success: false, error: translateAuthError(error) };
      }
      const authUser = data.user;
      if (!authUser) {
        return {
          success: false,
          error: useLanguageStore.getState().t('auth.errorGeneric' as 'auth.errorGeneric'),
        };
      }

      console.log('[auth] register signUp ok', {
        userId: authUser.id,
        hasSession: Boolean(data.session),
        emailConfirmedAt: authUser.email_confirmed_at,
      });

      // Confirm email zapnuté → žádná session → nepokračuj do appky, žádné DB řádky.
      if (!data.session) {
        return { success: true, needsEmailVerification: true };
      }

      const userId = authUser.id;
      const createdAt = authUser.created_at ?? new Date().toISOString();

      const { termsOk } = await ensureUserRowsAfterSession({
        userId,
        email: safeEmail,
        displayName: safeName,
        newRegistration: true,
      });

      await writeLocalWelcomeTourCompleted(userId, false);
      await establishAuthenticatedSession({
        userId,
        email: safeEmail,
        name: safeName,
        createdAt,
        onboardingCompleted: true,
        welcomeTourCompleted: false,
        termsAccepted: termsOk,
        clearLocalFinance: true,
      });

      return { success: true };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: translateAuthError(error) };
    }
  }, [establishAuthenticatedSession]);

  /**
   * Ověření 6místného kódu z e-mailu (po registraci / email_not_confirmed).
   * Po úspěchu vytvoří users + user_profiles a přihlásí.
   */
  const completeEmailVerification = useCallback(async (params: {
    email: string;
    token: string;
    name?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const safeEmail = String(params.email ?? '').trim().toLowerCase();
      const token = String(params.token ?? '').replace(/\s/g, '');
      if (!safeEmail || token.length < 6) {
        return { success: false, error: useLanguageStore.getState().t('auth.verifyCodeRequired') };
      }

      const { data, error } = await supabase.auth.verifyOtp({
        email: safeEmail,
        token,
        type: 'email',
      });
      if (error) {
        console.error('[auth] verifyOtp failed', error);
        return {
          success: false,
          error: trNow(
            'Kód není správný nebo už vypršel. Nech si poslat nový.',
            'The code is wrong or has expired. Request a new one.',
          ),
        };
      }
      const authUser = data.user;
      if (!authUser || !data.session) {
        return { success: false, error: useLanguageStore.getState().t('auth.verifyFailed') };
      }

      const userId = authUser.id;
      const createdAt = authUser.created_at ?? new Date().toISOString();
      const profileName =
        (params.name && String(params.name).trim()) ||
        (typeof authUser.user_metadata?.name === 'string' && authUser.user_metadata.name) ||
        (typeof authUser.user_metadata?.display_name === 'string' &&
          authUser.user_metadata.display_name) ||
        safeEmail.split('@')[0] ||
        'User';

      const { termsOk } = await ensureUserRowsAfterSession({
        userId,
        email: safeEmail,
        displayName: profileName,
        newRegistration: true,
      });

      await writeLocalWelcomeTourCompleted(userId, false);
      await establishAuthenticatedSession({
        userId,
        email: safeEmail,
        name: profileName,
        createdAt,
        onboardingCompleted: true,
        welcomeTourCompleted: false,
        termsAccepted: termsOk,
        clearLocalFinance: true,
      });

      return { success: true };
    } catch (e) {
      console.error('[auth] completeEmailVerification', e);
      return { success: false, error: translateAuthError(e) };
    }
  }, [establishAuthenticatedSession]);

  const logout = useCallback(async (): Promise<void> => {
    intentionalLogoutRef.current = true;
    try {
      await supabase.auth.signOut();
      try {
        await rcLogoutUser(); // Purchases.logOut() — odpojí RC app_user_id
      } catch (e) {
        console.warn('[auth] RevenueCat logOut', e);
      }
      useRevenueCatStore.getState().reset();
      const { useRegisterIntentStore } = await import('@/store/register-intent-store');
      useRegisterIntentStore.getState().clear();
      try {
        const { usePlanStore } = await import('@/store/plan-store');
        usePlanStore.getState().clear();
      } catch {
        /* ignore */
      }
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

    // Preferuj stav z RevenueCat (po nákupu/restore); plan parametr je fallback.
    await useRevenueCatStore.getState().refreshPremium(user.id);
    const rc = useRevenueCatStore.getState();
    const fromRc = planFromCustomerInfo(rc.customerInfo);
    const mappedPlan: 'monthly' | 'yearly' | null =
      fromRc.plan ?? (plan === 'yearly' ? 'yearly' : plan === 'monthly' ? 'monthly' : 'monthly');

    const updatedUser: User = {
      ...user,
      onboardingCompleted: user.onboardingCompleted ?? false,
      welcomeTourCompleted: user.welcomeTourCompleted ?? false,
      termsAccepted: user.termsAccepted ?? false,
      subscription: {
        active: rc.isPremium || isDevForcePremium(),
        plan: mappedPlan,
        expiresAt:
          fromRc.expiresAt ??
          new Date(
            Date.now() + (mappedPlan === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000,
          ).toISOString(),
      },
    };

    setUser(updatedUser);
    setHasActiveSubscription(updatedUser.subscription.active);

    await storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        user: updatedUser,
        isAuthenticated: true,
        hasActiveSubscription: updatedUser.subscription.active,
      }),
    );
  }, [user]);

  const loadAuthState = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setGateFlagsReady(false);
      const sessionOk = await recoverSession();
      if (!sessionOk) {
        if (invalidRefreshHandledRef.current) return;
        setUser(null);
        setIsAuthenticated(false);
        setHasActiveSubscription(false);
        setGateFlagsReady(true);
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
          termsAccepted: flags.termsAccepted,
          subscription: {
            active: false,
            plan: null,
            expiresAt: null,
          },
        };
        setUser(hydratedUser);
        setIsAuthenticated(true);
        setGateFlagsReady(true);

        const premium = await useRevenueCatStore.getState().refreshPremium(sessionUser.id);
        const { plan, expiresAt } = planFromCustomerInfo(
          useRevenueCatStore.getState().customerInfo,
        );
        const withSub: User = {
          ...hydratedUser,
          subscription: {
            active: premium || isDevForcePremium(),
            plan: premium ? plan : null,
            expiresAt: premium ? expiresAt : null,
          },
        };
        setUser(withSub);
        setHasActiveSubscription(withSub.subscription.active);
        await storage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user: withSub,
            isAuthenticated: true,
            hasActiveSubscription: withSub.subscription.active,
          }),
        );
        void flushPendingOnboardingProfileSync();
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setHasActiveSubscription(false);
        useRevenueCatStore.getState().reset();
        setGateFlagsReady(true);
      }
      setIsLoading(false);
    } catch (error) {
      if (isInvalidRefreshTokenError(error)) {
        await handleInvalidRefreshToken('loadAuthState');
        return;
      }
      console.error('Load auth state error:', error);
      setGateFlagsReady(true);
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
    // Lokálně hned — DB sync může selhat / být pomalý; gate nesmí znovu ukázat tour.
    await writeLocalWelcomeTourCompleted(user.id, true);
    const { error } = await supabase
      .from('users')
      .update({ welcome_tour_completed: true, onboarding_completed: true })
      .eq('id', user.id);
    if (error) {
      console.warn('[auth] welcome_tour_completed update', error.message);
    }
    const updatedUser: User = {
      ...user,
      welcomeTourCompleted: true,
      onboardingCompleted: true,
    };
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

  const acceptTermsConsent = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!user?.id) return { success: false, error: 'Nejsi přihlášen' };
    const res = await upsertTermsConsent(user.id);
    if (!res.ok) return { success: false, error: res.message };
    const updated: User = { ...user, termsAccepted: true };
    setUser(updated);
    await storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        user: updated,
        isAuthenticated: true,
        hasActiveSubscription,
      }),
    );
    return { success: true };
  }, [user, hasActiveSubscription]);

  return useMemo(() => ({
    user,
    isAuthenticated,
    isLoading,
    gateFlagsReady,
    hasActiveSubscription,
    login,
    register,
    completeEmailVerification,
    logout,
    deleteAccount,
    acceptTermsConsent,
    activateSubscription,
    loadAuthState,
    checkSubscriptionStatus,
    completeWelcomeTour,
    setUser: updateUser,
  }), [
    user,
    isAuthenticated,
    isLoading,
    gateFlagsReady,
    hasActiveSubscription,
    login,
    register,
    completeEmailVerification,
    logout,
    deleteAccount,
    acceptTermsConsent,
    activateSubscription,
    loadAuthState,
    checkSubscriptionStatus,
    completeWelcomeTour,
    updateUser,
  ]);
});