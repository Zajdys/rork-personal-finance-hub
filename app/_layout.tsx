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
import { DailyRewardsProvider } from '@/store/daily-rewards-store';
import { DailyRewardModal } from '@/components/DailyRewardModal';
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

function RootLayoutNav() {
  const { t, isLoaded } = useLanguageStore();
  const { isAuthenticated, hasActiveSubscription, isLoading } = useAuth();
  const [onboardingCompleted, setOnboardingCompleted] = React.useState<boolean | null>(null);
  
  React.useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const completed = await AsyncStorage.getItem('onboarding_completed');
        setOnboardingCompleted(completed === 'true');
      } catch (error) {
        console.error('Failed to check onboarding status:', error);
        setOnboardingCompleted(false);
      }
    };
    
    if (isAuthenticated && hasActiveSubscription) {
      checkOnboarding();
    }
  }, [isAuthenticated, hasActiveSubscription]);
  
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
  
  if (isAuthenticated && !hasActiveSubscription) {
    return (
      <Stack initialRouteName="subscription" screenOptions={{ headerBackTitle: t('back'), headerShown: false }}>
        <Stack.Screen name="subscription" options={{ title: 'Předplatné' }} />
        <Stack.Screen name="account" options={{ title: 'Můj účet' }} />
      </Stack>
    );
  }
  
  // Show onboarding if user has subscription but hasn't completed onboarding
  if (isAuthenticated && hasActiveSubscription && onboardingCompleted === false) {
    return (
      <Stack initialRouteName="onboarding" screenOptions={{ headerBackTitle: t('back'), headerShown: false }}>
        <Stack.Screen name="onboarding" options={{ title: 'Nastavení profilu' }} />
      </Stack>
    );
  }
  
  // Wait for onboarding check to complete
  if (onboardingCompleted === null) {
    return null;
  }
  
  // Full app access for authenticated users with active subscription
  return (
    <>
      <DailyRewardModal />
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
      <Stack.Screen name="monthly-report" options={{ title: t('monthlyReport'), headerShown: true }} />
      <Stack.Screen name="backend-test" options={{ title: 'Backend Test', headerShown: true }} />
      <Stack.Screen name="t212-portfolio" options={{ title: 'T212 Portfolio', headerShown: true }} />
      <Stack.Screen name="asset/[symbol]" options={{ title: 'Asset Detail', headerShown: true }} />
      <Stack.Screen name="portfolio-detail" options={{ title: 'Portfolio Detail', headerShown: false }} />
      <Stack.Screen name="account" options={{ title: 'Můj účet', headerShown: true }} />
      <Stack.Screen name="landing-preview" options={{ title: 'Landing Preview', headerShown: true }} />
      <Stack.Screen name="onboarding" options={{ title: 'Nastavení profilu', headerShown: true }} />
      <Stack.Screen name="friends" options={{ title: 'Přátelé', headerShown: true }} />
      <Stack.Screen name="friend-comparison" options={{ title: 'Porovnání', headerShown: true }} />
      <Stack.Screen name="life-event" options={{ title: 'Life-Event Mode', headerShown: false }} />
      <Stack.Screen name="household" options={{ title: 'Domácnost', headerShown: false }} />
      <Stack.Screen name="category-detail" options={{ title: 'Category Detail', headerShown: true }} />
      <Stack.Screen name="badges" options={{ title: t('badges'), headerShown: true }} />
      <Stack.Screen name="quests" options={{ title: t('quests'), headerShown: true }} />
      <Stack.Screen name="hall-of-fame" options={{ title: 'Hall of Fame', headerShown: true }} />
      <Stack.Screen name="gaming-stats" options={{ title: 'Gaming Stats', headerShown: true }} />
      <Stack.Screen name="support-chat" options={{ title: 'Support Chat', headerShown: true }} />
      <Stack.Screen name="bank-connect" options={{ title: 'Bank Connect', headerShown: true }} />
      <Stack.Screen name="bank-accounts" options={{ title: 'Bank Accounts', headerShown: true }} />
      <Stack.Screen name="daily-rewards-detail" options={{ title: 'Daily Rewards', headerShown: true }} />
      <Stack.Screen name="household-policies" options={{ title: 'Household Policies', headerShown: true }} />
      <Stack.Screen name="household-splits" options={{ title: 'Household Splits', headerShown: true }} />
      <Stack.Screen name="household-budgets" options={{ title: 'Household Budgets', headerShown: true }} />
      <Stack.Screen name="edit-bank-transaction" options={{ title: 'Edit Transaction', headerShown: true }} />
      <Stack.Screen name="loans" options={{ title: 'Loans', headerShown: true }} />
      <Stack.Screen name="loan-detail" options={{ title: 'Loan Detail', headerShown: true }} />
      <Stack.Screen name="add-loan" options={{ title: 'Add Loan', headerShown: true }} />
      <Stack.Screen name="edit-loan" options={{ title: 'Edit Loan', headerShown: true }} />
      <Stack.Screen name="loan-finder" options={{ title: 'Loan Finder', headerShown: true }} />
      <Stack.Screen name="leaderboard" options={{ title: 'Leaderboard', headerShown: true }} />
      <Stack.Screen name="register" options={{ title: 'Register', headerShown: true }} />
      <Stack.Screen name="chat" options={{ title: 'Chat', headerShown: true }} />
      
      {/* These screens should not be accessible when user has active subscription */}
      <Stack.Screen name="auth" options={{ title: 'Přihlášení' }} />
      <Stack.Screen name="subscription" options={{ title: 'Předplatné' }} />
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
              <DailyRewardsProvider>
                <LifeEventProvider>
                  <HouseholdProvider>
                    <GestureHandlerRootView style={styles.container}>
                      <RootLayoutNav />
                    </GestureHandlerRootView>
                  </HouseholdProvider>
                </LifeEventProvider>
              </DailyRewardsProvider>
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