/**
 * Stabilní otisk bankovní transakce pro deduplikaci importů (`transactions.unique_key`).
 *
 * Preferuje bankovní ID (RB/KB „Kód transakce“, Fio ID pohybu), jinak
 * user + banka + datum zaúčtování + částka + normalizovaný popis.
 *
 * Důležité: `date` = zaúčtování (DB `date`), nikoli valuta (`booking_date`).
 */

export function normalizeImportDescription(description: string): string {
  return (description || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeImportBank(bank: string | null | undefined): string {
  const b = (bank || '').trim().toLowerCase();
  return b || 'bank_import';
}

export function formatImportAmount(amount: number): string {
  return Number(amount).toFixed(2);
}

/** Prefixed bank id → zároveň použitelné jako `external_id`. */
export function buildBankExternalId(
  bank: string | null | undefined,
  bankTransactionId: string | null | undefined,
): string | null {
  const txId = (bankTransactionId || '').trim();
  if (!txId) return null;
  return `${normalizeImportBank(bank)}:${txId}`;
}

export function buildTransactionUniqueKey(params: {
  userId: string;
  bank: string | null | undefined;
  /** YYYY-MM-DD — datum zaúčtování */
  date: string;
  amount: number;
  description: string;
  bankTransactionId?: string | null;
}): string {
  const bank = normalizeImportBank(params.bank);
  const txId = (params.bankTransactionId || '').trim();
  if (txId) {
    return `${params.userId}|${bank}|txid:${txId}`;
  }
  const date = (params.date || '').slice(0, 10);
  const amt = formatImportAmount(params.amount);
  const desc = normalizeImportDescription(params.description);
  return `${params.userId}|${bank}|${date}|${amt}|${desc}`;
}
