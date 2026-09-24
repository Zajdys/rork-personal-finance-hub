import { useLanguageStore } from '@/store/language-store';
import { isSessionLostError } from '@/lib/supabase-session';
import { logAndGetUserFacingError, toUserFacingMessage } from '@/lib/user-facing-error';

export const CUSTOM_CATEGORY_EMOJI_OPTIONS = [
  '💧',
  '🔥',
  '🌿',
  '🏋️',
  '🎮',
  '🐾',
  '🚿',
  '🧹',
  '🪴',
  '📦',
  '🧺',
  '🍽️',
  '🛒',
  '💊',
  '🎓',
  '✈️',
  '🎁',
  '🏊',
  '🚗',
  '🔧',
  '🏠',
  '💡',
  '📱',
  '💻',
  '🎵',
  '🎬',
  '📚',
  '🌍',
  '🏖️',
  '⛽',
  '🚂',
  '🚌',
  '🛵',
  '🚲',
  '🏥',
  '💈',
  '🐕',
  '🐈',
  '🌺',
  '🍕',
  '🍔',
  '☕',
  '🍷',
  '🧃',
  '🛁',
  '🛏️',
  '🪑',
  '🖥️',
  '📷',
  '🎸',
  '⚽',
  '🎾',
  '🏀',
  '🎯',
  '🧘',
  '💪',
  '🧴',
  '🪥',
  '🧻',
  '🛠️',
  '🔑',
  '📬',
  '🎪',
  '🏪',
  '🏦',
  '⚡',
  '🌊',
  '🌙',
] as const;

export const LOAD_TIMEOUT_MS = 15000;

export const RECURRING_EXPENSE_ORDER_KEY = 'recurring_expense_order';

export function formatSupabaseError(err: {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
} | null): string {
  const unknown = useLanguageStore.getState().t('errorBoundaryUnknown');
  if (!err) return unknown;
  if (isSessionLostError(err)) return unknown;
  console.log('[household] supabase error raw:', err);
  const msg = err.message ?? '';
  if (/network request failed|failed to fetch|typeerror|timeout|gateway|offline/i.test(msg)) {
    return toUserFacingMessage(err);
  }
  return msg.trim() || unknown;
}

export function friendlyCatchMessage(context: string, e: unknown): string {
  return logAndGetUserFacingError(context, e);
}

export function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}: časový limit ${ms} ms`)), ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}
