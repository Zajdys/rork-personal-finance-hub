import { Platform } from 'react-native';
import Purchases, { 
  PurchasesOfferings, 
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
} from 'react-native-purchases';

function getRCToken() {
  if (__DEV__ || Platform.OS === 'web') {
    return process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
  }
  return Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
    default: process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY,
  });
}

const apiKey = getRCToken();
if (apiKey) {
  console.log('[RevenueCat] Configuring with API key...');
  Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
} else {
  console.warn('[RevenueCat] No API key found');
}

export async function getOfferings(): Promise<PurchasesOfferings | null> {
  try {
    console.log('[RevenueCat] Fetching offerings...');
    const offerings = await Purchases.getOfferings();
    console.log('[RevenueCat] Offerings fetched:', offerings);
    return offerings;
  } catch (error) {
    console.error('[RevenueCat] Failed to fetch offerings:', error);
    return null;
  }
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo | null> {
  try {
    console.log('[RevenueCat] Purchasing package:', pkg.identifier);
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    console.log('[RevenueCat] Purchase successful:', customerInfo);
    return customerInfo;
  } catch (error: any) {
    if (error.userCancelled) {
      console.log('[RevenueCat] User cancelled purchase');
      return null;
    }
    console.error('[RevenueCat] Purchase failed:', error);
    throw error;
  }
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    console.log('[RevenueCat] Customer info:', customerInfo);
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Failed to get customer info:', error);
    return null;
  }
}

export async function restorePurchases(): Promise<CustomerInfo | null> {
  try {
    console.log('[RevenueCat] Restoring purchases...');
    const customerInfo = await Purchases.restorePurchases();
    console.log('[RevenueCat] Purchases restored:', customerInfo);
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Failed to restore purchases:', error);
    throw error;
  }
}

export async function loginUser(userId: string): Promise<CustomerInfo | null> {
  try {
    console.log('[RevenueCat] Logging in user:', userId);
    const { customerInfo } = await Purchases.logIn(userId);
    console.log('[RevenueCat] User logged in:', customerInfo);
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Failed to log in user:', error);
    return null;
  }
}

export async function logoutUser(): Promise<CustomerInfo | null> {
  try {
    console.log('[RevenueCat] Logging out user...');
    const customerInfo = await Purchases.logOut();
    console.log('[RevenueCat] User logged out:', customerInfo);
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Failed to log out user:', error);
    return null;
  }
}

export function hasPremiumAccess(customerInfo: CustomerInfo | null): boolean {
  if (!customerInfo) return false;
  return customerInfo.entitlements.active['premium'] !== undefined;
}
