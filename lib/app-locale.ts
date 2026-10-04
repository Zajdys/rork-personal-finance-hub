import type { Language } from '@/store/language-store';
import { transactionDateYmd, ymdToLocalDateNoon } from '@/lib/transaction-date';

export function appLocale(language: Language): string {
  return language === 'en' ? 'en-US' : 'cs-CZ';
}

/** Zobrazí YYYY-MM jako „June 2026“ / „červen 2026“ (první písmeno velké). */
export function formatYyyyMmTitle(ym: string, locale: string): string {
  const [yStr, mStr] = ym.split('-');
  const y = parseInt(yStr ?? '', 10);
  const mo = parseInt(mStr ?? '', 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return ym;
  const d = new Date(y, mo - 1, 1);
  const s = d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatTransactionDate(date: string | Date, locale: string): string {
  const ymd = transactionDateYmd(date);
  return ymdToLocalDateNoon(ymd).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

export function formatMonthLong(month1to12: number, locale: string): string {
  if (month1to12 < 1 || month1to12 > 12) return '';
  return new Date(2000, month1to12 - 1, 1).toLocaleDateString(locale, { month: 'long' });
}

export function formatMonthShort(month1to12: number, locale: string): string {
  if (month1to12 < 1 || month1to12 > 12) return '';
  return new Date(2000, month1to12 - 1, 1).toLocaleDateString(locale, { month: 'short' });
}
