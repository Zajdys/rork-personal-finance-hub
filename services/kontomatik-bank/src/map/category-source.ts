import type { ClassifyImportResult } from '../../../../lib/classify-import-category.ts';

/** Stejné mapování jako lib/categorization.mapClassifySourceToCategorySource (bez RN supabase). */
export function mapClassifySourceToCategorySource(
  source: ClassifyImportResult['source'],
): 'user' | 'crowd' | 'dictionary' | 'keyword' | 'transfer' | 'import' {
  switch (source) {
    case 'user_rule':
      return 'user';
    case 'crowd':
      return 'crowd';
    case 'dictionary':
      return 'dictionary';
    case 'keywords':
      return 'keyword';
    case 'transfer':
      return 'transfer';
    default:
      return 'import';
  }
}
