import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, trpcClient } from '@/lib/trpc';
import { HouseholdProvider } from '@/store/household-store';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
        <Stack.Screen name="expense-detail" options={{ presentation: 'modal', title: 'Detail výdaje' }} />
        <Stack.Screen name="income-detail" options={{ presentation: 'modal', title: 'Detail příjmu' }} />
        <Stack.Screen name="financial-goals" options={{ presentation: 'modal', title: 'Finanční cíle' }} />
        <Stack.Screen name="language-settings" options={{ presentation: 'modal', title: 'Jazyk' }} />
        <Stack.Screen name="currency-settings" options={{ presentation: 'modal', title: 'Měna' }} />
        <Stack.Screen name="theme-settings" options={{ presentation: 'modal', title: 'Vzhled' }} />
        <Stack.Screen name="general-settings" options={{ presentation: 'modal', title: 'Obecné nastavení' }} />
        <Stack.Screen name="notifications-settings" options={{ presentation: 'modal', title: 'Notifikace' }} />
        <Stack.Screen name="privacy-settings" options={{ presentation: 'modal', title: 'Soukromí' }} />
        <Stack.Screen name="help-support" options={{ presentation: 'modal', title: 'Pomoc a podpora' }} />
        <Stack.Screen name="monthly-report" options={{ presentation: 'modal', title: 'Měsíční report' }} />
        <Stack.Screen name="backend-test" options={{ presentation: 'modal', title: 'Backend Test' }} />
        <Stack.Screen name="t212-portfolio" options={{ presentation: 'modal', title: 'Trading 212 Portfolio' }} />
        <Stack.Screen name="asset/[symbol]" options={{ presentation: 'modal', title: 'Asset Detail' }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="subscription" options={{ presentation: 'modal', title: 'Předplatné' }} />
        <Stack.Screen name="landing" options={{ headerShown: false }} />
        <Stack.Screen name="account" options={{ presentation: 'modal', title: 'Účet' }} />
        <Stack.Screen name="landing-preview" options={{ headerShown: false }} />
        <Stack.Screen name="leaderboard" options={{ presentation: 'modal', title: 'Žebříček' }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="portfolio-detail" options={{ presentation: 'modal', title: 'Detail portfolia' }} />
        <Stack.Screen name="chat" options={{ presentation: 'modal', title: 'AI Asistent' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="loan-detail" options={{ presentation: 'modal', title: 'Detail půjčky' }} />
        <Stack.Screen name="add-loan" options={{ presentation: 'modal', title: 'Přidat půjčku' }} />
        <Stack.Screen name="loans" options={{ presentation: 'modal', title: 'Půjčky' }} />
        <Stack.Screen name="edit-loan" options={{ presentation: 'modal', title: 'Upravit půjčku' }} />
        <Stack.Screen name="loan-finder" options={{ presentation: 'modal', title: 'Hledač půjček' }} />
        <Stack.Screen name="friends" options={{ presentation: 'modal', title: 'Přátelé' }} />
        <Stack.Screen name="friend-comparison" options={{ presentation: 'modal', title: 'Porovnání' }} />
        <Stack.Screen name="badges" options={{ presentation: 'modal', title: 'Odznaky' }} />
        <Stack.Screen name="quests" options={{ presentation: 'modal', title: 'Úkoly' }} />
        <Stack.Screen name="hall-of-fame" options={{ presentation: 'modal', title: 'Síň slávy' }} />
        <Stack.Screen name="gaming-stats" options={{ presentation: 'modal', title: 'Herní statistiky' }} />
        <Stack.Screen name="support-chat" options={{ presentation: 'modal', title: 'Podpora' }} />
        <Stack.Screen name="category-detail" options={{ presentation: 'modal', title: 'Detail kategorie' }} />
        <Stack.Screen name="bank-connect" options={{ presentation: 'modal', title: 'Připojit banku' }} />
        <Stack.Screen name="bank-accounts" options={{ presentation: 'modal', title: 'Bankovní účty' }} />
        <Stack.Screen name="life-event" options={{ presentation: 'modal', title: 'Životní událost' }} />
        <Stack.Screen name="household" options={{ presentation: 'modal', title: 'Domácnost' }} />
        <Stack.Screen name="household-policies" options={{ presentation: 'modal', title: 'Pravidla sdílení' }} />
        <Stack.Screen name="household-splits" options={{ presentation: 'modal', title: 'Rozdělení nákladů' }} />
        <Stack.Screen name="household-budgets" options={{ presentation: 'modal', title: 'Rozpočty' }} />
        <Stack.Screen name="edit-bank-transaction" options={{ presentation: 'modal', title: 'Upravit transakci' }} />
        <Stack.Screen name="add-subscription" options={{ presentation: 'modal', title: 'Přidat předplatné' }} />
        <Stack.Screen name="household-overview" options={{ presentation: 'modal', title: 'Přehled domácnosti' }} />
        <Stack.Screen name="choose-subscription" options={{ presentation: 'modal', title: 'Vybrat předplatné' }} />
        <Stack.Screen name="redeem-code" options={{ presentation: 'modal', title: 'Uplatnit kód' }} />
      </Stack>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <HouseholdProvider>
          <RootLayoutNav />
        </HouseholdProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
