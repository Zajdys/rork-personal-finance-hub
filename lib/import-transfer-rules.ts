/**
 * Sdílená popisová pravidla pro Převod / Investice při bankovním importu.
 * Použitelné napříč bankami (Revolut CSV, PDF banky, …).
 *
 * Pořadí: Investice (pattern + slovník brokerů) → Převod → null (= běžná kategorizace).
 */
import { namesMatchAnyOwner } from '@/lib/suggest-own-accounts';
import { coerceOwnerNames } from '@/lib/owner-names';
import { normalizeMerchantKey } from '@/lib/normalize-merchant-key';
import { lookupMerchantDictionary } from '@/lib/merchant-dictionary';

export type ImportTransferRuleHit =
  | { kind: 'prevod' }
  | { kind: 'investice'; reason: 'pattern' | 'dictionary' };

/** FX uvnitř Revolutu / podobné: „Exchanged to EUR“. */
export function isCurrencyExchangeDescription(description: string): boolean {
  return /^Exchanged\s+to\b/i.test(String(description ?? '').trim());
}

/** Top-up z karty: Apple/Google Pay top-up, „Top-up by *1234“. */
export function isCardTopupDescription(description: string): boolean {
  const d = String(description ?? '').trim();
  if (/^(Apple|Google)\s+Pay\s+top-up\b/i.test(d)) return true;
  if (/^Top-up\s+by\b/i.test(d)) return true;
  return false;
}

/** Revolut Savings Vault (a podobné spořicí „vault“ pohyby). */
export function isSavingsVaultDescription(description: string): boolean {
  return /\bSavings\s+Vault\b/i.test(String(description ?? ''));
}

/**
 * Investiční pohyby podle popisu (ne broker — ten jde přes slovník):
 * Flexible Cash Funds, To/From investment account, Revolut Digital Assets.
 */
export function isInvestmentMovementDescription(description: string): boolean {
  const d = String(description ?? '');
  if (/\bFlexible\s+Cash\s+Funds\b/i.test(d)) return true;
  if (/\binvestment\s+account\b/i.test(d)) return true;
  if (/\bRevolut\s+Digital\s+Assets\b/i.test(d)) return true;
  return false;
}

/**
 * Protistrana z převodového popisu:
 * „To XTB“, „From Flexible Cash Funds“, „Transfer to …“,
 * „International Transfer to …“, „Payment from …“.
 */
export function extractTransferPartyName(description: string): string | null {
  const d = String(description ?? '').trim();
  if (!d) return null;

  const patterns: RegExp[] = [
    /^(?:International\s+)?Transfer\s+(?:to|from)\s+(.+)$/i,
    /^Payment\s+(?:to|from)\s+(.+)$/i,
    /^(?:To|From)\s+(.+)$/i,
  ];
  for (const re of patterns) {
    const m = d.match(re);
    const party = m?.[1]?.trim();
    if (party) return party;
  }
  return null;
}

/** Převod na/z vlastního jména — shoda s kteroukoli položkou `ownerNames`. */
export function isOwnNameTransferDescription(
  description: string,
  ownerNames: string | string[] | null | undefined,
): boolean {
  const party = extractTransferPartyName(description);
  const names = coerceOwnerNames(ownerNames);
  if (!party || !names.length) return false;
  return namesMatchAnyOwner(party, names);
}

/**
 * Hit pro Převod / Investice, nebo `null` → pokračuj user rules → crowd → slovník → keywords.
 */
export function matchImportTransferRules(
  description: string,
  ownerNames?: string | string[] | null,
): ImportTransferRuleHit | null {
  const desc = String(description ?? '').trim();
  if (!desc) return null;

  if (isInvestmentMovementDescription(desc)) {
    return { kind: 'investice', reason: 'pattern' };
  }

  const party = extractTransferPartyName(desc);
  for (const candidate of party ? [party, desc] : [desc]) {
    const mk = normalizeMerchantKey(candidate);
    const cat = mk ? lookupMerchantDictionary(mk) : null;
    if (cat === 'Investice') {
      return { kind: 'investice', reason: 'dictionary' };
    }
  }

  if (isCurrencyExchangeDescription(desc)) return { kind: 'prevod' };
  if (isCardTopupDescription(desc)) return { kind: 'prevod' };
  if (isSavingsVaultDescription(desc)) return { kind: 'prevod' };
  if (isOwnNameTransferDescription(desc, ownerNames)) {
    return { kind: 'prevod' };
  }

  return null;
}
