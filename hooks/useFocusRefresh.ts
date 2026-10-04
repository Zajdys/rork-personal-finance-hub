import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

export type FocusRefreshOpts = {
  /** Bypass the min-interval gate (pull-to-refresh, post-write). */
  force?: boolean;
};

type UseFocusRefreshOptions = {
  /** Delay after focus before loading. Cancelled if focus is lost. Default 300. */
  debounceMs?: number;
  /** Min ms between successful loads unless `force`. Default 30_000. */
  minIntervalMs?: number;
  /** When false, focus does not schedule a load (`refresh` still works). */
  enabled?: boolean;
  /**
   * When this value changes while the screen is focused, refresh immediately
   * with `force: true` (no debounce). Use for route params / filters that used
   * to re-trigger `useFocusEffect` via callback deps.
   */
  focusKey?: unknown;
};

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_MIN_INTERVAL_MS = 30_000;

/**
 * Anti-spam for focus-driven network loads:
 * - debounce after focus (blur cancels the timer)
 * - min interval between successful loads
 * - `refresh({ force: true })` bypasses the interval and runs immediately
 */
export function useFocusRefresh(
  onRefresh: (opts?: FocusRefreshOpts) => void | Promise<void>,
  options?: UseFocusRefreshOptions,
): {
  refresh: (opts?: FocusRefreshOpts) => Promise<void>;
  /** Mark data as freshly loaded (e.g. after an initial mount fetch outside this hook). */
  notifyRefreshed: () => void;
} {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const lastSuccessAtRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFocusedRef = useRef(false);
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const minIntervalMs = options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const enabled = options?.enabled ?? true;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const focusKey = options?.focusKey;
  const prevFocusKeyRef = useRef(focusKey);
  const focusKeyInitializedRef = useRef(false);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current != null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const runRefresh = useCallback(
    async (opts?: FocusRefreshOpts) => {
      const force = opts?.force === true;
      if (!force) {
        const last = lastSuccessAtRef.current;
        if (last > 0 && Date.now() - last < minIntervalMs) {
          return;
        }
      }
      try {
        await onRefreshRef.current(opts);
        lastSuccessAtRef.current = Date.now();
      } catch (e) {
        // Nepropouštět síťové chyby jako unhandled rejection / red box.
        console.warn('[useFocusRefresh] onRefresh failed', e);
      }
    },
    [minIntervalMs],
  );

  const refresh = useCallback(
    async (opts?: FocusRefreshOpts) => {
      clearDebounce();
      await runRefresh(opts);
    },
    [clearDebounce, runRefresh],
  );

  const notifyRefreshed = useCallback(() => {
    lastSuccessAtRef.current = Date.now();
  }, []);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      if (!enabledRef.current) {
        return () => {
          isFocusedRef.current = false;
          clearDebounce();
        };
      }

      clearDebounce();
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void runRefresh({ force: false }).catch(() => {
          // Screen callbacks typically surface their own errors.
        });
      }, debounceMs);

      return () => {
        isFocusedRef.current = false;
        clearDebounce();
      };
    }, [clearDebounce, debounceMs, runRefresh]),
  );

  useEffect(() => {
    if (!focusKeyInitializedRef.current) {
      focusKeyInitializedRef.current = true;
      prevFocusKeyRef.current = focusKey;
      return;
    }
    if (Object.is(prevFocusKeyRef.current, focusKey)) return;
    prevFocusKeyRef.current = focusKey;
    if (!isFocusedRef.current || !enabledRef.current) return;
    void refresh({ force: true }).catch(() => {});
  }, [focusKey, refresh]);

  return { refresh, notifyRefreshed };
}
