/** YYYY-MM-DD helpers for transaction dates (local calendar day). */

export function toYyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Normalise stored value: YYYY-MM-DD string or legacy Date / ISO string. */
export function transactionDateYmd(date: string | Date): string {
  if (typeof date === 'string') {
    const s = date.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '1970-01-01' : toYyyyMmDd(d);
  }
  return toYyyyMmDd(date);
}

export function ymdToLocalDateNoon(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function transactionToLocalDateNoon(legacy: string | Date): Date {
  if (typeof legacy === 'string') {
    const s = legacy.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return ymdToLocalDateNoon(s);
  }
  const d = new Date(legacy as Date);
  if (Number.isNaN(d.getTime())) return new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

export function dayOfMonthFromYmd(ymd: string): number {
  const p = ymd.split('-');
  if (p.length >= 3) return parseInt(p[2], 10);
  return 1;
}

/**
 * Datum platby kartou: `bookingDate` (valuta), jinak fallback na `date` (zaúčtování).
 * Pro předplatné (den v měsíci / další platba) preferuj booking_date.
 */
export function transactionBookingOrDateYmd(t: {
  date: string | Date;
  bookingDate?: string | null;
}): string {
  const booking = t.bookingDate != null ? String(t.bookingDate).trim() : '';
  if (booking && /^\d{4}-\d{2}-\d{2}/.test(booking)) {
    return transactionDateYmd(booking.slice(0, 10));
  }
  return transactionDateYmd(t.date);
}

export function compareTxBillingDateAsc(
  a: { date: string | Date; bookingDate?: string | null },
  b: { date: string | Date; bookingDate?: string | null },
): number {
  return transactionBookingOrDateYmd(a).localeCompare(transactionBookingOrDateYmd(b));
}

export function compareTxDateDesc(a: { date: string | Date }, b: { date: string | Date }): number {
  return transactionDateYmd(b.date).localeCompare(transactionDateYmd(a.date));
}

export function compareTxDateAsc(a: { date: string | Date }, b: { date: string | Date }): number {
  return transactionDateYmd(a.date).localeCompare(transactionDateYmd(b.date));
}

/** Zobrazení kalendářního dne transakce v češtině, např. „12. 2. 2026“. */
export function formatTransactionDateCs(date: string | Date): string {
  const ymd = transactionDateYmd(date);
  return ymdToLocalDateNoon(ymd).toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

/** Lokální kalendářní měsíc ve formátu YYYY-MM. */
export function yyyyMmLocalFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function yyyyMmLocalToday(): string {
  return yyyyMmLocalFromDate(new Date());
}

/** Posune YYYY-MM o delta kalendářních měsíců (delta může být záporné). */
export function addMonthsToYyyyMm(ym: string, delta: number): string {
  const [yStr, mStr] = ym.split('-');
  const y = parseInt(yStr ?? '', 10);
  const m0 = parseInt(mStr ?? '', 10) - 1;
  if (!Number.isFinite(y) || !Number.isFinite(m0)) return yyyyMmLocalToday();
  const d = new Date(y, m0 + delta, 1);
  return yyyyMmLocalFromDate(d);
}
