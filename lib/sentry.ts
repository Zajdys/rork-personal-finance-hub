/**
 * Sentry — hlášení pádů (EU region, org moneybuddy-as, projekt moneybuddy).
 * Zásady: žádná finanční ani osobní data. Jen produkce (ne __DEV__), bez replay a bez tracingu.
 * DSN: EAS env EXPO_PUBLIC_SENTRY_DSN (environment production).
 */
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';
const appVariant = (Constants.expoConfig?.extra as { appVariant?: string } | undefined)?.appVariant ?? 'development';

export const SENTRY_ENABLED = !__DEV__ && dsn.length > 0 && appVariant === 'production';

/** Odstraní z textu e-maily, IBAN / čísla účtů a delší čísla (částky, tokeny). */
function scrub(text: string | undefined): string | undefined {
  if (!text) return text;
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, '[iban]')
    .replace(/\b\d{0,6}-?\d{2,10}\/\d{4}\b/g, '[ucet]')
    .replace(/\b\d{5,}\b/g, '[cislo]');
}

if (SENTRY_ENABLED) {
  Sentry.init({
    dsn,
    environment: appVariant,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enableAutoSessionTracking: true,
    attachScreenshot: false,
    attachViewHierarchy: false,
    maxBreadcrumbs: 30,
    beforeBreadcrumb(breadcrumb) {
      // Konzole může obsahovat transakce a částky → neposílat.
      if (breadcrumb.category === 'console') return null;
      if (breadcrumb.data && typeof breadcrumb.data.url === 'string') {
        breadcrumb.data.url = breadcrumb.data.url.split('?')[0];
      }
      breadcrumb.message = scrub(breadcrumb.message);
      return breadcrumb;
    },
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
        if (event.request.url) event.request.url = event.request.url.split('?')[0];
      }
      event.message = scrub(event.message);
      event.exception?.values?.forEach((v) => {
        v.value = scrub(v.value);
      });
      return event;
    },
  });
}

/** Ruční nahlášení chyby (error boundaries). Bez extra dat. */
export function reportError(error: unknown): void {
  if (!SENTRY_ENABLED) return;
  try {
    Sentry.captureException(error);
  } catch {
    /* nikdy neshodit appku kvůli reportingu */
  }
}

export { Sentry };
