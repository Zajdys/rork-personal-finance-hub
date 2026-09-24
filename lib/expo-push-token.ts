import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Alert, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const PUSH_TOKEN_SETUP_FAILED_KEY = 'push_token_setup_failed';

export function getEasProjectId(): string | null {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | null)?.projectId;
  return typeof projectId === 'string' && projectId.length > 0 ? projectId : null;
}

export async function getPushTokenSetupFailed(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(PUSH_TOKEN_SETUP_FAILED_KEY);
    return v === 'true';
  } catch {
    return false;
  }
}

async function setPushTokenSetupFailed(failed: boolean): Promise<void> {
  try {
    if (failed) {
      await AsyncStorage.setItem(PUSH_TOKEN_SETUP_FAILED_KEY, 'true');
    } else {
      await AsyncStorage.removeItem(PUSH_TOKEN_SETUP_FAILED_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

/** Clock skew / JWT timing — často „JWT issued at future“. */
function isJwtTimingError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('issued at future') || m.includes('jwt');
}

async function upsertPushToken(
  userId: string,
  expoPushToken: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: expoPushToken,
      platform: Platform.OS,
    },
    { onConflict: 'user_id,expo_push_token' },
  );
  return { error: error ? { message: error.message } : null };
}

/**
 * Registruje Expo push token do Supabase `push_tokens` (vyžaduje udělené oprávnění).
 * @returns true při úspěchu; false při odmítnutí oprávnění / chybě (flag v AsyncStorage).
 */
export async function registerExpoPushTokenForUser(userId: string): Promise<boolean> {
  if (Platform.OS === 'web') return true;

  const Notifications = await import('expo-notifications');
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return false;
  }

  const projectId = getEasProjectId();
  if (!projectId) {
    console.warn('[push-token] chybí expo.extra.eas.projectId — getExpoPushTokenAsync selže na produkci');
    await setPushTokenSetupFailed(true);
    return false;
  }

  let expoPushToken: string | undefined;
  try {
    const { data: tokenData } = await Notifications.getExpoPushTokenAsync({ projectId });
    expoPushToken = tokenData?.trim();
  } catch (e) {
    console.warn('[push-token] getExpoPushTokenAsync selhalo', e);
    await setPushTokenSetupFailed(true);
    return false;
  }

  if (!expoPushToken) {
    console.warn('[push-token] prázdný Expo push token');
    await setPushTokenSetupFailed(true);
    return false;
  }

  let { error } = await upsertPushToken(userId, expoPushToken);

  if (error && isJwtTimingError(error.message)) {
    console.warn('[push-token] JWT/clock-skew při upsertu — refreshSession a jeden retry', error.message);
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.warn('[push-token] refreshSession selhalo', refreshError.message);
    } else {
      ({ error } = await upsertPushToken(userId, expoPushToken));
    }
  }

  if (error) {
    console.warn('[push-token] upsert selhalo', error.message);
    await setPushTokenSetupFailed(true);
    Alert.alert('Push notifikace', `Nepodařilo se uložit push token: ${error.message}`);
    return false;
  }

  await setPushTokenSetupFailed(false);
  return true;
}
