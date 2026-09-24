import { router, type Href } from 'expo-router';

/** Výchozí fallback, když ve stacku není kam jít zpět. */
export const DEFAULT_BACK_FALLBACK = '/(tabs)' as const;

/**
 * Bezpečný návrat: router.back() pokud existuje historie, jinak replace na fallback.
 * Používej u všech „Zpět“ tlačítek (vlastních i header).
 */
export function safeGoBack(fallback: Href = DEFAULT_BACK_FALLBACK): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
