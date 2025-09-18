import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useFinanceStore } from '@/store/finance-store';
import { useBuddyStore } from '@/store/buddy-store';
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
  
  if (!isLoaded) {
    return null;
  }
  
  return (
    <Stack screenOptions={{ headerBackTitle: t('back') }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      <Stack.Screen 
        name="modal" 
        options={{ 
          presentation: "modal",
          title: "Modal"
        }} 
      />
      <Stack.Screen name="expense-detail" options={{ title: t('expenseBreakdown') }} />
      <Stack.Screen name="income-detail" options={{ title: t('incomeAnalysis') }} />
      <Stack.Screen name="financial-goals" options={{ title: t('financialGoals') }} />
      <Stack.Screen name="language-settings" options={{ title: t('language') }} />
      <Stack.Screen name="currency-settings" options={{ title: t('currency') }} />
      <Stack.Screen name="theme-settings" options={{ title: t('theme') }} />
      <Stack.Screen name="general-settings" options={{ title: t('general') }} />
      <Stack.Screen name="notifications-settings" options={{ title: t('notifications') }} />
      <Stack.Screen name="privacy-settings" options={{ title: t('privacy') }} />
      <Stack.Screen name="help-support" options={{ title: t('help') }} />
      <Stack.Screen name="monthly-report" options={{ title: t('monthlyReport') }} />
      <Stack.Screen name="backend-test" options={{ title: 'Backend Test' }} />
      <Stack.Screen name="t212-portfolio" options={{ title: 'T212 Portfolio' }} />
      <Stack.Screen name="asset/[symbol]" options={{ title: 'Asset Detail' }} />
      <Stack.Screen name="auth" options={{ title: 'Přihlášení', headerShown: false }} />
      <Stack.Screen name="subscription" options={{ title: 'Předplatné', headerShown: false }} />
      <Stack.Screen name="landing" options={{ title: 'MoneyBuddy', headerShown: false }} />
      <Stack.Screen name="account" options={{ title: 'Můj účet', headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const { loadSettings } = useSettingsStore();
  const { loadLanguage, isLoaded } = useLanguageStore();
  const { loadData: loadFinanceData } = useFinanceStore();
  const { loadData: loadBuddyData } = useBuddyStore();
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
  }, [loadSettings, loadLanguage, loadFinanceData, loadBuddyData]);

  if (!appReady || !isLoaded) {
    console.log('App not ready - appReady:', appReady, 'isLoaded:', isLoaded);
    return null;
  }
  
  console.log('App is ready, rendering RootLayoutNav');

  return (
    <ErrorBoundary>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={styles.container}>
            <RootLayoutNav />
          </GestureHandlerRootView>
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