import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useFinanceStore } from '@/store/finance-store';
import { useBuddyStore } from '@/store/buddy-store';
import { trpc, trpcClient } from '@/lib/trpc';
import { useAuthStore } from '@/store/auth-store';
import { StyleSheet } from 'react-native';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { t, isLoaded } = useLanguageStore();
  const { token, isLoading: authLoading } = useAuthStore();
  
  console.log('RootLayoutNav - isLoaded:', isLoaded, 'authLoading:', authLoading, 'token:', !!token);
  
  if (!isLoaded || authLoading) {
    console.log('Still loading, showing null');
    return null;
  }

  if (!token) {
    console.log('No token, redirecting to auth landing');
    return <Redirect href="/auth/index" />;
  }
  
  console.log('User has token, showing main app');
  
  return (
    <Stack screenOptions={{ headerBackTitle: t('back') }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth/index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="subscription" options={{ headerShown: false }} />
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
    </Stack>
  );
}

export default function RootLayout() {
  const { loadSettings } = useSettingsStore();
  const { loadLanguage, isLoaded } = useLanguageStore();
  const { loadData: loadFinanceData } = useFinanceStore();
  const { loadData: loadBuddyData } = useBuddyStore();
  const { load: loadAuth } = useAuthStore();
  const [appReady, setAppReady] = useState<boolean>(false);
  
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const initializeApp = async () => {
      try {
        console.log('Initializing app...');
        await Promise.all([
          loadSettings(),
          loadLanguage(),
          loadFinanceData(),
          loadBuddyData(),
          loadAuth(),
        ]);
        console.log('App initialized successfully');
        setAppReady(true);
        await SplashScreen.hideAsync();
      } catch (error) {
        console.error('Failed to initialize app:', error);
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
  }, [loadSettings, loadLanguage, loadFinanceData, loadBuddyData, loadAuth]);

  if (!appReady || !isLoaded) {
    console.log('App not ready - appReady:', appReady, 'isLoaded:', isLoaded);
    return null;
  }
  
  console.log('App is ready, rendering RootLayoutNav');

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={styles.container}>
          <RootLayoutNav />
        </GestureHandlerRootView>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});