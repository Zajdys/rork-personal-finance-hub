import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  registrationDate: string;
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
const TOKEN_KEY = 'authToken';

function getApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return 'http://localhost:3000';
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasActiveSubscription, setHasActiveSubscription] = useState<boolean>(false);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      const safeEmail = String(email ?? '').trim().toLowerCase();
      const safePassword = String(password ?? '').trim();

      if (!safeEmail || !safePassword) return false;
      if (safeEmail.length > 100 || safePassword.length > 100) return false;

      const url = `${getApiBaseUrl()}/api/login`;
      console.log('[auth] login request', { url, email: safeEmail });

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: safeEmail, password: safePassword }),
      });

      const data = (await resp.json().catch(() => null)) as any;
      console.log('[auth] login response', { status: resp.status, data });

      if (!resp.ok) {
        return false;
      }

      const token = typeof data?.token === 'string' ? data.token : '';
      const apiUser = data?.user as any;
      const userId = String(apiUser?.id ?? '');
      if (!userId) {
        console.error('[auth] login missing user id');
        return false;
      }

      const createdAt = typeof apiUser?.created_at === 'string' ? apiUser.created_at : new Date().toISOString();
      const derivedName = safeEmail.split('@')[0] ?? 'User';

      const newUser: User = {
        id: userId,
        email: safeEmail,
        name: derivedName,
        registrationDate: createdAt,
        subscription: {
          active: false,
          plan: null,
          expiresAt: null,
        },
      };

      setUser(newUser);
      setIsAuthenticated(true);
      setHasActiveSubscription(false);
      setIsLoading(false);

      await Promise.all([
        storage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user: newUser,
            isAuthenticated: true,
            hasActiveSubscription: false,
          })
        ),
        token ? storage.setItem(TOKEN_KEY, token) : storage.removeItem(TOKEN_KEY),
      ]);

      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
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

      const url = `${getApiBaseUrl()}/api/register`;
      console.log('[auth] register request', { url, email: safeEmail, name: safeName });

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: safeEmail, password: safePassword, name: safeName }),
      });

      const data = (await resp.json().catch(() => null)) as any;
      console.log('[auth] register response', { status: resp.status, data });

      if (!resp.ok) {
        const errorMsg = data?.error || `Chyba serveru: ${resp.status}`;
        console.error('[auth] register failed', { status: resp.status, error: errorMsg });
        return { success: false, error: errorMsg };
      }

      const newUser: User = {
        id: safeEmail,
        email: safeEmail,
        name: safeName,
        registrationDate: new Date().toISOString(),
        subscription: {
          active: false,
          plan: null,
          expiresAt: null,
        },
      };

      setUser(newUser);
      setIsAuthenticated(true);
      setHasActiveSubscription(false);
      setIsLoading(false);

      await Promise.all([
        storage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user: newUser,
            isAuthenticated: true,
            hasActiveSubscription: false,
          })
        ),
        storage.removeItem(TOKEN_KEY),
      ]);

      return { success: true };
    } catch (error) {
      console.error('Registration error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Nelze spojit se serverem';
      return { success: false, error: errorMsg };
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await Promise.all([storage.removeItem(STORAGE_KEY), storage.removeItem(TOKEN_KEY)]);
      setUser(null);
      setIsAuthenticated(false);
      setHasActiveSubscription(false);
      setIsLoading(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, []);

  const activateSubscription = useCallback(async (plan: 'monthly' | 'quarterly' | 'yearly'): Promise<void> => {
    if (!user) return;

    const updatedUser: User = {
      ...user,
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
      const stored = await storage.getItem(STORAGE_KEY);
      
      if (stored) {
        const { user: storedUser, isAuthenticated: storedAuth, hasActiveSubscription: storedSub } = JSON.parse(stored);
        
        // Check if subscription is still valid
        let validSubscription = storedSub;
        if (storedUser?.subscription?.expiresAt) {
          const expiresAt = new Date(storedUser.subscription.expiresAt);
          validSubscription = expiresAt > new Date();

          if (!validSubscription && storedUser.subscription.active) {
            // Subscription expired, update user
            storedUser.subscription.active = false;
            storedUser.subscription.expiresAt = null;
            await storage.setItem(
              STORAGE_KEY,
              JSON.stringify({
                user: storedUser,
                isAuthenticated: storedAuth,
                hasActiveSubscription: false,
              })
            );
          }
        }

        setUser(storedUser);
        setIsAuthenticated(storedAuth);
        setHasActiveSubscription(validSubscription);
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Load auth state error:', error);
      setIsLoading(false);
    }
  }, []);

  const checkSubscriptionStatus = useCallback((): boolean => {
    if (!user?.subscription?.active) return false;

    if (user.subscription.expiresAt) {
      return new Date(user.subscription.expiresAt) > new Date();
    }

    return false;
  }, [user]);

  useEffect(() => {
    loadAuthState();
  }, [loadAuthState]);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    storage.setItem(STORAGE_KEY, JSON.stringify({
      user: updatedUser,
      isAuthenticated: true,
      hasActiveSubscription,
    }));
  }, [hasActiveSubscription]);

  return useMemo(() => ({
    user,
    isAuthenticated,
    isLoading,
    hasActiveSubscription,
    login,
    register,
    logout,
    activateSubscription,
    loadAuthState,
    checkSubscriptionStatus,
    setUser: updateUser,
  }), [
    user,
    isAuthenticated,
    isLoading,
    hasActiveSubscription,
    login,
    register,
    logout,
    activateSubscription,
    loadAuthState,
    checkSubscriptionStatus,
    updateUser,
  ]);
});