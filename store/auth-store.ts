import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';

export interface User {
  id: string;
  email: string;
  name: string;
  registrationDate: Date;
  subscription: {
    active: boolean;
    plan: 'monthly' | 'quarterly' | 'yearly' | null;
    expiresAt: Date | null;
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

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasActiveSubscription, setHasActiveSubscription] = useState<boolean>(false);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    try {
      if (!email?.trim() || !password?.trim()) return false;
      if (email.length > 100 || password.length > 100) return false;
      
      // Simulate API call
      await new Promise(resolve => {
        if (resolve) setTimeout(resolve, 1000);
      });
      
      // Demo credentials
      if (email === 'test@test.com' && password === 'test123') {
        const newUser: User = {
          id: '1',
          email: email.trim(),
          name: 'Demo User',
          registrationDate: new Date(),
          subscription: {
            active: true,
            plan: 'monthly',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        };
        
        setUser(newUser);
        setIsAuthenticated(true);
        setHasActiveSubscription(true);
        setIsLoading(false);
        
        await storage.setItem(STORAGE_KEY, JSON.stringify({
          user: newUser,
          isAuthenticated: true,
          hasActiveSubscription: true,
        }));
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  }, []);

  const register = useCallback(async (email: string, password: string, name: string): Promise<boolean> => {
    try {
      if (!email?.trim() || !password?.trim() || !name?.trim()) return false;
      if (email.length > 100 || password.length > 100 || name.length > 100) return false;
      
      // Simulate API call
      await new Promise(resolve => {
        if (resolve) setTimeout(resolve, 1000);
      });
      
      const newUser: User = {
        id: Date.now().toString(),
        email: email.trim(),
        name: name.trim(),
        registrationDate: new Date(),
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
      
      await storage.setItem(STORAGE_KEY, JSON.stringify({
        user: newUser,
        isAuthenticated: true,
        hasActiveSubscription: false,
      }));
      
      return true;
    } catch (error) {
      console.error('Registration error:', error);
      return false;
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await storage.removeItem(STORAGE_KEY);
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
        expiresAt: new Date(Date.now() + (plan === 'yearly' ? 365 : plan === 'quarterly' ? 90 : 30) * 24 * 60 * 60 * 1000),
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
            await storage.setItem(STORAGE_KEY, JSON.stringify({
              user: storedUser,
              isAuthenticated: storedAuth,
              hasActiveSubscription: false,
            }));
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
  ]);
});