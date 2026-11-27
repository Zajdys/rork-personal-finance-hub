/**
 * Systémová výzva k hodnocení (App Store / Google Play).
 * Jen StoreReview API — žádné vlastní „Líbí se ti appka?“ okno.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';

const FIRST_INSTALL_KEY = 'review_first_install_at_v1';
const LAST_PROMPT_KEY = 'review_last_prompt_at_v1';

const MIN_INSTALL_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const MIN_PROMPT_GAP_MS = 60 * 24 * 60 * 60 * 1000;

function parseIsoMs(raw: string | null): number | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

/** Zaznamená první spuštění (idempotentní). Volat při startu appky — bez requestReview. */
export async function ensureReviewFirstInstallDate(): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(FIRST_INSTALL_KEY);
    if (existing) return;
    await AsyncStorage.setItem(FIRST_INSTALL_KEY, new Date().toISOString());
  } catch (e) {
    console.warn('[review] first install date', e);
  }
}

/**
 * Požádá o systémové hodnocení, pokud:
 * - platforma umí StoreReview
 * - appka běží ≥ 3 dny od prvního spuštění
 * - od poslední výzvy uplynulo ≥ 60 dní
 */
export async function maybeAskForReview(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await ensureReviewFirstInstallDate();

    const firstMs = parseIsoMs(await AsyncStorage.getItem(FIRST_INSTALL_KEY));
    if (firstMs == null) return;
    const now = Date.now();
    if (now - firstMs < MIN_INSTALL_AGE_MS) return;

    const lastMs = parseIsoMs(await AsyncStorage.getItem(LAST_PROMPT_KEY));
    if (lastMs != null && now - lastMs < MIN_PROMPT_GAP_MS) return;

    const available = await StoreReview.isAvailableAsync();
    if (!available) return;

    await StoreReview.requestReview();
    await AsyncStorage.setItem(LAST_PROMPT_KEY, new Date().toISOString());
  } catch (e) {
    console.warn('[review] maybeAskForReview', e);
  }
}
