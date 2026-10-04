import { supabase } from '@/lib/supabase';
import { transactionDateYmd } from '@/lib/transaction-date';

export type ImportBatchDeleteTarget =
  | { kind: 'batch'; importBatchId: string }
  | { kind: 'legacy'; source: string; yearMonth: string };

export interface ImportBatchSummary {
  key: string;
  deleteTarget: ImportBatchDeleteTarget;
  source: string;
  bankLabel: string;
  periodLabel: string;
  transactionCount: number;
  importedAt: string;
  /** Volitelné — RPC agregace IDs nevrací; delete jde přes deleteTarget. */
  transactionIds: string[];
}

const BANK_SOURCE_LABELS: Record<string, string> = {
  raiffeisenbank: 'Raiffeisenbank',
  rb: 'Raiffeisenbank',
  csob: 'ČSOB',
  kb: 'Komerční banka',
  fio: 'Fio banka',
  airbank: 'Air Bank',
  cs: 'Česká spořitelna',
  csas: 'Česká spořitelna',
  moneta: 'MONETA Money Bank',
  mbank: 'mBank',
  revolut: 'Revolut',
  bank_import: 'Bankovní import',
};

function lastDayOfYm(ym: string): string {
  const [y, mo] = ym.split('-').map(Number);
  const last = new Date(y, mo, 0).getDate();
  return `${ym}-${String(last).padStart(2, '0')}`;
}

function isBankImportSource(source: string): boolean {
  const s = source.trim().toLowerCase();
  if (!s || s === 'manual') return false;
  return true;
}

export function bankLabelForImportSource(source: string): string {
  const key = source.trim().toLowerCase();
  return BANK_SOURCE_LABELS[key] ?? source;
}

function formatMonthYear(ym: string, locale: string): string {
  const [yStr, mStr] = ym.split('-');
  const y = parseInt(yStr ?? '', 10);
  const m = parseInt(mStr ?? '', 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatPeriodLabel(dateYmds: string[], locale: string): string {
  const yms = [...new Set(dateYmds.map((d) => transactionDateYmd(d).slice(0, 7)))].sort();
  if (yms.length === 0) return '';
  if (yms.length === 1) return formatMonthYear(yms[0]!, locale);
  return `${formatMonthYear(yms[0]!, locale)} – ${formatMonthYear(yms[yms.length - 1]!, locale)}`;
}

function serializeBatchKey(target: ImportBatchDeleteTarget): string {
  if (target.kind === 'batch') return `batch:${target.importBatchId}`;
  return `legacy:${target.source}:${target.yearMonth}`;
}

/** Řádek z RPC `import_batches_summary`. */
export type ImportBatchSummaryRpcRow = {
  import_batch_id: string | null;
  source: string;
  tx_count: number | string;
  min_date: string;
  max_date: string;
  min_created_at: string;
};

export function summariesFromRpcRows(
  rows: ImportBatchSummaryRpcRow[],
  locale: string,
): ImportBatchSummary[] {
  const summaries: ImportBatchSummary[] = [];

  for (const row of rows) {
    const source = String(row.source ?? '').trim();
    if (!isBankImportSource(source)) continue;

    const minDate = transactionDateYmd(row.min_date);
    const maxDate = transactionDateYmd(row.max_date);
    const batchId =
      typeof row.import_batch_id === 'string' && row.import_batch_id.trim()
        ? row.import_batch_id.trim()
        : null;

    const deleteTarget: ImportBatchDeleteTarget = batchId
      ? { kind: 'batch', importBatchId: batchId }
      : { kind: 'legacy', source, yearMonth: minDate.slice(0, 7) };

    const count = Number(row.tx_count);
    summaries.push({
      key: serializeBatchKey(deleteTarget),
      deleteTarget,
      source,
      bankLabel: bankLabelForImportSource(source),
      periodLabel: formatPeriodLabel([minDate, maxDate], locale),
      transactionCount: Number.isFinite(count) ? count : 0,
      importedAt: String(row.min_created_at ?? ''),
      transactionIds: [],
    });
  }

  summaries.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  return summaries;
}

/**
 * Historie importů — agregace v DB (RPC), bez stahování transakcí.
 * Vyžaduje funkci `import_batches_summary()` (SQL aplikuješ ručně).
 */
export async function fetchImportBatchSummaries(
  _userId: string,
  locale: string,
): Promise<{ batches: ImportBatchSummary[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('import_batches_summary');
  if (error) return { batches: [], error: new Error(error.message) };

  const rows = (data ?? []) as ImportBatchSummaryRpcRow[];
  return { batches: summariesFromRpcRows(rows, locale), error: null };
}

/** Smaže jeden import — RLS + explicitní user_id. Vrací smazaná id (stránkovaně). */
export async function deleteImportBatchRemote(
  userId: string,
  target: ImportBatchDeleteTarget,
): Promise<{ error: Error | null; deletedIds: string[] }> {
  // 1) Seber všechna id (PostgREST max 1000 / stránka)
  const ids: string[] = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    let sel = supabase
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .order('id', { ascending: true })
      .range(from, from + page - 1);

    if (target.kind === 'batch') {
      sel = sel.eq('import_batch_id', target.importBatchId);
    } else {
      const start = `${target.yearMonth}-01`;
      const end = lastDayOfYm(target.yearMonth);
      sel = sel
        .eq('source', target.source)
        .is('import_batch_id', null)
        .gte('date', start)
        .lte('date', end);
    }

    const { data, error } = await sel;
    if (error) return { error: new Error(error.message), deletedIds: [] };
    const chunk = (data ?? []).map((r) => String(r.id));
    ids.push(...chunk);
    if (chunk.length < page) break;
    from += page;
  }

  if (!ids.length) return { error: null, deletedIds: [] };

  // 2) Smaž po dávkách
  for (let i = 0; i < ids.length; i += 250) {
    const chunk = ids.slice(i, i + 250);
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', userId)
      .in('id', chunk);
    if (error) return { error: new Error(error.message), deletedIds: ids.slice(0, i) };
  }

  return { error: null, deletedIds: ids };
}
