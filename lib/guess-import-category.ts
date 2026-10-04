/**
 * Guess výdajové kategorie — tenký wrapper nad vrstvenou klasifikací (slovník + rules).
 * Preferuj `classifyImportRow` přímo.
 */
import { classifyImportRow } from '@/lib/classify-import-category';
import type { UserMerchantCategoryMap } from '@/lib/user-merchant-categories';

export function guessCategory(
  description: string,
  learnedCategories?: UserMerchantCategoryMap | Readonly<Record<string, string>>,
): string {
  const result = classifyImportRow(
    {
      type: 'expense',
      category: 'Ostatní',
      description,
      title: description,
      merchantRaw: description,
    },
    { userRules: learnedCategories },
  );
  return result.category;
}
