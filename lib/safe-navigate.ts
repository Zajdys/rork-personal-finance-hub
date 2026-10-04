/**
 * Debounce opakovaného router.push/replace na stejný cíl (~500 ms).
 * Ochrana proti dvojkliku na kartách / řádcích seznamu.
 */
import { router, type Href } from 'expo-router';

const DEBOUNCE_MS = 500;

let lastKey = '';
let lastAt = 0;

function hrefKey(href: Href): string {
  if (typeof href === 'string') return href;
  try {
    return JSON.stringify(href);
  } catch {
    return String(href);
  }
}

function shouldSkip(key: string): boolean {
  const now = Date.now();
  if (key === lastKey && now - lastAt < DEBOUNCE_MS) return true;
  lastKey = key;
  lastAt = now;
  return false;
}

export function safePush(href: Href): void {
  const key = `push:${hrefKey(href)}`;
  if (shouldSkip(key)) return;
  router.push(href);
}

export function safeReplace(href: Href): void {
  const key = `replace:${hrefKey(href)}`;
  if (shouldSkip(key)) return;
  router.replace(href);
}

/** Test/reset — nepoužívat v produkční UI. */
export function __resetSafeNavigateForTests(): void {
  lastKey = '';
  lastAt = 0;
}
