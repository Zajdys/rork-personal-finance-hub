/**
 * App-lock helpers — all sensitive data stored in SecureStore (encrypted on-device).
 * On web, falls back to AsyncStorage for the non-secret boolean flags only.
 * The PIN itself is never stored on web.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const APP_LOCK_ENABLED_KEY = 'app_lock_enabled';
export const APP_LOCK_PIN_KEY = 'app_lock_pin';

// ─── Enabled flag ────────────────────────────────────────────────────────────

export async function getAppLockEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') {
    const v = await AsyncStorage.getItem(APP_LOCK_ENABLED_KEY);
    return v === 'true';
  }
  const v = await SecureStore.getItemAsync(APP_LOCK_ENABLED_KEY);
  return v === 'true';
}

export async function setAppLockEnabled(enabled: boolean): Promise<void> {
  if (Platform.OS === 'web') {
    if (enabled) {
      await AsyncStorage.setItem(APP_LOCK_ENABLED_KEY, 'true');
    } else {
      await AsyncStorage.removeItem(APP_LOCK_ENABLED_KEY);
    }
    return;
  }
  if (enabled) {
    await SecureStore.setItemAsync(APP_LOCK_ENABLED_KEY, 'true');
  } else {
    await SecureStore.deleteItemAsync(APP_LOCK_ENABLED_KEY);
  }
}

// ─── PIN ─────────────────────────────────────────────────────────────────────

export async function getAppLockPin(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  return SecureStore.getItemAsync(APP_LOCK_PIN_KEY);
}

export async function hasAppLockPin(): Promise<boolean> {
  const pin = await getAppLockPin();
  // Strict: only a real 4+ digit PIN counts — never treat empty/null as set
  return typeof pin === 'string' && /^\d{4,}$/.test(pin);
}

/** Zámek appky smí běžet výhradně když v SecureStore existuje PIN. */
export async function shouldEngageAppLock(): Promise<boolean> {
  return hasAppLockPin();
}

export async function setAppLockPin(pin: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.setItemAsync(APP_LOCK_PIN_KEY, pin);
}

export async function clearAppLockPin(): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(APP_LOCK_PIN_KEY);
}

// ─── Full disable (clear both flag and PIN) ───────────────────────────────────

export async function disableAppLock(): Promise<void> {
  await Promise.all([setAppLockEnabled(false), clearAppLockPin()]);
}
