import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { create } from 'zustand';
import { isDevForcePremium, PREMIUM_ENTITLEMENT_ID } from '@/constants/premium';

let Purchases: any = null;
let LOG_LEVEL: any = null;

/** true = Purchases.configure() proběhl úspěšně. */
let isConfigured = false;
/** Configure selhalo / chybí klíč / web — RC API nevolat (žádný retry). */
let configureUnavailable = false;
/** Probíhající configure (dedupe souběžných volání). */
let configureInFlight: Promise<boolean> | null = null;

let lastLoggedInUserId: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let refreshInFlightUserId: string | null | undefined;
let loggedRcKeyOnce = false;

function getAppVariant(): 'development' | 'production' {
  const v = Constants.expoConfig?.extra?.appVariant;
  return v === 'production' ? 'production' : 'development';
}

function getRCToken(): string | undefined {
  // Dev bundle (cz.moneybuddy.app.dev) nemá App Store produkty → vždy Test Store klíč.
  const variant = getAppVariant();
  if (variant === 'development' || Platform.OS === 'web') {
    if (!loggedRcKeyOnce) {
      loggedRcKeyOnce = true;
      console.log('[RevenueCat] using TEST key');
    }
    return process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
  }

  const key = Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
    default: process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY,
  });
  if (!loggedRcKeyOnce) {
    loggedRcKeyOnce = true;
    console.log(
      Platform.OS === 'android'
        ? '[RevenueCat] using ANDROID key'
        : '[RevenueCat] using IOS key',
    );
  }
  return key;
}

function markUnavailable(reason: string): void {
  if (configureUnavailable) return;
  configureUnavailable = true;
  console.warn(`[RevenueCat] ${reason}`);
  // Jednorázový free stav — bez dalšího retry.
  useRevenueCatStore.setState((s) => {
    if (
      s.isPremium === false &&
      s.plan === null &&
      s.expiresAt === null &&
      s.loading === false &&
      s.customerInfo === null
    ) {
      return s;
    }
    return {
      isPremium: false,
      plan: null,
      expiresAt: null,
      loading: false,
      customerInfo: null,
    };
  });
}

/**
 * Configure jen jednou za běh appky.
 * Chybí klíč / web / chyba → markUnavailable (1× warn), další volání hned false.
 */
async function ensureConfigured(): Promise<boolean> {
  if (isConfigured) return true;
  if (configureUnavailable) return false;
  if (configureInFlight) return configureInFlight;

  configureInFlight = (async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'web') {
        markUnavailable('Web platform — skipping');
        return false;
      }

      const apiKey = getRCToken();
      if (!apiKey) {
        markUnavailable('No API key found');
        return false;
      }

      try {
        const mod = await import('react-native-purchases');
        Purchases = mod.default;
        LOG_LEVEL = mod.LOG_LEVEL;
        Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
        Purchases.configure({ apiKey });
        isConfigured = true;
        return true;
      } catch (error) {
        console.error('[RevenueCat] Failed to configure:', error);
        markUnavailable('Configure failed');
        return false;
      }
    } finally {
      configureInFlight = null;
    }
  })();

  return configureInFlight;
}

export function isRevenueCatReady(): boolean {
  return isConfigured && !configureUnavailable;
}

/** True, pokud je v env dostupný RC API klíč pro aktuální platformu. */
export function hasRevenueCatApiKey(): boolean {
  return Boolean(getRCToken());
}

/** Test Store klíč (dev bundle) — Offer Code sheet / App Store produkty nefungují. */
export function isRevenueCatTestStore(): boolean {
  return getAppVariant() === 'development' || Platform.OS === 'web';
}

/**
 * Formát ceny z RevenueCat produktu.
 * CZK → „1 290 Kč“ (bez haléřů); jiná měna → product.priceString.
 */
export function formatRcProductPrice(
  price: number,
  priceString?: string | null,
  currencyCode?: string | null,
): string {
  const code = (String(currencyCode ?? 'CZK').trim().toUpperCase() || 'CZK');
  if (code === 'CZK') {
    try {
      return new Intl.NumberFormat('cs-CZ', {
        style: 'currency',
        currency: 'CZK',
        maximumFractionDigits: 0,
      }).format(Math.round(Number(price) || 0));
    } catch {
      return `${Math.round(Number(price) || 0)} Kč`;
    }
  }
  if (typeof priceString === 'string' && priceString.trim()) return priceString.trim();
  try {
    return new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(Number(price) || 0);
  } catch {
    return String(price);
  }
}

/** Měsíční ekvivalent roční ceny — zaokrouhleno na celé Kč. */
export function formatRcMonthlyEquivalent(
  annualPrice: number,
  currencyCode?: string | null,
): string {
  const monthly = Math.round(Number(annualPrice) / 12);
  return formatRcProductPrice(monthly, null, currencyCode ?? 'CZK');
}

/** iOS Offer Code redemption sheet (App Store). No-op mimo iOS / bez RC / Test Store. */
export async function presentAppleCodeRedemptionSheet(): Promise<void> {
  if (Platform.OS !== 'ios' || isRevenueCatTestStore()) return;
  const ready = await ensureConfigured();
  if (!ready || !Purchases?.presentCodeRedemptionSheet) return;
  await Purchases.presentCodeRedemptionSheet();
}

export type PurchasesPackage = any;
export type CustomerInfo = any;
export type PurchasesOfferings = any;

export type PremiumPlan = 'monthly' | 'yearly' | null;

export function hasPremiumAccess(customerInfo: CustomerInfo | null): boolean {
  if (isDevForcePremium()) return true;
  if (!customerInfo) return false;
  return customerInfo?.entitlements?.active?.[PREMIUM_ENTITLEMENT_ID] !== undefined;
}

/** Extrahuje plán a expiraci z aktivního entitlement „premium“. */
export function planFromCustomerInfo(customerInfo: CustomerInfo | null): {
  plan: PremiumPlan;
  expiresAt: string | null;
} {
  if (!customerInfo) return { plan: null, expiresAt: null };
  const ent = customerInfo?.entitlements?.active?.[PREMIUM_ENTITLEMENT_ID];
  if (!ent) return { plan: null, expiresAt: null };

  const productId = String(ent.productIdentifier ?? '').toLowerCase();
  const period = String(ent.productPlanIdentifier ?? ent.periodType ?? '').toLowerCase();
  const blob = `${productId} ${period}`;
  let plan: PremiumPlan = 'monthly';
  if (
    blob.includes('year') ||
    blob.includes('annual') ||
    blob.includes('rocni') ||
    blob.includes('roční')
  ) {
    plan = 'yearly';
  }

  const expiresAt =
    typeof ent.expirationDate === 'string'
      ? ent.expirationDate
      : ent.expirationDate
        ? new Date(ent.expirationDate).toISOString()
        : null;

  return { plan, expiresAt };
}

const UI_KEYS = ['isPremium', 'plan', 'expiresAt', 'loading'] as const;

/** setState jen při změně isPremium / plan / expiresAt / loading (ne při novém customerInfo objektu). */
function patchIfChanged(
  get: () => RevenueCatState,
  set: (partial: Partial<RevenueCatState>) => void,
  patch: Partial<RevenueCatState>,
): void {
  const cur = get();
  let uiChanged = false;
  for (const key of UI_KEYS) {
    if (key in patch && cur[key] !== patch[key]) {
      uiChanged = true;
      break;
    }
  }
  if (!uiChanged) return;
  const next: Partial<RevenueCatState> = {};
  for (const key of Object.keys(patch) as (keyof RevenueCatState)[]) {
    if (typeof patch[key] === 'function') continue;
    if (cur[key] !== patch[key]) (next as any)[key] = patch[key];
  }
  if (Object.keys(next).length > 0) set(next);
}

interface RevenueCatState {
  isPremium: boolean;
  loading: boolean;
  customerInfo: CustomerInfo | null;
  plan: PremiumPlan;
  expiresAt: string | null;
  applyCustomerInfo: (info: CustomerInfo | null) => void;
  refreshPremium: (userId?: string | null) => Promise<boolean>;
  reset: () => void;
}

export const useRevenueCatStore = create<RevenueCatState>((set, get) => ({
  isPremium: isDevForcePremium(),
  loading: false,
  customerInfo: null,
  plan: null,
  expiresAt: null,

  applyCustomerInfo: (info) => {
    if (isDevForcePremium()) {
      patchIfChanged(get, set, {
        isPremium: true,
        plan: get().plan ?? 'yearly',
        loading: false,
        customerInfo: info,
      });
      return;
    }
    const premium = hasPremiumAccess(info);
    const { plan, expiresAt } = planFromCustomerInfo(info);
    patchIfChanged(get, set, {
      isPremium: premium,
      plan: premium ? plan : null,
      expiresAt: premium ? expiresAt : null,
      loading: false,
      customerInfo: info,
    });
  },

  refreshPremium: async (userId) => {
    if (isDevForcePremium()) {
      patchIfChanged(get, set, { isPremium: true, loading: false, plan: 'yearly' });
      return true;
    }

    const ok = await ensureConfigured();
    // RC není k dispozici → žádný setState, žádné API.
    if (!ok || !isConfigured || configureUnavailable) {
      return get().isPremium;
    }

    // Deduplikace souběžných volání se stejným userId.
    if (
      refreshInFlight &&
      (refreshInFlightUserId === userId ||
        (refreshInFlightUserId == null && (userId == null || userId === '')))
    ) {
      return refreshInFlight;
    }

    const run = (async (): Promise<boolean> => {
      try {
        if (userId) {
          // logIn jen při změně identity
          if (lastLoggedInUserId !== userId) {
            patchIfChanged(get, set, { loading: true });
            const info = await loginUser(userId);
            // loginUser už applyCustomerInfo
            if (info) lastLoggedInUserId = userId;
            patchIfChanged(get, set, { loading: false });
            return hasPremiumAccess(info);
          }
          // Stejný user — jen customer info (bez zbytečného logIn)
          const info = await getCustomerInfo();
          get().applyCustomerInfo(info);
          return hasPremiumAccess(info);
        }
        const info = await getCustomerInfo();
        get().applyCustomerInfo(info);
        return hasPremiumAccess(info);
      } catch (e) {
        console.warn('[RevenueCat] refreshPremium failed', e);
        patchIfChanged(get, set, { loading: false });
        return get().isPremium;
      } finally {
        refreshInFlight = null;
        refreshInFlightUserId = undefined;
      }
    })();

    refreshInFlight = run;
    refreshInFlightUserId = userId;
    return run;
  },

  reset: () => {
    lastLoggedInUserId = null;
    refreshInFlight = null;
    refreshInFlightUserId = undefined;
    const nextPremium = isDevForcePremium();
    patchIfChanged(get, set, {
      isPremium: nextPremium,
      loading: false,
      customerInfo: null,
      plan: nextPremium ? 'yearly' : null,
      expiresAt: null,
    });
  },
}));

export async function getOfferings(): Promise<PurchasesOfferings | null> {
  try {
    const ready = await ensureConfigured();
    if (!ready || !Purchases) return null;
    return await Purchases.getOfferings();
  } catch (error) {
    console.error('[RevenueCat] Failed to fetch offerings:', error);
    return null;
  }
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo | null> {
  try {
    const ready = await ensureConfigured();
    if (!ready || !Purchases) return null;

    const { customerInfo } = await Purchases.purchasePackage(pkg);
    useRevenueCatStore.getState().applyCustomerInfo(customerInfo);
    return customerInfo;
  } catch (error: any) {
    if (error?.userCancelled) return null;
    console.error('[RevenueCat] Purchase failed:', error);
    throw error;
  }
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    const ready = await ensureConfigured();
    if (!ready || !Purchases) return null;
    return await Purchases.getCustomerInfo();
  } catch (error) {
    console.error('[RevenueCat] Failed to get customer info:', error);
    return null;
  }
}

export async function restorePurchases(): Promise<CustomerInfo | null> {
  try {
    const ready = await ensureConfigured();
    if (!ready || !Purchases) return null;
    const customerInfo = await Purchases.restorePurchases();
    useRevenueCatStore.getState().applyCustomerInfo(customerInfo);
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Failed to restore purchases:', error);
    throw error;
  }
}

export async function loginUser(userId: string): Promise<CustomerInfo | null> {
  try {
    const ready = await ensureConfigured();
    if (!ready || !Purchases) return null;

    const { customerInfo } = await Purchases.logIn(userId);
    lastLoggedInUserId = userId;
    useRevenueCatStore.getState().applyCustomerInfo(customerInfo);
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Failed to log in user:', error);
    return null;
  }
}

export async function logoutUser(): Promise<CustomerInfo | null> {
  try {
    lastLoggedInUserId = null;
    if (!isConfigured || configureUnavailable || !Purchases) {
      useRevenueCatStore.getState().reset();
      return null;
    }
    const customerInfo = await Purchases.logOut();
    useRevenueCatStore.getState().reset();
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Failed to log out user:', error);
    useRevenueCatStore.getState().reset();
    return null;
  }
}

/** Helper: je balíček roční? */
export function isAnnualPackage(pkg: PurchasesPackage): boolean {
  const type = String(pkg?.packageType ?? '').toUpperCase();
  const id = String(pkg?.identifier ?? '').toLowerCase();
  return type === 'ANNUAL' || id.includes('annual') || id.includes('yearly') || id.includes('year');
}

/** true = uživatel je eligible na trial/intro u daného productIdentifier. */
export async function checkIntroEligibility(productIdentifier: string): Promise<boolean> {
  try {
    const ready = await ensureConfigured();
    if (!ready || !Purchases?.checkTrialOrIntroductoryPriceEligibility) return false;
    const map = await Purchases.checkTrialOrIntroductoryPriceEligibility([productIdentifier]);
    const entry = map?.[productIdentifier];
    const status = entry?.status;
    // react-native-purchases: INTRO_ELIGIBILITY_STATUS_ELIGIBLE === 2
    if (status === 2) return true;
    const label = String(status ?? '').toUpperCase();
    return label.includes('ELIGIBLE') && !label.includes('INELIGIBLE') && !label.includes('NO_INTRO');
  } catch (e) {
    console.warn('[RevenueCat] intro eligibility', e);
    return false;
  }
}

/** Intro nabídka (trial) z RC produktu, pokud existuje. */
export function getIntroOfferLabel(pkg: PurchasesPackage): {
  hasFreeTrial: boolean;
  periodDays: number | null;
  priceAfter: string | null;
} {
  const product = pkg?.product;
  const intro = product?.introPrice;
  if (!intro) {
    return { hasFreeTrial: false, periodDays: null, priceAfter: null };
  }
  const price = Number(intro.price ?? 0);
  const hasFreeTrial = price === 0;
  const cycles = Number(intro.cycles ?? intro.periodNumberOfUnits ?? 0);
  const unit = String(intro.periodUnit ?? intro.subscriptionPeriod?.unit ?? '').toUpperCase();
  let periodDays: number | null = null;
  if (unit.includes('DAY') || unit === 'DAY') {
    periodDays = cycles || Number(intro.periodNumberOfUnits) || null;
  } else if (unit.includes('WEEK')) periodDays = (cycles || 1) * 7;
  else if (unit.includes('MONTH')) periodDays = (cycles || 1) * 30;

  const priceAfter = formatRcProductPrice(
    Number(product?.price ?? 0),
    typeof product?.priceString === 'string' ? product.priceString : null,
    product?.currencyCode,
  );

  return {
    hasFreeTrial,
    periodDays,
    priceAfter: priceAfter || null,
  };
}
