import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useFinanceStore } from '@/store/finance-store';
import { useBuddyStore } from '@/store/buddy-store';
import { AuthProvider, syncLocalFinanceDataForAuthUser, useAuth } from '@/store/auth-store';
import { supabase } from '@/lib/supabase';
import { FriendsProvider } from '@/store/friends-store';
import { LifeEventProvider } from '@/store/life-event-store';
import { HouseholdProvider } from '@/store/household-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { trpc, trpcClient } from '@/lib/trpc';
import { AppState, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FriendlyErrorFallback } from '@/components/FriendlyErrorFallback';
import { invokeFioSync } from '@/lib/fio-sync-client';
import { runHouseholdRecurringNotificationSync } from '@/lib/household-recurring-notifications';
import { useSavePendingStore } from '@/store/save-pending-store';
import { SavePendingNotificationHandler } from '@/components/SavePendingNotificationHandler';
import { SavePartnerAlertsHandler } from '@/components/SavePartnerAlertsHandler';
import { SplitGroupsRealtimeHandler } from '@/components/SplitGroupsRealtimeHandler';
import { ExpoPushTokenRegistration } from '@/components/ExpoPushTokenRegistration';
import { SplitExpensePushNotificationHandler } from '@/components/SplitExpensePushNotificationHandler';
import { AppLock } from '@/components/AppLock';
import { StackHeaderBackButton } from '@/components/BackButton';
import { useRevenueCatStore } from '@/store/revenuecat-store';
import { getIsPremiumSnapshot } from '@/hooks/usePremium';
import { consumeSuppressTabsRedirect } from '@/lib/nav-guards';
import { useRegisterIntentStore } from '@/store/register-intent-store';


SplashScreen.preventAutoHideAsync();

// Produkční build (__DEV__ === false): žádný LogBox overlay.
// Utlumíme warn/error, ať raw síťové chyby nekončí ani v device logu jako šum.
if (!__DEV__) {
  console.warn = () => {};
  console.error = () => {};
}


const queryClient = new QueryClient();

const autoSyncFio = async () => {
  try {
    if (!getIsPremiumSnapshot()) return;
    const token = await AsyncStorage.getItem('fio_token');
    if (!token) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: sessionData } = await supabase.auth.getSession();
    if (!user?.id || !sessionData.session?.access_token) return;
    await invokeFioSync({
      fioToken: token,
      userId: user.id,
      accessToken: sessionData.session.access_token,
    });
  } catch (e) {
    // Auto-sync: log raw, neobtěžuj uživatele
    console.log('[autoSyncFio] raw error:', e);
  }
};

// Root Error Boundary — raw error jen do console, UI přátelské CS
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.log('[RootErrorBoundary] raw error:', error);
    console.log('[RootErrorBoundary] componentStack:', errorInfo?.componentStack);

    // If it's a JSON parse error, clear AsyncStorage (corruption recovery)
    if (error.message.includes('JSON') || error.message.includes('Unexpected character')) {
      console.log('JSON parse error detected in Error Boundary, clearing AsyncStorage...');
      AsyncStorage.clear().then(() => {
        console.log('AsyncStorage cleared due to JSON parse error');
      }).catch((clearError) => {
        console.error('Failed to clear AsyncStorage:', clearError);
      });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <FriendlyErrorFallback onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

/** Expo Router route-level boundary (re-export z app/error.tsx). */
export { ErrorBoundary } from './error';

function HouseholdRecurringNotificationsRunner() {
  const { user, isAuthenticated } = useAuth();
  const isPremium = useRevenueCatStore((s) => s.isPremium);
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    if (!isAuthenticated || !isPremium || !user?.id || Platform.OS === 'web') return;
    const run = () => {
      const { subscriptions, loans } = useFinanceStore.getState();
      const sym = useSettingsStore.getState().getCurrentCurrency().symbol;
      runHouseholdRecurringNotificationSync(user.id, subscriptions, sym, loans).catch((e) =>
        console.warn('[household notifications]', e),
      );
    };
    run();
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      // Jen skutečný návrat z pozadí — ne inactive (document picker / share sheet).
      if (prev === 'background' && next === 'active') run();
    });
    return () => sub.remove();
  }, [user?.id, isAuthenticated, isPremium]);
  return null;
}

/** Routy mimo hlavní app stack — gate sem smí přesměrovat. */
const PRE_APP_SEGMENTS = new Set([
  'landing',
  'auth',
  'register',
  'accept-terms',
  'welcome-tour',
]);

function RootLayoutNav() {
  const { t, isLoaded } = useLanguageStore();
  const { isAuthenticated, isLoading, gateFlagsReady, user } = useAuth();
  const segments = useSegments();
  const rootSegment = String(segments[0] ?? '');

  const userId = user?.id ?? null;
  const termsAccepted = user?.termsAccepted === true;
  const welcomeTourCompleted = user?.welcomeTourCompleted === true;
  const authGateBlocked = isLoading || (isAuthenticated && !gateFlagsReady);

  // Free tier má plný přístup. replace JEN při přechodu mezi skupinami rout — nikdy když už jsme v app.
  useEffect(() => {
    // Dokud nejsou flags z DB/lokální cache, nic nepřesměrovávat (žádný false → tour flash).
    if (!isLoaded || authGateBlocked) return;

    const inPreApp = PRE_APP_SEGMENTS.has(rootSegment) || rootSegment === '';
    const onUnauthSurface =
      rootSegment === 'landing' ||
      rootSegment === 'auth' ||
      rootSegment === 'register' ||
      rootSegment === 'privacy-policy';

    if (!isAuthenticated) {
      if (onUnauthSurface) {
        console.log('[nav] gate skip (already on unauth surface)', rootSegment);
        return;
      }
      console.log('[nav] gate → /landing (reason: not authenticated)');
      router.replace('/landing');
      return;
    }

    if (!termsAccepted) {
      if (rootSegment === 'accept-terms' || rootSegment === 'privacy-policy') {
        console.log('[nav] gate skip (already accept-terms)');
        return;
      }
      console.log('[nav] gate → /accept-terms (reason: terms not accepted)');
      router.replace('/accept-terms');
      return;
    }

    if (!welcomeTourCompleted) {
      const { intent, skipWelcomePaywall } = useRegisterIntentStore.getState();
      // Registrace s intent=premium: terms → (PIN soft) → paywall → teprve welcome-tour
      if (intent === 'premium' && !skipWelcomePaywall) {
        if (rootSegment === 'choose-subscription') {
          console.log('[nav] gate skip (premium-intent paywall)');
          return;
        }
        console.log('[nav] gate → /choose-subscription (reason: premium intent)');
        router.replace({
          pathname: '/choose-subscription',
          params: { from: 'register-premium' },
        });
        return;
      }
      if (rootSegment === 'welcome-tour' || rootSegment === 'choose-subscription') {
        console.log('[nav] gate skip (already welcome/paywall)');
        return;
      }
      console.log('[nav] gate → /welcome-tour (reason: tour incomplete)');
      router.replace('/welcome-tour');
      return;
    }

    // Přihlášený + terms + tour — pokud už jsme v app stacku, NIKDY replace.
    if (!inPreApp) {
      console.log('[nav] gate skip (already in app)', rootSegment || segments.join('/'));
      return;
    }

    // Po welcome-tour může finishAndGo chtít paywall místo tabs.
    if (consumeSuppressTabsRedirect()) {
      console.log('[nav] gate skip (welcome paywall suppress)');
      return;
    }

    console.log('[nav] gate → /(tabs) (reason: leaving pre-app)', rootSegment);
    router.replace('/(tabs)');
  }, [
    isLoaded,
    authGateBlocked,
    isAuthenticated,
    userId,
    termsAccepted,
    welcomeTourCompleted,
    rootSegment,
  ]);

  if (!isLoaded || authGateBlocked) {
    return null;
  }
  
  if (!isAuthenticated) {
    return (
      <Stack initialRouteName="landing" screenOptions={{ headerBackTitle: t('back'), headerShown: false }}>
        <Stack.Screen name="landing" options={{ title: t('moneyBuddy') }} />
        <Stack.Screen name="auth" options={{ title: t('screenLogin'), headerShown: false }} />
        <Stack.Screen name="register" options={{ title: t('screenRegister'), headerShown: false }} />
        <Stack.Screen name="privacy-policy" options={{ title: t('privacyPolicyModalTitle'), headerShown: true }} />
      </Stack>
    );
  }

  if (isAuthenticated && user && user.termsAccepted !== true) {
    return (
      <Stack initialRouteName="accept-terms" screenOptions={{ headerBackTitle: t('back'), headerShown: false }}>
        <Stack.Screen name="accept-terms" options={{ headerShown: false }} />
        <Stack.Screen name="privacy-policy" options={{ title: t('privacyPolicyModalTitle'), headerShown: true }} />
      </Stack>
    );
  }
  
  // Po terms: jeden Stack (welcome-tour / paywall / tabs — gate přesměruje jen ze skupiny pre-app).
  return (
    <>
      <HouseholdRecurringNotificationsRunner />
      <SavePendingNotificationHandler />
      <SplitExpensePushNotificationHandler />
      <SavePartnerAlertsHandler />
      <SplitGroupsRealtimeHandler />
      <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerBackTitle: t('back'),
          headerShown: true,
          headerLeft: ({ tintColor }) => <StackHeaderBackButton tintColor={tintColor} />,
        }}
      >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      <Stack.Screen name="expense-detail" options={{ title: t('expenseBreakdown'), headerShown: true }} />
      <Stack.Screen name="income-detail" options={{ title: t('incomeAnalysis'), headerShown: true }} />
      <Stack.Screen name="financial-goals" options={{ title: t('financialGoals'), headerShown: true }} />
      <Stack.Screen name="add-savings-goal" options={{ title: t('fgNewGoal'), headerShown: true }} />
      <Stack.Screen name="savings-goal-detail" options={{ title: t('sgGoalTitle'), headerShown: true }} />
      <Stack.Screen name="language-settings" options={{ title: t('language'), headerShown: true }} />
      <Stack.Screen name="currency-settings" options={{ title: t('appCurrency'), headerShown: true }} />
      <Stack.Screen name="theme-settings" options={{ title: t('theme'), headerShown: true }} />
      <Stack.Screen name="appearance-settings" options={{ title: t('profileAppearanceTitle'), headerShown: true }} />
      <Stack.Screen name="general-settings" options={{ title: t('general'), headerShown: true }} />
      <Stack.Screen name="bank-accounts" options={{ title: t('bankAccountsTitle'), headerShown: true }} />
      <Stack.Screen name="notifications-settings" options={{ title: t('notifications'), headerShown: true }} />
      <Stack.Screen name="household-notification-settings" options={{ title: t('profileNotificationSettings'), headerShown: true }} />
      <Stack.Screen name="privacy-settings" options={{ title: t('privacy'), headerShown: true }} />
      <Stack.Screen name="privacy-data-info" options={{ title: t('screenPrivacyData'), headerShown: true }} />
      <Stack.Screen name="privacy-data-management" options={{ title: t('screenDataManagement'), headerShown: true }} />
      <Stack.Screen name="privacy-policy" options={{ title: t('privacyPolicyModalTitle'), headerShown: true }} />
      <Stack.Screen name="help-support" options={{ title: t('help'), headerShown: true }} />
      <Stack.Screen name="bank-import" options={{ title: t('bankImportScreenTitle'), headerShown: true }} />
      <Stack.Screen name="monthly-report" options={{ title: t('monthlyReport'), headerShown: false }} />
      <Stack.Screen name="asset/[symbol]" options={{ title: t('screenAssetDetail'), headerShown: false }} />
      <Stack.Screen name="account" options={{ title: t('profileMyAccount'), headerShown: false }} />
      <Stack.Screen name="edit-profile" options={{ title: t('screenEditProfile'), headerShown: true }} />
      <Stack.Screen name="investment-detail" options={{ title: t('screenInvestmentDetail'), headerShown: true }} />
      <Stack.Screen name="investment-position-detail" options={{ title: t('screenInvestmentPosition'), headerShown: true }} />
      <Stack.Screen name="reserve-detail" options={{ title: t('screenReserveDetail'), headerShown: true }} />
      <Stack.Screen name="landing-preview" options={{ title: t('screenLandingPreview'), headerShown: true }} />
      <Stack.Screen name="onboarding" options={{ title: t('screenProfileSetup'), headerShown: true }} />
      <Stack.Screen name="welcome-tour" options={{ title: '', headerShown: false, header: () => null }} />
      <Stack.Screen name="friends" options={{ title: t('screenFriends'), headerShown: true }} />
      <Stack.Screen name="friend-comparison" options={{ title: t('screenComparison'), headerShown: true }} />
      <Stack.Screen name="life-event" options={{ title: t('screenLifeEvent'), headerShown: false }} />
      <Stack.Screen name="household-policies" options={{ title: t('screenSharingRules'), headerShown: true }} />
      <Stack.Screen name="household-splits" options={{ title: t('screenExpenseSplits'), headerShown: true }} />
      <Stack.Screen name="household-budgets" options={{ title: t('screenCategoryBudgets'), headerShown: true }} />
      <Stack.Screen name="household-overview" options={{ title: t('screenHouseholdOverview'), headerShown: true }} />
      <Stack.Screen name="household-members" options={{ title: t('hhMembersTitle'), headerShown: true }} />
      <Stack.Screen name="loans" options={{ title: t('screenLoans'), headerShown: true }} />
      <Stack.Screen name="loan-detail" options={{ title: t('screenLoanDetail'), headerShown: true }} />
      <Stack.Screen name="loan-finder" options={{ title: t('screenLoanFinder'), headerShown: true }} />
      <Stack.Screen name="add-loan" options={{ title: t('screenAddLoan'), headerShown: true }} />
      <Stack.Screen name="edit-loan" options={{ title: t('screenEditLoan'), headerShown: true }} />
      <Stack.Screen name="add-subscription" options={{ title: t('screenAddSubscription'), headerShown: true }} />
      <Stack.Screen name="category-detail" options={{ title: t('screenCategoryDetail'), headerShown: true }} />
      <Stack.Screen name="transaction-detail" options={{ title: t('screenTransaction'), headerShown: false }} />
      <Stack.Screen name="save-pending-detail" options={{ title: t('screenThinkItOver'), headerShown: true }} />
      <Stack.Screen name="save" options={{ title: t('piggyBankFeature'), headerShown: true }} />
      <Stack.Screen name="split-groups" options={{ title: t('splitGroups'), headerShown: false }} />
      <Stack.Screen name="split-group-detail" options={{ title: t('splitGroups'), headerShown: false }} />
      <Stack.Screen name="join-split-group" options={{ title: t('splitGroupsJoinTitle'), headerShown: false }} />
      <Stack.Screen name="add-split-expense" options={{ title: t('splitGroupsNewExpense'), headerShown: false }} />
      <Stack.Screen name="badges" options={{ title: t('screenBadges'), headerShown: true }} />
      <Stack.Screen name="quests" options={{ title: t('screenQuests'), headerShown: true }} />
      <Stack.Screen name="gaming-stats" options={{ title: t('screenGamingStats'), headerShown: true }} />
      <Stack.Screen name="hall-of-fame" options={{ title: t('screenHallOfFame'), headerShown: true }} />
      <Stack.Screen name="leaderboard" options={{ title: t('screenLeaderboard'), headerShown: true }} />
      <Stack.Screen name="support-chat" options={{ title: t('screenSupport'), headerShown: true }} />
      <Stack.Screen name="register" options={{ title: t('screenRegister'), headerShown: false }} />
      
      {/* These screens should not be accessible when user has active subscription */}
      <Stack.Screen name="auth" options={{ title: t('screenLogin'), headerShown: false }} />
      <Stack.Screen name="subscription" options={{ title: t('screenEditSubscription') }} />
      <Stack.Screen name="choose-subscription" options={{ title: t('screenChooseSubscription') }} />
      <Stack.Screen name="landing" options={{ title: t('moneyBuddy') }} />
    </Stack>
      <AppLock />
      </View>
    </>
  );
}

export default function RootLayout() {
  const { loadSettings } = useSettingsStore();
  const { loadLanguage, isLoaded } = useLanguageStore();
  const loadFinanceData = useFinanceStore((state) => state.loadData);
  const { loadData: loadBuddyData } = useBuddyStore();

  const [appReady, setAppReady] = useState<boolean>(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // Sync při startu
    autoSyncFio();

    // Sync jen po skutečném background → active (ne inactive z document pickeru).
    const subscription = AppState.addEventListener('change', (nextState) => {
      const prev = appState.current;
      appState.current = nextState;
      if (prev === 'background' && nextState === 'active') {
        autoSyncFio();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
  
  useEffect(() => {
    if (Platform.OS !== 'web') {
      void import('expo-notifications').then((Notifications) => {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });
      });
    }
  }, []);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const initializeApp = async () => {
      try {
        console.log('Initializing app...');
        await Promise.all([loadSettings(), loadLanguage()]);
        const { data: sessionData } = await supabase.auth.getSession();
        const currentUserId = sessionData.session?.user?.id ?? null;
        await syncLocalFinanceDataForAuthUser(currentUserId);
        // Krátká pauza aby AsyncStorage stihl zapsat
        await new Promise((resolve) => setTimeout(resolve, 100));
        await Promise.all([loadFinanceData(), loadBuddyData()]);
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
            await Promise.all([loadSettings(), loadLanguage()]);
            const { data: retrySessionData } = await supabase.auth.getSession();
            await syncLocalFinanceDataForAuthUser(retrySessionData.session?.user?.id ?? null);
            await Promise.all([
              loadFinanceData(),
              loadBuddyData(),
              useSavePendingStore.getState().loadFromStorage(),
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <RootErrorBoundary>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ExpoPushTokenRegistration />
              <FriendsProvider>
                <LifeEventProvider>
                  <HouseholdProvider>
                    <RootLayoutNav />
                  </HouseholdProvider>
                </LifeEventProvider>
              </FriendsProvider>
            </AuthProvider>
          </QueryClientProvider>
        </trpc.Provider>
      </RootErrorBoundary>
    </GestureHandlerRootView>
  );
}
