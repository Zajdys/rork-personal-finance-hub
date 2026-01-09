import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Stack, usePathname, useRouter, useRootNavigationState } from "expo-router";
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

function InitialRouteGate({ appReady, languageLoaded }: { appReady: boolean; languageLoaded: boolean }) {
  const { isLoaded } = useLanguageStore();
  const { user, isAuthenticated, hasActiveSubscription, isLoading } = useAuth();
  const rootNavState = useRootNavigationState();
  const router = useRouter();
  const pathname = usePathname();

  const [targetPath, setTargetPath] = React.useState<string>('/loading');
  const [decisionReady, setDecisionReady] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!appReady || !languageLoaded || !isLoaded || isLoading) {
      setDecisionReady(false);
      setTargetPath('/loading');
      return;
    }

    const decide = async () => {
      try {
        if (!isAuthenticated) {
          setTargetPath('/landing');
          setDecisionReady(true);
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 50));

        const completedKey = getOnboardingCompletedKey(user?.id ?? user?.email);
        const pendingKey = getOnboardingPendingKey(user?.id ?? user?.email);

        const [completedPerUser, legacyCompleted, pendingPerUser] = await Promise.all([
          AsyncStorage.getItem(completedKey),
          AsyncStorage.getItem('onboarding_completed'),
          AsyncStorage.getItem(pendingKey),
        ]);

        const resolvedCompleted = completedPerUser === 'true' || legacyCompleted === 'true';
        const resolvedPending = pendingPerUser === 'true';

        console.log('[root] onboarding check', {
          userId: user?.id,
          userEmail: user?.email,
          completedKey,
          pendingKey,
          completedPerUser,
          legacyCompleted,
          pendingPerUser,
          resolvedCompleted,
          resolvedPending,
          finalOnboardingCompleted: resolvedCompleted && !resolvedPending,
        });

        if (legacyCompleted === 'true' && completedPerUser !== 'true') {
          await AsyncStorage.setItem(completedKey, 'true');
        }

        const isOnboardingDone = resolvedCompleted && !resolvedPending;

        if (!isOnboardingDone) {
          setTargetPath('/onboarding');
        } else if (!hasActiveSubscription) {
          setTargetPath('/choose-subscription');
        } else {
          setTargetPath('/');
        }

        setDecisionReady(true);
      } catch (error) {
        console.error('[root] failed to decide initial route:', error);
        setTargetPath('/onboarding');
        setDecisionReady(true);
      }
    };

    decide();
  }, [appReady, languageLoaded, isLoaded, isLoading, isAuthenticated, hasActiveSubscription, user?.id, user?.email]);

  React.useEffect(() => {
    if (!rootNavState?.key) return;
    if (!decisionReady) return;

    const allowedToRedirect = pathname === '/' || pathname === '/loading' || pathname === '/landing' || pathname === '/onboarding' || pathname === '/choose-subscription';
    if (!allowedToRedirect) return;

    if (pathname !== targetPath) {
      console.log('[root] redirecting', { from: pathname, to: targetPath });
      router.replace(targetPath as any);
    }
  }, [rootNavState?.key, decisionReady, pathname, targetPath, router]);

  if (!rootNavState?.key) {
    return null;
  }

  if (!decisionReady && pathname !== '/loading') {
    return <Redirect href="/loading" />;
  }

  return null;
}

function RootLayoutNav() {
  const { t } = useLanguageStore();

  return (
    <Stack screenOptions={{ headerBackTitle: t('back'), headerShown: true }}>
      <Stack.Screen name="loading" options={{ headerShown: false }} />
      <Stack.Screen name="landing" options={{ title: 'MoneyBuddy', headerShown: false }} />
      <Stack.Screen name="auth" options={{ title: 'Přihlášení', headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ title: 'Nastavení profilu', headerShown: false }} />
      <Stack.Screen name="choose-subscription" options={{ title: 'Vyberte předplatné', headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

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
      <Stack.Screen name="friends" options={{ title: 'Přátelé', headerShown: true }} />
      <Stack.Screen name="friend-comparison" options={{ title: 'Porovnání', headerShown: true }} />
      <Stack.Screen name="life-event" options={{ title: 'Life-Event Mode', headerShown: false }} />
      <Stack.Screen name="household" options={{ title: 'Domácnost', headerShown: false }} />
      <Stack.Screen name="household-policies" options={{ title: 'Pravidla sdílení', headerShown: true }} />
      <Stack.Screen name="household-splits" options={{ title: 'Rozdělení výdajů', headerShown: true }} />
      <Stack.Screen name="household-budgets" options={{ title: 'Rozpočty kategorií', headerShown: true }} />
      <Stack.Screen name="subscription" options={{ title: 'Úprava předplatného' }} />
      <Stack.Screen name="edit-bank-transaction" options={{ title: 'Upravit transakci', headerShown: true }} />
      <Stack.Screen name="add-subscription" options={{ title: 'Přidat předplatné', headerShown: true }} />
      <Stack.Screen name="household-overview" options={{ title: 'Přehled domácnosti', headerShown: true }} />
      <Stack.Screen name="redeem-code" options={{ title: 'Uplatnit kód', headerShown: true }} />
      <Stack.Screen name="register" options={{ title: 'Registrace', headerShown: false }} />
      <Stack.Screen name="portfolio-detail" options={{ title: 'Detail portfolia', headerShown: true }} />
      <Stack.Screen name="chat" options={{ title: 'Chat', headerShown: true }} />
      <Stack.Screen name="loan-detail" options={{ title: 'Detail půjčky', headerShown: true }} />
      <Stack.Screen name="add-loan" options={{ title: 'Přidat půjčku', headerShown: true }} />
      <Stack.Screen name="loans" options={{ title: 'Půjčky', headerShown: true }} />
      <Stack.Screen name="edit-loan" options={{ title: 'Upravit půjčku', headerShown: true }} />
      <Stack.Screen name="loan-finder" options={{ title: 'Vyhledávač půjček', headerShown: true }} />
      <Stack.Screen name="badges" options={{ title: 'Odznaky', headerShown: true }} />
      <Stack.Screen name="quests" options={{ title: 'Úkoly', headerShown: true }} />
      <Stack.Screen name="hall-of-fame" options={{ title: 'Síň slávy', headerShown: true }} />
      <Stack.Screen name="gaming-stats" options={{ title: 'Herní statistiky', headerShown: true }} />
      <Stack.Screen name="support-chat" options={{ title: 'Podpora', headerShown: true }} />
      <Stack.Screen name="category-detail" options={{ title: 'Detail kategorie', headerShown: true }} />
      <Stack.Screen name="bank-connect" options={{ title: 'Připojit banku', headerShown: true }} />
      <Stack.Screen name="bank-accounts" options={{ title: 'Bankovní účty', headerShown: true }} />
      <Stack.Screen name="leaderboard" options={{ title: 'Žebříček', headerShown: true }} />
      <Stack.Screen name="+not-found" />
    </Stack>
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

  console.log('RootLayout render - appReady:', appReady, 'isLoaded:', isLoaded);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <AuthProvider>
            <FriendsProvider>
              <LifeEventProvider>
                <HouseholdProvider>
                  <GestureHandlerRootView style={styles.container}>
                    <InitialRouteGate appReady={appReady} languageLoaded={isLoaded} />
                    <RootLayoutNav />
                  </GestureHandlerRootView>
                </HouseholdProvider>
              </LifeEventProvider>
            </FriendsProvider>
          </AuthProvider>
        </trpc.Provider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
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