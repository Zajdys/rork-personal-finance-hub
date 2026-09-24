import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAppLockPin, disableAppLock } from '@/lib/app-lock-storage';

export const BIOMETRICS_ENABLED_KEY = 'biometrics_enabled';

// On web, SecureStore is not available — fall back to AsyncStorage (non-sensitive flag only).

export async function getBiometricsEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') {
    const v = await AsyncStorage.getItem(BIOMETRICS_ENABLED_KEY);
    return v === 'true';
  }
  const v = await SecureStore.getItemAsync(BIOMETRICS_ENABLED_KEY);
  return v === 'true';
}

export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  if (Platform.OS === 'web') {
    if (enabled) {
      await AsyncStorage.setItem(BIOMETRICS_ENABLED_KEY, 'true');
    } else {
      await AsyncStorage.removeItem(BIOMETRICS_ENABLED_KEY);
    }
    return;
  }
  if (enabled) {
    await SecureStore.setItemAsync(BIOMETRICS_ENABLED_KEY, 'true');
  } else {
    await SecureStore.deleteItemAsync(BIOMETRICS_ENABLED_KEY);
  }
}

/** Smaže PIN i biometrický příznak (obnovení PIN / odhlášení). Jen lokálně. */
export async function clearDeviceSecurity(): Promise<void> {
  await Promise.all([disableAppLock(), clearAppLockPin(), setBiometricsEnabled(false)]);
}
