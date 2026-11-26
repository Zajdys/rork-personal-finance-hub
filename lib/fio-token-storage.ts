/**
 * Fio API token — SecureStore (šifrované na zařízení).
 * Jednorázová migrace z AsyncStorage.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const FIO_TOKEN_KEY = 'fio_token';

const LEGACY_ASYNC_KEY = 'fio_token';

async function secureGet(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(LEGACY_ASYNC_KEY);
  }
  return SecureStore.getItemAsync(FIO_TOKEN_KEY);
}

async function secureSet(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(LEGACY_ASYNC_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(FIO_TOKEN_KEY, token);
}

async function secureDelete(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(LEGACY_ASYNC_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(FIO_TOKEN_KEY);
}

/**
 * Jednorázově: AsyncStorage → SecureStore, pak AsyncStorage smazat.
 * Volat při startu aplikace (před čtením tokenu).
 */
export async function migrateFioTokenFromAsyncStorage(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const legacy = await AsyncStorage.getItem(LEGACY_ASYNC_KEY);
    if (!legacy?.trim()) return;
    const existing = await SecureStore.getItemAsync(FIO_TOKEN_KEY);
    if (!existing?.trim()) {
      await SecureStore.setItemAsync(FIO_TOKEN_KEY, legacy.trim());
    }
    await AsyncStorage.removeItem(LEGACY_ASYNC_KEY);
  } catch (e) {
    console.warn('[fio-token] migrate', e);
  }
}

export async function getFioToken(): Promise<string | null> {
  await migrateFioTokenFromAsyncStorage();
  const v = await secureGet();
  const trimmed = v?.trim() ?? '';
  return trimmed ? trimmed : null;
}

export async function setFioToken(token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) {
    await clearFioToken();
    return;
  }
  await secureSet(trimmed);
  // Po zápisu do SecureStore už AsyncStorage nechceme.
  if (Platform.OS !== 'web') {
    try {
      await AsyncStorage.removeItem(LEGACY_ASYNC_KEY);
    } catch {
      /* ignore */
    }
  }
}

export async function clearFioToken(): Promise<void> {
  await secureDelete();
  try {
    await AsyncStorage.removeItem(LEGACY_ASYNC_KEY);
  } catch {
    /* ignore */
  }
}
