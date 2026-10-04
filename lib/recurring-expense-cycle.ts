/** Frekvence pravidelných výdajů domácnosti (hodnoty v DB). */
export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'biannual' | 'yearly';

export const RECURRING_FREQUENCIES: readonly RecurringFrequency[] = [
  'weekly',
  'monthly',
  'quarterly',
  'biannual',
  'yearly',
];

export function normalizeFrequency(raw: string | null | undefined): RecurringFrequency {
  const s = String(raw || '').toLowerCase();
  if (s === 'weekly' || s === 'monthly' || s === 'quarterly' || s === 'biannual' || s === 'yearly') {
    return s;
  }
  return 'monthly';
}

export function formatMonthYm(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Evropský týden od pondělí — pro porovnání „stejný týden“. */
export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function isSameCalendarWeek(a: Date, b: Date): boolean {
  return startOfWeekMonday(a).getTime() === startOfWeekMonday(b).getTime();
}

/** Čtvrtletí 0–3 (led–bře, dub–čer, …). */
export function quarterIndex(month1to12: number): number {
  return Math.floor((month1to12 - 1) / 3);
}

/** Měsíce splátek podle kotvy (každé 3 měsíce). */
export function quarterPaymentMonths(anchorMonth1to12: number): number[] {
  const m = anchorMonth1to12;
  return [0, 1, 2, 3].map((k) => {
    let x = m + k * 3;
    while (x > 12) x -= 12;
    return x;
  });
}

/** Který měsíc splátky spadá do daného kalendářního čtvrtletí (0–3). */
export function quarterPaymentMonthForCalendarQuarter(anchorMonth: number, calendarQuarterIndex: number): number {
  const months = quarterPaymentMonths(anchorMonth);
  const low = calendarQuarterIndex * 3 + 1;
  const high = low + 2;
  const found = months.find((mm) => mm >= low && mm <= high);
  return found ?? months[calendarQuarterIndex % 4];
}

/** Pololetí: měsíc kotvy a +6 měsíců (mod 12). */
export function biannualPaymentMonths(anchorMonth1to12: number): [number, number] {
  const a = anchorMonth1to12;
  let b = a + 6;
  if (b > 12) b -= 12;
  return [a, b];
}

/** Který měsíc splátky v aktuálním pololetí kalendářního roku. */
export function biannualDueMonthForNow(now: Date, anchorMonth: number): number {
  const m = now.getMonth() + 1;
  const [x, y] = biannualPaymentMonths(anchorMonth);
  if (m <= 6) return x <= 6 ? x : y;
  return x > 6 ? x : y;
}

const MONTH_GENITIVE_CS = [
  'ledna',
  'února',
  'března',
  'dubna',
  'května',
  'června',
  'července',
  'srpna',
  'září',
  'října',
  'listopadu',
  'prosince',
];

const WEEKDAY_SHORT_CS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];

/** 1 = pondělí … 7 = neděle (uložení v DB pro týdenní). */
export function weekdayCsToJs(weekday1to7: number): number {
  if (weekday1to7 === 7) return 0;
  return weekday1to7;
}

export type RecurringCycleFields = {
  frequency: RecurringFrequency;
  dueDay: number;
  dueMonth: number | null;
  /** ISO 1=Po … 7=Ne; pro weekly. */
  dueWeekday?: number | null;
};

export type RecurringDueFields = RecurringCycleFields & {
  createdAt?: string | null;
};

/** Pole pro výpočet výskytů (frequency null → monthly). */
export type RecurringOccurrenceFields = {
  frequency: RecurringFrequency | string | null | undefined;
  dueDay?: number | null;
  dueWeekday?: number | null;
  dueMonth?: number | null;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIsoDate(y: number, month1to12: number, day: number): string {
  return `${y}-${pad2(month1to12)}-${pad2(day)}`;
}

export function jsDayToIsoWeekday(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

function monthMatchesEvery(
  month1to12: number,
  anchorMonth1to12: number,
  every: number,
): boolean {
  const diff = (((month1to12 - anchorMonth1to12) % every) + every) % every;
  return diff === 0;
}

function resolveIsoWeekday(f: RecurringOccurrenceFields): number | null {
  const wd = f.dueWeekday != null ? Number(f.dueWeekday) : NaN;
  if (Number.isInteger(wd) && wd >= 1 && wd <= 7) return wd;
  // Legacy: weekly ukládalo den týdne do due_day
  const dd = f.dueDay != null ? Number(f.dueDay) : NaN;
  if (Number.isInteger(dd) && dd >= 1 && dd <= 7) return dd;
  return null;
}

function resolveDueDayOfMonth(f: RecurringOccurrenceFields): number | null {
  const dd = f.dueDay != null ? Number(f.dueDay) : NaN;
  if (Number.isInteger(dd) && dd >= 1 && dd <= 31) return dd;
  return null;
}

/**
 * Jediný zdroj pravdy: data splatnosti položky v daném kalendářním měsíci (YYYY-MM-DD).
 */
export function listRecurringOccurrencesInMonth(
  f: RecurringOccurrenceFields,
  year: number,
  month1to12: number,
): string[] {
  if (!Number.isInteger(year) || month1to12 < 1 || month1to12 > 12) return [];
  const rawFreq = f.frequency;
  const frequency =
    rawFreq == null || String(rawFreq).trim() === ''
      ? 'monthly'
      : normalizeFrequency(String(rawFreq));
  const lastDay = new Date(year, month1to12, 0).getDate();

  if (frequency === 'weekly') {
    const want = resolveIsoWeekday(f);
    if (want == null) return [];
    const out: string[] = [];
    for (let day = 1; day <= lastDay; day++) {
      const js = new Date(year, month1to12 - 1, day).getDay();
      if (jsDayToIsoWeekday(js) === want) out.push(toIsoDate(year, month1to12, day));
    }
    return out;
  }

  const dueDay = resolveDueDayOfMonth(f);
  if (dueDay == null) return [];

  const anchor =
    f.dueMonth != null && Number(f.dueMonth) >= 1 && Number(f.dueMonth) <= 12
      ? Number(f.dueMonth)
      : null;

  if (frequency === 'quarterly') {
    if (anchor == null || !monthMatchesEvery(month1to12, anchor, 3)) return [];
  } else if (frequency === 'biannual') {
    if (anchor == null || !monthMatchesEvery(month1to12, anchor, 6)) return [];
  } else if (frequency === 'yearly') {
    if (anchor == null || month1to12 !== anchor) return [];
  }
  // monthly (a null→monthly): vždy jeden výskyt

  const day = Math.min(dueDay, lastDay);
  return [toIsoDate(year, month1to12, day)];
}

export function listRecurringOccurrencesForDate(
  f: RecurringOccurrenceFields,
  when = new Date(),
): string[] {
  return listRecurringOccurrencesInMonth(f, when.getFullYear(), when.getMonth() + 1);
}

function anchorMonth1to12(f: RecurringDueFields): number {
  if (f.dueMonth != null && f.dueMonth >= 1 && f.dueMonth <= 12) return f.dueMonth;
  if (f.createdAt) {
    const created = new Date(f.createdAt);
    if (!Number.isNaN(created.getTime())) return created.getMonth() + 1;
  }
  return 1;
}

function monthsSinceCreation(createdAt: string | null | undefined, now: Date): number {
  if (!createdAt) return 0;
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 0;
  return (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth());
}

/** Je výdaj splatný v aktuálním kalendářním měsíci a roce? */
export function isRecurringDueThisMonth(f: RecurringDueFields, now = new Date()): boolean {
  return listRecurringOccurrencesInMonth(f, now.getFullYear(), now.getMonth() + 1).length > 0;
}

/** „červen 2027“ pro šedý badge příští platby. */
export function formatRecurringNextPaymentLabel(
  f: RecurringDueFields,
  locale: string,
  from = new Date(),
): string {
  const d = nextDueDateForRecurring(f, from);
  const month = d.toLocaleDateString(locale, { month: 'long' });
  const capitalized = month.charAt(0).toUpperCase() + month.slice(1);
  return `${capitalized} ${d.getFullYear()}`;
}

/** Text pod názvem výdaje (frekvence • splatnost). */
export function formatRecurringScheduleSubtitle(f: RecurringCycleFields): string {
  const freq = normalizeFrequency(f.frequency);
  const dueDay = f.dueDay;
  const dm = f.dueMonth;
  const wd = resolveIsoWeekday(f);

  if (freq === 'weekly') {
    const weekday = wd ?? Math.min(Math.max(dueDay || 1, 1), 7);
    const js = weekdayCsToJs(weekday);
    const name = WEEKDAY_SHORT_CS[js];
    return `každý týden • ${name}`;
  }
  if (freq === 'monthly') {
    return `každý měsíc • ${dueDay}. den`;
  }
  if (freq === 'quarterly') {
    return `každé 3 měsíce • ${dueDay}. den`;
  }
  if (freq === 'biannual') {
    return `každých 6 měsíců • ${dueDay}. den`;
  }
  if (freq === 'yearly' && dm != null && dm >= 1 && dm <= 12) {
    return `každý rok • ${dueDay}. ${MONTH_GENITIVE_CS[dm - 1]}`;
  }
  if (freq === 'yearly') {
    return `každý rok • ${dueDay}. den`;
  }
  return `každý měsíc • ${dueDay}. den`;
}

/** Příští měsíční splatnost (den v měsíci), od `from` včetně. */
export function nextDueDateMonthly(dueDay: number, from = new Date()): Date {
  const y = from.getFullYear();
  const m = from.getMonth();
  const startOfToday = startOfDay(from);
  const lastThis = new Date(y, m + 1, 0).getDate();
  const dayThis = Math.min(dueDay, lastThis);
  const thisMonthDue = new Date(y, m, dayThis, 12, 0, 0, 0);
  if (thisMonthDue.getTime() >= startOfToday.getTime()) return thisMonthDue;
  const nextM = m === 11 ? 0 : m + 1;
  const nextY = m === 11 ? y + 1 : y;
  const lastNext = new Date(nextY, nextM + 1, 0).getDate();
  const dayNext = Math.min(dueDay, lastNext);
  return new Date(nextY, nextM, dayNext, 12, 0, 0, 0);
}

/** Příští výskyt dne v týdnu (1–7 Po–Ne), od `from` včetně. */
export function nextDueDateWeekly(weekday1to7: number, from = new Date()): Date {
  const want = weekdayCsToJs(Math.min(Math.max(weekday1to7, 1), 7));
  const start = startOfDay(from);
  for (let i = 0; i < 8; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d.getDay() === want) return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  }
  return new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0, 0);
}

function safeDayInMonth(y: number, monthIndex0: number, day: number): number {
  const last = new Date(y, monthIndex0 + 1, 0).getDate();
  return Math.min(day, last);
}

/** Příští splatnost pro čtvrtletní rozvrh (kotva měsíc + den). */
export function nextDueDateQuarterly(dueDay: number, anchorMonth: number, from = new Date()): Date {
  const months = quarterPaymentMonths(anchorMonth);
  const y = from.getFullYear();
  const start = startOfDay(from);
  let best: Date | null = null;
  for (let deltaY = 0; deltaY < 2; deltaY++) {
    const yy = y + deltaY;
    for (const mm of months) {
      const mi = mm - 1;
      const d = safeDayInMonth(yy, mi, dueDay);
      const cand = new Date(yy, mi, d, 12, 0, 0, 0);
      if (cand.getTime() >= start.getTime()) {
        if (!best || cand.getTime() < best.getTime()) best = cand;
      }
    }
  }
  return best ?? new Date(y, anchorMonth - 1, safeDayInMonth(y, anchorMonth - 1, dueDay), 12, 0, 0, 0);
}

export function nextDueDateBiannual(dueDay: number, anchorMonth: number, from = new Date()): Date {
  const [m1, m2] = biannualPaymentMonths(anchorMonth);
  const months = [m1, m2];
  const y = from.getFullYear();
  const start = startOfDay(from);
  let best: Date | null = null;
  for (let deltaY = 0; deltaY < 2; deltaY++) {
    const yy = y + deltaY;
    for (const mm of months) {
      const mi = mm - 1;
      const d = safeDayInMonth(yy, mi, dueDay);
      const cand = new Date(yy, mi, d, 12, 0, 0, 0);
      if (cand.getTime() >= start.getTime()) {
        if (!best || cand.getTime() < best.getTime()) best = cand;
      }
    }
  }
  return best ?? new Date(y, anchorMonth - 1, safeDayInMonth(y, anchorMonth - 1, dueDay), 12, 0, 0, 0);
}

export function nextDueDateYearly(dueDay: number, month1to12: number, from = new Date()): Date {
  const y = from.getFullYear();
  const start = startOfDay(from);
  const mi = month1to12 - 1;
  for (let deltaY = 0; deltaY < 2; deltaY++) {
    const yy = y + deltaY;
    const d = safeDayInMonth(yy, mi, dueDay);
    const cand = new Date(yy, mi, d, 12, 0, 0, 0);
    if (cand.getTime() >= start.getTime()) return cand;
  }
  return new Date(y, mi, safeDayInMonth(y, mi, dueDay), 12, 0, 0, 0);
}

export function nextDueDateForRecurring(
  f: RecurringCycleFields,
  from = new Date(),
): Date {
  const start = startOfDay(from);
  const startIso = toIsoDate(start.getFullYear(), start.getMonth() + 1, start.getDate());

  for (let i = 0; i < 24; i++) {
    const cursor = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    const dates = listRecurringOccurrencesInMonth(f, y, m);
    for (const iso of dates) {
      if (iso >= startIso) {
        const [yy, mm, dd] = iso.split('-').map((x) => parseInt(x, 10));
        return new Date(yy!, mm! - 1, dd!, 12, 0, 0, 0);
      }
    }
  }

  // Fallback — nemělo nastat
  return new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0, 0);
}

/** Konec dne pro dané ISO YYYY-MM-DD. */
function endOfIsoDate(iso: string): Date {
  const [yy, mm, dd] = iso.split('-').map((x) => parseInt(x, 10));
  return new Date(yy!, mm! - 1, dd!, 23, 59, 59, 999);
}

/** Konec dne splatnosti v aktuálním kalendářním období (pro overdue). */
export function periodDueEndDate(f: RecurringCycleFields, now: Date): Date {
  const dates = listRecurringOccurrencesInMonth(f, now.getFullYear(), now.getMonth() + 1);
  if (dates.length === 0) {
    // Není splatné tento měsíc — použij příští výskyt
    const next = nextDueDateForRecurring(f, now);
    return new Date(next.getFullYear(), next.getMonth(), next.getDate(), 23, 59, 59, 999);
  }
  // Poslední výskyt v měsíci (pro „období“)
  return endOfIsoDate(dates[dates.length - 1]!);
}

/**
 * Po termínu a nezaplaceno (pro „po splatnosti“ notifikaci).
 * Preferuj kontrolu per occurrence; tahle funkce bere konec posledního výskytu v měsíci.
 */
export function isOverdueUnpaidRecurring(
  f: RecurringCycleFields,
  isFullyPaid: boolean,
  now = new Date(),
): boolean {
  if (isFullyPaid) return false;
  const dates = listRecurringOccurrencesInMonth(f, now.getFullYear(), now.getMonth() + 1);
  if (dates.length === 0) return false;
  return now.getTime() > endOfIsoDate(dates[dates.length - 1]!).getTime();
}

/** Je konkrétní výskyt po splatnosti a nezaplacený? */
export function isOccurrenceOverdueUnpaid(
  dueDateIso: string,
  isPaid: boolean,
  now = new Date(),
): boolean {
  if (isPaid) return false;
  return now.getTime() > endOfIsoDate(dueDateIso).getTime();
}
