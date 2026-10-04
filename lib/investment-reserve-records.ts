import { supabase } from '@/lib/supabase';

export type InvestmentRecordRow = {
  id: string;
  user_id: string;
  amount: number;
  note: string | null;
  date: string;
  created_at: string;
};

export type ReserveRecordRow = {
  id: string;
  user_id: string;
  amount: number;
  note: string | null;
  date: string;
  created_at: string;
};

function mapInvestment(rows: unknown[] | null): InvestmentRecordRow[] {
  if (!rows?.length) return [];
  return rows.map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: String(x.id),
      user_id: String(x.user_id),
      amount: Number(x.amount) || 0,
      note: x.note == null ? null : String(x.note),
      date: String(x.date).slice(0, 10),
      created_at: String(x.created_at ?? ''),
    };
  });
}

function mapReserve(rows: unknown[] | null): ReserveRecordRow[] {
  if (!rows?.length) return [];
  return rows.map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: String(x.id),
      user_id: String(x.user_id),
      amount: Number(x.amount) || 0,
      note: x.note == null ? null : String(x.note),
      date: String(x.date).slice(0, 10),
      created_at: String(x.created_at ?? ''),
    };
  });
}

export async function fetchInvestmentRecords(userId: string): Promise<InvestmentRecordRow[]> {
  const { data, error } = await supabase
    .from('investment_records')
    .select('id, user_id, amount, note, date, created_at')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) {
    console.warn('[investment_records]', error.message);
    return [];
  }
  return mapInvestment((data as unknown[]) ?? []);
}

export async function fetchReserveRecords(userId: string): Promise<ReserveRecordRow[]> {
  const { data, error } = await supabase
    .from('reserve_records')
    .select('id, user_id, amount, note, date, created_at')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) {
    console.warn('[reserve_records]', error.message);
    return [];
  }
  return mapReserve((data as unknown[]) ?? []);
}

export async function insertInvestmentRecord(params: {
  userId: string;
  amount: number;
  note: string | null;
  date: string;
}): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('investment_records').insert({
    user_id: params.userId,
    amount: params.amount,
    note: params.note,
    date: params.date,
  });
  return { error: error ? new Error(error.message) : null };
}

export async function insertReserveRecord(params: {
  userId: string;
  amount: number;
  note: string | null;
  date: string;
}): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('reserve_records').insert({
    user_id: params.userId,
    amount: params.amount,
    note: params.note,
    date: params.date,
  });
  return { error: error ? new Error(error.message) : null };
}

export function sumAmounts<T extends { amount: number }>(rows: T[]): number {
  return rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0);
}

export function sumInCalendarMonth<T extends { date: string; amount: number }>(rows: T[], ymPrefix: string): number {
  return rows
    .filter((r) => typeof r.date === 'string' && r.date.startsWith(ymPrefix))
    .reduce((s, r) => s + r.amount, 0);
}

/** První den měsíce `ym` (YYYY-MM) a první den následujícího měsíce (pro `date < endExclusive`). */
export function monthDateRangeExclusive(ym: string): { start: string; endExclusive: string } {
  const [yStr, mStr] = ym.split('-');
  const y = parseInt(yStr ?? '0', 10);
  const m = parseInt(mStr ?? '1', 10);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const next = new Date(y, m - 1, 1);
  next.setMonth(next.getMonth() + 1);
  const ny = next.getFullYear();
  const nm = next.getMonth() + 1;
  const endExclusive = `${ny}-${String(nm).padStart(2, '0')}-01`;
  return { start, endExclusive };
}

export function recordsInCalendarMonth<T extends { date: string }>(rows: T[], ymPrefix: string): T[] {
  return rows.filter((r) => typeof r.date === 'string' && r.date.startsWith(ymPrefix));
}

/** Sloučení poznámek z více řádků v měsíci (úprava / zobrazení). */
export function combinedNoteForMonth<T extends { date: string; note: string | null }>(rows: T[], ymPrefix: string): string {
  const parts = recordsInCalendarMonth(rows, ymPrefix)
    .map((r) => (r.note ?? '').trim())
    .filter(Boolean);
  return [...new Set(parts)].join(' · ');
}

export async function deleteInvestmentRecordsInMonth(
  userId: string,
  ym: string,
): Promise<{ error: Error | null }> {
  const { start, endExclusive } = monthDateRangeExclusive(ym);
  const { error } = await supabase
    .from('investment_records')
    .delete()
    .eq('user_id', userId)
    .gte('date', start)
    .lt('date', endExclusive);
  return { error: error ? new Error(error.message) : null };
}

export async function deleteReserveRecordsInMonth(
  userId: string,
  ym: string,
): Promise<{ error: Error | null }> {
  const { start, endExclusive } = monthDateRangeExclusive(ym);
  const { error } = await supabase
    .from('reserve_records')
    .delete()
    .eq('user_id', userId)
    .gte('date', start)
    .lt('date', endExclusive);
  return { error: error ? new Error(error.message) : null };
}

/** Smaže vše v měsíci a případně vloží jeden souhrnný řádek (datum 1. den měsíce). */
export async function replaceInvestmentMonthAggregate(params: {
  userId: string;
  ym: string;
  amount: number;
  note: string | null;
}): Promise<{ error: Error | null }> {
  const del = await deleteInvestmentRecordsInMonth(params.userId, params.ym);
  if (del.error) return del;
  if (params.amount <= 0) return { error: null };
  const { start } = monthDateRangeExclusive(params.ym);
  return insertInvestmentRecord({
    userId: params.userId,
    amount: params.amount,
    note: params.note,
    date: start,
  });
}

export async function replaceReserveMonthAggregate(params: {
  userId: string;
  ym: string;
  amount: number;
  note: string | null;
}): Promise<{ error: Error | null }> {
  const del = await deleteReserveRecordsInMonth(params.userId, params.ym);
  if (del.error) return del;
  if (params.amount <= 0) return { error: null };
  const { start } = monthDateRangeExclusive(params.ym);
  return insertReserveRecord({
    userId: params.userId,
    amount: params.amount,
    note: params.note,
    date: start,
  });
}

/** Měsíce z posledních 12, které mají data, plus aktuální měsíc vždy. */
/** Počet kalendářních měsíců (YYYY-MM), ve kterých existuje aspoň jeden záznam. */
export function countDistinctCalendarMonthsWithRecords<T extends { date: string }>(rows: T[]): number {
  const yms = new Set<string>();
  for (const r of rows) {
    if (typeof r.date === 'string' && r.date.length >= 7) {
      yms.add(r.date.slice(0, 7));
    }
  }
  return yms.size;
}

export function filterHistoryBuckets(
  buckets: MonthBucket[],
  currentYm: string,
  records: { date: string }[],
): MonthBucket[] {
  const withData = new Set<string>();
  for (const r of records) {
    if (typeof r.date === 'string' && r.date.length >= 7) {
      const ym = r.date.slice(0, 7);
      withData.add(ym);
    }
  }
  return buckets.filter((b) => b.ym === currentYm || withData.has(b.ym));
}

export type MonthBucket = { ym: string; label: string };

/** Od aktuálního měsíce zpět 12 měsíců (nejdřív aktuální). */
export function buildLast12MonthBuckets(): MonthBucket[] {
  const d = new Date();
  const res: MonthBucket[] = [];
  for (let i = 0; i < 12; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const y = x.getFullYear();
    const m = x.getMonth() + 1;
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    const label = x.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
    res.push({ ym, label });
  }
  return res;
}
