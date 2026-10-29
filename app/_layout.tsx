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
import { useRevenueCatStore } from '@/store/revenuecat-store';
import { getIsPremiumSnapshot } from '@/hooks/usePremium';
import { consumeSuppressTabsRedirect } from '@/lib/nav-guards';
import { useRegisterIntentStore } from '@/store/register-intent-store';
import { ToastHost } from '@/components/Toast';


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
    const result = await invokeFioSync({
      fioToken: token,
      userId: user.id,
      accessToken: sessionData.session.access_token,
    });
    if ((result?.imported ?? 0) > 0) {
      await useFinanceStore.getState().loadTransactionsFromSupabase();
      const { runAfterTransactionsSideEffects } = await import(
        '@/lib/after-transactions-side-effects'
      );
      await runAfterTransactionsSideEffects({ userId: user.id });
    }
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
    if (!isAuthenticated || !user?.id) return;
    const runPersonalRecurring = async () => {
      try {
        const { materializeDueRecurring } = await import('@/lib/personal-recurring');
        const { created } = await materializeDueRecurring(user.id);
        if (created > 0) {
          await useFinanceStore.getState().loadTransactionsFromSupabase();
          const { runAfterTransactionsSideEffects } = await import(
            '@/lib/after-transactions-side-effects'
          );
          await runAfterTransactionsSideEffects({ userId: user.id });
        }
      } catch (e) {
        console.warn('[personal recurring]', e);
      }
    };
    const runNotifications = () => {
      if (!isPremium || Platform.OS === 'web') return;
      const { subscriptions, loans } = useFinanceStore.getState();
      const sym = useSettingsStore.getState().getCurrentCurrency().symbol;
      runHouseholdRecurringNotificationSync(user.id, subscriptions, sym, loans).catch((e) =>
        console.warn('[household notifications]', e),
      );
    };
    const run = () => {
      void runPersonalRecurring().then(runNotifications);
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
  'choose-subscription',
  'premium-success',
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
      if (
        rootSegment === 'welcome-tour' ||
        rootSegment === 'choose-subscription' ||
        rootSegment === 'premium-success'
      ) {
        console.log('[nav] gate skip (already welcome/paywall/success)');
        return;
      }
      console.log('[nav] gate → /welcome-tour (reason: tour incomplete)');
      router.replace('/welcome-tour');
      return;
    }

    // Quick-setup po tour — nenech gate přesměrovat pryč.
    if (rootSegment === 'quick-setup') {
      console.log('[nav] gate skip (quick-setup)');
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

    void (async () => {
      const { resolvePostTourHref } = await import('@/lib/quick-setup');
      const dest = await resolvePostTourHref(userId);
      console.log('[nav] gate →', dest, '(reason: leaving pre-app)', rootSegment);
      router.replace(dest);
    })();
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
        <Stack.Screen name="privacy-policy" options={{ title: t('privacyPolicyModalTitle'), headerShown: false }} />
      </Stack>
    );
  }

  if (isAuthenticated && user && user.termsAccepted !== true) {
    return (
      <Stack initialRouteName="accept-terms" screenOptions={{ headerBackTitle: t('back'), headerShown: false }}>
        <Stack.Screen name="accept-terms" options={{ headerShown: false }} />
        <Stack.Screen name="privacy-policy" options={{ title: t('privacyPolicyModalTitle'), headerShown: false }} />
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
          // ScreenHeader žije v obsahu obrazovek — native header vypnutý (žádné dvojité zpět).
          headerShown: false,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      >
      <Stack.Screen name="(tabs)" options={{ headerShown: false, gestureEnabled: false }} />

      <Stack.Screen name="expense-detail" options={{ title: t('expenseBreakdown') }} />
      <Stack.Screen name="income-detail" options={{ title: t('incomeAnalysis') }} />
      <Stack.Screen name="financial-goals" options={{ title: t('financialGoals') }} />
      <Stack.Screen name="add-savings-goal" options={{ title: t('fgNewGoal') }} />
      <Stack.Screen name="savings-goal-detail" options={{ title: t('sgGoalTitle') }} />
      <Stack.Screen name="plan-goal-detail" options={{ title: 'Cíl' }} />
      <Stack.Screen name="investice" options={{ title: t('investments') }} />
      <Stack.Screen name="language-settings" options={{ title: t('language') }} />
      <Stack.Screen name="currency-settings" options={{ title: t('appCurrency') }} />
      <Stack.Screen name="theme-settings" options={{ title: t('theme') }} />
      <Stack.Screen name="appearance-settings" options={{ title: t('profileAppearanceTitle') }} />
      <Stack.Screen name="general-settings" options={{ title: t('general') }} />
      <Stack.Screen name="bank-accounts" options={{ title: t('bankAccountsTitle') }} />
      <Stack.Screen name="notifications-settings" options={{ title: t('notifications') }} />
      <Stack.Screen name="household-notification-settings" options={{ title: t('profileNotificationSettings') }} />
      <Stack.Screen name="privacy-settings" options={{ title: t('privacy') }} />
      <Stack.Screen name="privacy-data-info" options={{ title: t('screenPrivacyData') }} />
      <Stack.Screen name="privacy-data-management" options={{ title: t('screenDataManagement') }} />
      <Stack.Screen name="privacy-policy" options={{ title: t('privacyPolicyModalTitle'), headerShown: false }} />
      <Stack.Screen name="help-support" options={{ title: t('help') }} />
      <Stack.Screen name="bank-import" options={{ title: t('bankImportScreenTitle') }} />
      <Stack.Screen name="monthly-report" options={{ title: t('monthlyReport') }} />
      <Stack.Screen name="asset/[symbol]" options={{ title: t('screenAssetDetail') }} />
      <Stack.Screen name="account" options={{ title: t('profileMyAccount') }} />
      <Stack.Screen name="edit-profile" options={{ title: t('screenEditProfile') }} />
      <Stack.Screen name="investment-detail" options={{ title: t('screenInvestmentDetail') }} />
      <Stack.Screen name="investment-position-detail" options={{ title: t('screenInvestmentPosition') }} />
      <Stack.Screen name="reserve-detail" options={{ title: t('screenReserveDetail') }} />
      <Stack.Screen name="welcome-tour" options={{ title: '', headerShown: false, header: () => null, gestureEnabled: false }} />
      <Stack.Screen name="household-policies" options={{ title: t('screenSharingRules') }} />
      <Stack.Screen name="household-splits" options={{ title: t('screenExpenseSplits') }} />
      <Stack.Screen name="household-budgets" options={{ title: t('screenCategoryBudgets') }} />
      <Stack.Screen name="household-overview" options={{ title: t('screenHouseholdOverview') }} />
      <Stack.Screen name="household-members" options={{ title: t('hhMembersTitle') }} />
      <Stack.Screen name="loans" options={{ title: t('screenLoans') }} />
      <Stack.Screen name="quick-setup" options={{ title: 'Rychlé nastavení', headerShown: false }} />
      <Stack.Screen name="personal-recurring" options={{ title: t('personalRecurring.title') }} />
      <Stack.Screen name="loan-detail" options={{ title: t('screenLoanDetail') }} />
      <Stack.Screen name="add-loan" options={{ title: t('screenAddLoan') }} />
      <Stack.Screen name="edit-loan" options={{ title: t('screenEditLoan') }} />
      <Stack.Screen name="add-subscription" options={{ title: t('screenAddSubscription') }} />
      <Stack.Screen name="category-detail" options={{ title: t('screenCategoryDetail') }} />
      <Stack.Screen name="transaction-detail" options={{ title: t('screenTransaction') }} />
      <Stack.Screen name="save-pending-detail" options={{ title: t('screenThinkItOver') }} />
      <Stack.Screen name="save" options={{ title: t('piggyBankFeature') }} />
      <Stack.Screen name="split-groups" options={{ title: t('splitGroups') }} />
      <Stack.Screen name="split-group-detail" options={{ title: t('splitGroups') }} />
      <Stack.Screen name="join-split-group" options={{ title: t('splitGroupsJoinTitle') }} />
      <Stack.Screen name="add-split-expense" options={{ title: t('splitGroupsNewExpense') }} />
      <Stack.Screen name="register" options={{ title: t('screenRegister'), headerShown: false, gestureEnabled: false }} />
      
      {/* These screens should not be accessible when user has active subscription */}
      <Stack.Screen name="auth" options={{ title: t('screenLogin'), headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="subscription" options={{ title: t('screenEditSubscription') }} />
      <Stack.Screen
        name="choose-subscription"
        options={{ title: t('screenChooseSubscription'), presentation: 'modal', gestureEnabled: true }}
      />
      <Stack.Screen
        name="premium-success"
        options={{ headerShown: false, gestureEnabled: false, fullScreenGestureEnabled: false }}
      />
      <Stack.Screen name="landing" options={{ title: t('moneyBuddy'), gestureEnabled: false }} />
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
        if (currentUserId) {
          try {
            const { migrateLocalPlanDataToSupabase } = await import('@/lib/supabase-plan');
            await migrateLocalPlanDataToSupabase(currentUserId);
          } catch (e) {
            console.warn('[plan] migrate on init', e);
          }
        }
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
              <HouseholdProvider>
                <RootLayoutNav />
              </HouseholdProvider>
              <ToastHost />
            </AuthProvider>
          </QueryClientProvider>
        </trpc.Provider>
      </RootErrorBoundary>
    </GestureHandlerRootView>
  );
}
