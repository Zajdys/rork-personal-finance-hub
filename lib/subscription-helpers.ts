/** Den v měsíci 1–31 (neplatné → 1). */
function clampDueDay(dayOfMonth: number): number {
  const n = Math.floor(Number(dayOfMonth));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(31, n);
}

/**
 * Další N dat plateb předplatného (den v měsíci).
 * due_day 31 v měsíci s 30 dny / únoru → poslední den měsíce (ne přeskočení).
 * Porovnání podle kalendářního dne (≥ dnes), ne podle hodin.
 */
export function nextBillingDatesAfter(from: Date, dayOfMonth: number, count: number): Date[] {
  const out: Date[] = [];
  const dueDay = clampDueDay(dayOfMonth);
  let y = from.getFullYear();
  let mo = from.getMonth();
  const fromDayStart = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  for (let step = 0; step < 48 && out.length < count; step++) {
    const lastDay = new Date(y, mo + 1, 0).getDate();
    const d = Math.min(dueDay, lastDay);
    const payDayStart = new Date(y, mo, d).getTime();
    if (payDayStart >= fromDayStart) {
      out.push(new Date(y, mo, d, 12, 0, 0, 0));
    }
    mo += 1;
    if (mo > 11) {
      mo = 0;
      y += 1;
    }
  }
  return out;
}

/** Počet kalendářních dní do příští platby (0 = dnes je den platby). */
export function daysUntilNextPayment(dayOfMonth: number, from = new Date()): number {
  const dates = nextBillingDatesAfter(from, dayOfMonth, 1);
  if (!dates.length) return 0;
  const pay = dates[0]!;
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(pay.getFullYear(), pay.getMonth(), pay.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Den před platbou v 9:00 — text notifikace typu „zítra“. */
export function reminderDayBeforePaymentAt9am(paymentDate: Date): Date {
  const r = new Date(paymentDate);
  r.setDate(r.getDate() - 1);
  r.setHours(9, 0, 0, 0);
  return r;
}

/** Dva dny před platbou v 9:00 — odpovídá plánu „2 dny před“. */
export function reminderTwoDaysBeforePaymentAt9am(paymentDate: Date): Date {
  const r = new Date(paymentDate);
  r.setDate(r.getDate() - 2);
  r.setHours(9, 0, 0, 0);
  return r;
}

export function subscriptionCountsInTotal(s: { active: boolean; paused?: boolean }): boolean {
  return Boolean(s.active && !s.paused);
}

export type SubscriptionUiState = 'on' | 'paused' | 'off';

export function getSubscriptionUiState(s: { active: boolean; paused?: boolean }): SubscriptionUiState {
  if (!s.active) return 'off';
  if (s.paused) return 'paused';
  return 'on';
}

/** Cyklus: ON → PAUSED → OFF → ON */
export function cycleSubscriptionUiState(s: { active: boolean; paused?: boolean }): {
  active: boolean;
  paused: boolean;
} {
  const st = getSubscriptionUiState(s);
  if (st === 'on') return { active: true, paused: true };
  if (st === 'paused') return { active: false, paused: false };
  return { active: true, paused: false };
}
