import type { Transaction } from '@/store/finance-store';

const GENERIC_TITLES = [
  'transakce platební kartou',
  'platba kartou',
  'bez názvu',
  'bez popisu',
];

/** Název transakce pro UI: title, pak description / name / merchant; prázdné → „Bez názvu“. */
export function getTransactionDisplayTitle(transaction: Transaction): string {
  const t = transaction as Transaction & { description?: string; name?: string; merchant?: string };
  const raw = (t.title || t.description || t.name || t.merchant || '').trim();
  if (!raw) return 'Bez názvu';
  const lower = raw.toLowerCase();
  if (GENERIC_TITLES.some((g) => lower.includes(g))) {
    return 'Platba kartou';
  }
  return raw;
}
