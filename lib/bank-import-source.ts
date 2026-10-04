/**
 * Povolené hodnoty `transactions.source` pro bankovní PDF/CSV import.
 * Neznámá banka → chyba (žádný tichý fallback na csob).
 */

export const PDF_IMPORT_SOURCES = [
  'raiffeisenbank',
  'csob',
  'kb',
  'fio',
  'airbank',
  'cs',
  'moneta',
] as const;

export type PdfImportSource = (typeof PDF_IMPORT_SOURCES)[number];

/** CSV bank id → DB source (rb → raiffeisenbank; ostatní 1:1). */
export const CSV_IMPORT_SOURCES = [
  'fio',
  'csob',
  'cs',
  'kb',
  'raiffeisenbank',
  'moneta',
  'mbank',
  'revolut',
] as const;

export type CsvImportSource = (typeof CSV_IMPORT_SOURCES)[number];

const PDF_SET = new Set<string>(PDF_IMPORT_SOURCES);
const CSV_SET = new Set<string>(CSV_IMPORT_SOURCES);

export function resolvePdfImportSource(source: string | null | undefined): PdfImportSource {
  const s = (source ?? '').trim().toLowerCase();
  if (PDF_SET.has(s)) return s as PdfImportSource;
  throw new Error(
    `Neznámý zdroj PDF importu: ${source ? JSON.stringify(source) : '(prázdný)'}. Očekáváno: ${PDF_IMPORT_SOURCES.join(', ')}.`,
  );
}

/** CSV bank.id → DB source. */
export function csvBankIdToSource(bankId: string): CsvImportSource {
  const id = (bankId ?? '').trim().toLowerCase();
  if (id === 'rb') return 'raiffeisenbank';
  if (CSV_SET.has(id)) return id as CsvImportSource;
  throw new Error(
    `Neznámá banka CSV importu: ${bankId ? JSON.stringify(bankId) : '(prázdná)'}. Očekáváno: ${[...CSV_IMPORT_SOURCES, 'rb'].join(', ')}.`,
  );
}
