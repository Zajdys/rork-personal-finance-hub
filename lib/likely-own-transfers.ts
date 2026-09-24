import type { Transaction } from '@/store/finance-store';

/**
 * Heuristika: transakce, které vypadají jako převody mezi vlastními účty,
 * když uživatel ještě nemá zadané owner accounts (po importu).
 */
export function countLikelyOwnTransfers(
  txs: Transaction[],
  ownerName?: string | null,
): number {
  if (!txs.length) return 0;
  const name = (ownerName || '').trim().toLowerCase();
  const nameParts = name.split(/\s+/).filter((p) => p.length >= 3);

  let count = 0;
  for (const t of txs) {
    if (t.category === 'Převod') continue;
    const desc = `${t.title || ''} ${(t as { description?: string }).description || ''}`.toLowerCase();

    const looksLikeTransferType =
      /odchozí\s+(okamžitá\s+)?úhrada|příchozí\s+(okamžitá\s+)?úhrada|jednorázová\s+úhrada|převod/i.test(
        desc,
      );
    const hasMerchantCue =
      /albert|lidl|tesco|kaufland|penny|billa|shell|omv|mcdonald|spotify|netflix|youtube|apple\.com|platba\s+kartou/i.test(
        desc,
      );
    const hasAccountNumber = /\d{6,}\/?\d{0,4}/.test(desc.replace(/\s+/g, ''));
    const nameHit =
      nameParts.length > 0 && nameParts.every((p) => desc.includes(p));

    if (looksLikeTransferType && !hasMerchantCue && (hasAccountNumber || nameHit)) {
      count += 1;
    }
  }
  return count;
}
