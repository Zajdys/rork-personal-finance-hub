import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface User {
  id: string;
  email: string;
  name: string | null;
  registrationDate: Date;
  subscription: {
    active: boolean;
    plan: 'monthly' | 'quarterly' | 'yearly' | null;
    expiresAt: Date | null;
  };
}

const STORAGE_KEY = 'auth_state';

// ================= CONTEXT =================
export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUserState] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);

  const registerMutation = trpc.auth.register.useMutation();

  // ================= LOGIN (zatím DEMO nebo tRPC později) =================
  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    return false;
  }, []);

  // ================= REGISTER – tRPC =================
  const register = useCallback(
    async (email: string, password: string, name: string): Promise<boolean> => {
      try {
        const result = await registerMutation.mutateAsync({
          email,
          password,
          name,
        });

        const newUser: User = {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name ?? null,
          registrationDate: new Date(),
          subscription: {
            active: false,
            plan: null,
            expiresAt: null,
          },
        };

        setUserState(newUser);
        setIsAuthenticated(true);
        setHasActiveSubscription(false);

        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            user: newUser,
            token: result.token,
            isAuthenticated: true,
            hasActiveSubscription: false,
          })
        );

        return true;
      } catch (e) {
        console.error('REGISTER FAILED', e);
        return false;
      }
    },
    [registerMutation]
  );

  // ================= SET USER =================
  const setUser = useCallback((newUser: User | null) => {
    setUserState(newUser);
  }, []);

  // ================= LOGOUT =================
  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUserState(null);
    setIsAuthenticated(false);
    setHasActiveSubscription(false);
  }, []);

  // ================= LOAD =================
  const loadAuthState = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setUserState(parsed.user ?? null);
        setIsAuthenticated(!!parsed.isAuthenticated);
        setHasActiveSubscription(!!parsed.hasActiveSubscription);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuthState();
  }, [loadAuthState]);

  return useMemo(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      hasActiveSubscription,
      login,
      register,
      logout,
      setUser,
    }),
    [user, isAuthenticated, isLoading, hasActiveSubscription, login, register, logout, setUser]
  );
});
