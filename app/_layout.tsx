import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useFinanceStore } from '@/store/finance-store';
import { useBuddyStore } from '@/store/buddy-store';
import { useBankStore } from '@/store/bank-store';
import { AuthProvider, useAuth } from '@/store/auth-store';
import { FriendsProvider } from '@/store/friends-store';
import { LifeEventProvider } from '@/store/life-event-store';
import { HouseholdProvider } from '@/store/household-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trpc, trpcClient } from '@/lib/trpc';
import { StyleSheet, Text, View } from 'react-native';


SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Error Boundary caught an error:', error, errorInfo);
    
    // If it's a JSON parse error, clear AsyncStorage
    if (error.message.includes('JSON') || error.message.includes('Unexpected character')) {
      console.log('JSON parse error detected in Error Boundary, clearing AsyncStorage...');
      AsyncStorage.clear().then(() => {
        console.log('AsyncStorage cleared due to JSON parse error');
        // Force reload the app
        this.setState({ hasError: false, error: undefined });
      }).catch((clearError) => {
        console.error('Failed to clear AsyncStorage:', clearError);
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Něco se pokazilo</Text>
          <Text style={styles.errorMessage}>Aplikace se restartuje...</Text>
          <Text style={styles.errorDetails}>
            {this.state.error?.message || 'Neznámá chyba'}
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

function getOnboardingCompletedKey(userIdOrEmail: string | undefined | null): string {
  const raw = String(userIdOrEmail ?? '').trim().toLowerCase();
  if (!raw) return 'onboarding_completed';
  return `onboarding_completed:${raw}`;
}

function getOnboardingPendingKey(userIdOrEmail: string | undefined | null): string {
  const raw = String(userIdOrEmail ?? '').trim().toLowerCase();
  if (!raw) return 'onboarding_pending';
  return `onboarding_pending:${raw}`;
}

function uniqNonEmpty(items: (string | null | undefined)[]): string[] {
  return Array.from(new Set(items.map((v) => (v ? String(v) : '')).filter((v) => v.length > 0)));
}

function RootLayoutNav() {
  const { t, isLoaded } = useLanguageStore();
  const { user, isAuthenticated, hasActiveSubscription, isLoading } = useAuth();
  const [onboardingCompleted, setOnboardingCompleted] = React.useState<boolean | null>(null);
  
  React.useEffect(() => {
    const checkOnboarding = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 100));

        const identifierId = String(user?.id ?? '').trim().toLowerCase();
        const identifierEmail = String(user?.email ?? '').trim().toLowerCase();
        const identifiers = uniqNonEmpty([identifierId, identifierEmail]);

        if (identifiers.length === 0) {
          console.log('[root] onboarding check skipped (missing user identifier)');
          setOnboardingCompleted(null);
          return;
        }

        const completedKeys = uniqNonEmpty(identifiers.map((id) => getOnboardingCompletedKey(id)));
        const pendingKeys = uniqNonEmpty(identifiers.map((id) => getOnboardingPendingKey(id)));

        const readKeys = async (keys: string[]) => {
          const values = await Promise.all(keys.map((k) => AsyncStorage.getItem(k)));
          return values.some((v) => v === 'true');
        };

        const [completedAny, legacyCompleted, pendingAny] = await Promise.all([
          readKeys(completedKeys),
          AsyncStorage.getItem('onboarding_completed'),
          readKeys(pendingKeys),
        ]);

        const resolvedCompleted = completedAny || legacyCompleted === 'true';
        const resolvedPending = pendingAny;

        console.log('[root] onboarding check', {
          userId: user?.id,
          userEmail: user?.email,
          completedKeys,
          pendingKeys,
          legacyCompleted,
          resolvedCompleted,
          resolvedPending,
          finalOnboardingCompleted: resolvedCompleted && !resolvedPending,
        });

        if (legacyCompleted === 'true') {
          await Promise.all(completedKeys.map((k) => AsyncStorage.setItem(k, 'true')));
        }

        // If onboarding is pending for this user, always show it (even if subscription gating would run)
        setOnboardingCompleted(resolvedCompleted && !resolvedPending);
      } catch (error) {
        console.error('Failed to check onboarding status:', error);
        setOnboardingCompleted(false);
      }
    };
    
    if (isAuthenticated) {
      if (!user?.id && !user?.email) {
        setOnboardingCompleted(null);
        return;
      }
      checkOnboarding();
    } else {
      setOnboardingCompleted(null);
    }
  }, [isAuthenticated, hasActiveSubscription, user?.id, user?.email]);
  
  if (!isLoaded || isLoading) {
    return null;
  }
  
  // Gated access logic
  if (!isAuthenticated) {
    return (
      <Stack initialRouteName="landing" screenOptions={{ headerBackTitle: t('back'), headerShown: false }}>
        <Stack.Screen name="landing" options={{ title: 'MoneyBuddy' }} />
        <Stack.Screen name="auth" options={{ title: 'Přihlášení' }} />
      </Stack>
    );
  }
  
  // Wait for onboarding check to complete BEFORE any gating.
  // Otherwise new users can be routed to subscription/app briefly and it looks like onboarding is skipped.
  if (isAuthenticated && onboardingCompleted === null) {
    return null;
  }

  // 2) Onboarding otázky (vždy se zobrazí po registraci / dokud nejsou dokončené)
  if (isAuthenticated && onboardingCompleted === false) {
    return (
      <Stack initialRouteName="onboarding" screenOptions={{ headerBackTitle: t('back'), headerShown: false }}>
        <Stack.Screen name="onboarding" options={{ title: 'Nastavení profilu' }} />
      </Stack>
    );
  }

  // Po dokončení onboardingu jde uživatel rovnou do aplikace (bez předplatného)
  return (
    <>
      <Stack screenOptions={{ headerBackTitle: t('back'), headerShown: true }}>
      <Stack.Screen name="(tabs)" />

      <Stack.Screen 
        name="modal" 
        options={{ 
          presentation: "modal",
          title: "Modal"
        }} 
      />
      <Stack.Screen name="expense-detail" options={{ title: t('expenseBreakdown'), headerShown: true }} />
      <Stack.Screen name="income-detail" options={{ title: t('incomeAnalysis'), headerShown: true }} />
      <Stack.Screen name="financial-goals" options={{ title: t('financialGoals'), headerShown: true }} />
      <Stack.Screen name="language-settings" options={{ title: t('language'), headerShown: true }} />
      <Stack.Screen name="currency-settings" options={{ title: t('currency'), headerShown: true }} />
      <Stack.Screen name="theme-settings" options={{ title: t('theme'), headerShown: true }} />
      <Stack.Screen name="general-settings" options={{ title: t('general'), headerShown: true }} />
      <Stack.Screen name="notifications-settings" options={{ title: t('notifications'), headerShown: true }} />
      <Stack.Screen name="privacy-settings" options={{ title: t('privacy'), headerShown: true }} />
      <Stack.Screen name="help-support" options={{ title: t('help'), headerShown: true }} />
      <Stack.Screen name="monthly-report" options={{ title: t('monthlyReport'), headerShown: false }} />
      <Stack.Screen name="backend-test" options={{ title: 'Backend Test', headerShown: true }} />
      <Stack.Screen name="t212-portfolio" options={{ title: 'T212 Portfolio', headerShown: true }} />
      <Stack.Screen name="asset/[symbol]" options={{ title: 'Asset Detail', headerShown: true }} />
      <Stack.Screen name="account" options={{ title: 'Můj účet', headerShown: true }} />
      <Stack.Screen name="landing-preview" options={{ title: 'Landing Preview', headerShown: true }} />
      <Stack.Screen name="onboarding" options={{ title: 'Nastavení profilu', headerShown: true }} />
      <Stack.Screen name="friends" options={{ title: 'Přátelé', headerShown: true }} />
      <Stack.Screen name="friend-comparison" options={{ title: 'Porovnání', headerShown: true }} />
      <Stack.Screen name="life-event" options={{ title: 'Life-Event Mode', headerShown: false }} />
      <Stack.Screen name="household" options={{ title: 'Domácnost', headerShown: false }} />
      <Stack.Screen name="household-policies" options={{ title: 'Pravidla sdílení', headerShown: true }} />
      <Stack.Screen name="household-splits" options={{ title: 'Rozdělení výdajů', headerShown: true }} />
      <Stack.Screen name="household-budgets" options={{ title: 'Rozpočty kategorií', headerShown: true }} />
      
      <Stack.Screen name="auth" options={{ title: 'Přihlášení' }} />
      <Stack.Screen name="landing" options={{ title: 'MoneyBuddy' }} />
    </Stack>
    </>
  );
}

export default function RootLayout() {
  const { loadSettings } = useSettingsStore();
  const { loadLanguage, isLoaded } = useLanguageStore();
  const { loadData: loadFinanceData } = useFinanceStore();
  const { loadData: loadBuddyData } = useBuddyStore();
  const { loadData: loadBankData } = useBankStore();
  const [appReady, setAppReady] = useState<boolean>(false);
  
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const initializeApp = async () => {
      try {
        console.log('Initializing app...');
        await Promise.all([
          loadSettings(),
          loadLanguage(),
          loadFinanceData(),
          loadBuddyData(),
          loadBankData(),
        ]);
        console.log('App initialized successfully');
        setAppReady(true);
        await SplashScreen.hideAsync();
      } catch (error) {
        console.error('Failed to initialize app:', error);
        
        // If there's a JSON parse error, clear all AsyncStorage data
        if (error instanceof Error && error.message.includes('JSON')) {
          console.log('JSON parse error detected, clearing AsyncStorage...');
          try {
            await AsyncStorage.clear();
            console.log('AsyncStorage cleared successfully');
            // Retry initialization after clearing
            await Promise.all([
              loadSettings(),
              loadLanguage(),
              loadFinanceData(),
              loadBuddyData(),
              loadBankData(),
            ]);
          } catch (clearError) {
            console.error('Failed to clear AsyncStorage or reinitialize:', clearError);
          }
        }
        
        setAppReady(true);
        await SplashScreen.hideAsync();
      }
      
      // Fallback timeout to ensure app shows even if something fails
      timeoutId = setTimeout(() => {
        console.log('Fallback timeout - forcing app ready');
        setAppReady(true);
      }, 3000);
    };
    
    initializeApp();
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [loadSettings, loadLanguage, loadFinanceData, loadBuddyData, loadBankData]);

  if (!appReady || !isLoaded) {
    console.log('App not ready - appReady:', appReady, 'isLoaded:', isLoaded);
    return null;
  }
  
  console.log('App is ready, rendering RootLayoutNav');

  return (
    <ErrorBoundary>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <FriendsProvider>
              <LifeEventProvider>
                <HouseholdProvider>
                  <GestureHandlerRootView style={styles.container}>
                    <RootLayoutNav />
                  </GestureHandlerRootView>
                </HouseholdProvider>
              </LifeEventProvider>
            </FriendsProvider>
          </AuthProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorMessage: {
    textAlign: 'center',
    marginBottom: 20,
  },
  errorDetails: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});