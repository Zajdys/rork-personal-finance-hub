/**
 * Vrstvená klasifikace výdajů při importu (první shoda vyhraje):
 * 0 Převod → special → 1 user_category_rules → 2 crowd
 * → subscription (opakující se částka) → 3 slovník → 4 keywords
 * → classifyUnknown (null) → 5 Ostatní
 */
import { normalizeAccount } from '@/utils/normalizeAccount';
import {
  extractMerchantCityHint,
  merchantNameLetterCount,
  normalizeMerchantKey,
} from '@/lib/normalize-merchant-key';
import { lookupMerchantDictionary } from '@/lib/merchant-dictionary';
import { lookupMerchantKeywords } from '@/lib/merchant-keywords';
import { isLoanPaymentText, LOAN_PAYMENT_CATEGORY } from '@/lib/loan-payment-detect';

export const ALLOWED_EXPENSE_CATEGORIES = [
  'Jídlo a nápoje',
  'Nájem a bydlení',
  'Bydlení',
  'Oblečení',
  'Oblečení a obuv',
  'Doprava',
  'Zábava',
  'Zábava a kultura',
  'Cestování a ubytování',
  'Elektronika',
  'Domácnost a nábytek',
  'Zdraví',
  'Sport',
  'Sport a zdraví',
  'Vzdělání',
  'Nákupy',
  'Služby',
  'Telefon a internet',
  'Splátky úvěrů',
  'Bankovní poplatky',
  'Investice',
  'Výběr hotovosti',
  'Platby lidem',
  'Předplatné',
  'Ostatní',
] as const;

export type AllowedExpenseCategory = (typeof ALLOWED_EXPENSE_CATEGORIES)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_EXPENSE_CATEGORIES);

export function isAllowedExpenseCategory(c: string): boolean {
  return ALLOWED_SET.has(c);
}

export type ClassifyImportInput = {
  type: 'income' | 'expense';
  category?: string | null;
  description?: string | null;
  title?: string | null;
  counterpartyAccount?: string | null;
  counterpartyName?: string | null;
  merchantRaw?: string | null;
  amount?: number | null;
  isRefund?: boolean;
};

export type ClassifyImportResult = {
  category: string;
  merchantKey: string | null;
  description: string;
  counterpartyName?: string | null;
  source:
    | 'transfer'
    | 'user_rule'
    | 'crowd'
    | 'subscription'
    | 'dictionary'
    | 'keywords'
    | 'special'
    | 'unknown_hook'
    | 'fallback';
};

const COMPANY_HINT =
  /\b(s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|spol\.?\s*s\s*r\.?\s*o\.?|spol\.|ltd|llc|inc|gmbh|ag|k\.?\s*s\.?|v\.?\s*o\.?\s*s\.?|z\.?\s*s\.?|o\.?\s*p\.?\s*s\.?|pojistovna|pojišťovna|banka|\bse\b)\b/i;

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

export function isCashDepositDescription(text: string): boolean {
  const f = fold(text);
  return (
    /vklad hotovosti/.test(f) ||
    /mobilni vklad/.test(f) ||
    /vklad pres atm/.test(f) ||
    /vklad\s+přes\s+atm/.test(f) ||
    /vklad\/?\s*vyber z bankomatu/.test(f) && /vklad/.test(f)
  );
}

export function isAtmOrCashDescription(text: string): boolean {
  const f = fold(text);
  if (isCashDepositDescription(text)) return false;
  return (
    /bankomat/.test(f) ||
    /vyber hotovosti/.test(f) ||
    /mobilni vyber hotovosti/.test(f) ||
    /bezkontaktni vyber/.test(f) ||
    /hotovostni transakce/.test(f) ||
    /\bkb atm\b/.test(f) ||
    /\batm\b/.test(f)
  );
}

export function looksLikePersonCounterparty(name: string | null | undefined): boolean {
  const n = (name || '').trim();
  if (!n || n.length < 3) return false;
  if (COMPANY_HINT.test(n)) return false;
  if (/pojistovn/i.test(fold(n))) return false;
  if (/pojisteni|pojistka/i.test(fold(n))) return false;
  if (/\bbanka\b/i.test(fold(n))) return false;
  if (/^(odchozí|příchozí|platba|revolut|trading)/i.test(n)) return false;
  const letters = n.replace(/[^A-Za-zÁ-ž]/g, '');
  if (letters.length < 3) return false;
  const words = n.split(/\s+/).filter((w) => /[A-Za-zÁ-ž]{2,}/.test(w));
  return words.length >= 1 && words.length <= 4;
}

function pickMerchantSource(input: ClassifyImportInput): string {
  return (
    input.merchantRaw ||
    input.title ||
    input.description ||
    input.counterpartyName ||
    ''
  ).trim();
}

/**
 * Doplň counterparty_name z jiných řádků se stejným normalizovaným účtem.
 */
export function buildCounterpartyNameByAccount(
  rows: Array<{
    counterpartyAccount?: string | null;
    counterpartyName?: string | null;
  }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rows) {
    const acc = normalizeAccount(r.counterpartyAccount);
    const name = (r.counterpartyName || '').trim();
    if (!acc || !name || !looksLikePersonCounterparty(name)) continue;
    if (!map.has(acc)) map.set(acc, name);
  }
  return map;
}

export function withBackfilledCounterpartyName<T extends ClassifyImportInput>(
  input: T,
  namesByAccount: ReadonlyMap<string, string>,
): T {
  if ((input.counterpartyName || '').trim()) return input;
  const acc = normalizeAccount(input.counterpartyAccount);
  if (!acc) return input;
  const name = namesByAccount.get(acc);
  if (!name) return input;
  return {
    ...input,
    counterpartyName: name,
    description:
      !input.description ||
      input.description === acc ||
      /odchozí|příchozí|úhrada/i.test(input.description)
        ? name
        : input.description,
  };
}

/**
 * Speciální případy — ATM, krátký obchodník, odchozí bez jména, platby lidem.
 */
export function applySpecialCases(input: ClassifyImportInput): {
  category: string | null;
  description: string;
  merchantKey: string | null;
  counterpartyName: string | null;
  handled: boolean;
} {
  const blob = [input.description, input.title, input.merchantRaw, input.counterpartyName]
    .filter(Boolean)
    .join('\n');
  let description = (input.description || input.title || '').trim() || 'Bez popisu';
  const counterpartyName = (input.counterpartyName || '').trim() || null;

  if (isLoanPaymentText(blob, description, counterpartyName)) {
    return {
      category: LOAN_PAYMENT_CATEGORY,
      description: description === 'Bez popisu' ? 'Splátka úvěru' : description,
      merchantKey: null,
      counterpartyName,
      handled: true,
    };
  }

  if (isCashDepositDescription(blob) && input.type === 'income') {
    return {
      category: 'Vklad hotovosti',
      description: 'Vklad hotovosti',
      merchantKey: null,
      counterpartyName,
      handled: true,
    };
  }

  // Příjem s ATM / bankomat = vklad (výběr je vždy výdaj)
  if (
    input.type === 'income' &&
    (/\bkb\s*atm\b/i.test(blob) ||
      /\batm\b/i.test(blob) ||
      /bankomat/i.test(blob) ||
      /vklad\/?\s*v[yý]b[eě]r/i.test(blob) ||
      /v[yý]b[eě]r hotovosti/i.test(blob))
  ) {
    return {
      category: 'Vklad hotovosti',
      description: 'Vklad hotovosti',
      merchantKey: null,
      counterpartyName,
      handled: true,
    };
  }

  if (isAtmOrCashDescription(blob) && input.type !== 'income') {
    return {
      category: 'Výběr hotovosti',
      description: 'Výběr hotovosti',
      merchantKey: null,
      counterpartyName,
      handled: true,
    };
  }

  const merchantSrc = pickMerchantSource(input);
  const letterCount = merchantNameLetterCount(merchantSrc);
  // Short name: celý název před středníkem (&lt; 3 písmena), NE první token merchant_key
  // „CS MILOVICE“ má dost písmen → ne Neznámý obchodník
  if (input.counterpartyAccount == null && merchantSrc && letterCount > 0 && letterCount < 3) {
    const city = extractMerchantCityHint(merchantSrc);
    description = city ? `Neznámý obchodník (${city})` : 'Neznámý obchodník';
    return {
      category: null,
      description,
      merchantKey: null,
      counterpartyName,
      handled: false,
    };
  }

  const key = normalizeMerchantKey(merchantSrc);

  if (
    input.counterpartyAccount &&
    !looksLikePersonCounterparty(counterpartyName) &&
    /odchozí/i.test(blob) &&
    (!counterpartyName || /odchozí|příchozí|úhrada/i.test(counterpartyName))
  ) {
    description = input.counterpartyAccount;
  }

  if (
    input.counterpartyAccount &&
    looksLikePersonCounterparty(counterpartyName) &&
    !isAtmOrCashDescription(blob) &&
    input.category !== 'Převod'
  ) {
    return {
      category: 'Platby lidem',
      description: (counterpartyName || description).trim(),
      merchantKey: null,
      counterpartyName,
      handled: true,
    };
  }

  return {
    category: null,
    description,
    merchantKey: key || null,
    counterpartyName,
    handled: false,
  };
}

export type ClassifyContext = {
  userRules?: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
  /** Globální crowd cache (merchant_categories source='crowd') */
  globalCache?: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
  /**
   * @deprecated Detekce předplatného už neběží uvnitř classify — jen post-hoc shluky
   * (`collectSubscriptionClusterTxIds`). Ignorováno.
   */
  subscriptionMerchantKeys?: ReadonlySet<string>;
};

function mapGet(
  map: ReadonlyMap<string, string> | Readonly<Record<string, string>> | undefined,
  key: string,
): string | undefined {
  if (!map || !key) return undefined;
  if (map instanceof Map) return map.get(key);
  return map[key];
}

/**
 * @deprecated Nikdy neoznačuj celého obchodníka jako Předplatné.
 * Vrací prázdný set — shluky řeší `collectSubscriptionClusterTxIds`.
 */
export function buildSubscriptionMerchantKeys(
  _rows: Array<{
    type?: string;
    category?: string | null;
    amount?: number | null;
    description?: string | null;
    title?: string | null;
    merchantRaw?: string | null;
    counterpartyName?: string | null;
  }>,
): Set<string> {
  return new Set();
}

/**
 * Hook pro budoucí vrstvu (ML / externí služba). Teď vždy null — žádné placené API.
 */
export function classifyUnknown(_merchantKey: string): string | null {
  return null;
}

/**
 * Klasifikace jedné transakce.
 * Layer 0: splátka úvěru (i když by jinak byla Převod) → Splátky úvěrů
 * Layer 0b: Převod
 */
export function classifyImportRow(
  input: ClassifyImportInput,
  ctx: ClassifyContext = {},
): ClassifyImportResult {
  const blobForLoan = [input.description, input.title, input.merchantRaw, input.counterpartyName]
    .filter(Boolean)
    .join('\n');
  if (isLoanPaymentText(blobForLoan) && input.type !== 'income') {
    return {
      category: LOAN_PAYMENT_CATEGORY,
      merchantKey: null,
      description:
        (input.description || input.title || 'Splátka úvěru').trim() || 'Splátka úvěru',
      counterpartyName: input.counterpartyName ?? null,
      source: 'special',
    };
  }

  if (input.category === 'Převod') {
    return {
      category: 'Převod',
      merchantKey: null,
      description: (input.description || input.title || 'Převod').trim(),
      counterpartyName: input.counterpartyName ?? null,
      source: 'transfer',
    };
  }

  if (input.type === 'income' && !input.isRefund) {
    const specialIncome = applySpecialCases(input);
    if (specialIncome.handled && specialIncome.category === 'Vklad hotovosti') {
      return {
        category: 'Vklad hotovosti',
        merchantKey: null,
        description: specialIncome.description,
        counterpartyName: specialIncome.counterpartyName,
        source: 'special',
      };
    }
    if (input.category && input.category !== 'Ostatní') {
      return {
        category: input.category,
        merchantKey: null,
        description: (input.description || input.title || '').trim() || 'Bez popisu',
        counterpartyName: input.counterpartyName ?? null,
        source: 'fallback',
      };
    }
    return {
      category: input.category || 'Ostatní',
      merchantKey: null,
      description: (input.description || input.title || '').trim() || 'Bez popisu',
      counterpartyName: input.counterpartyName ?? null,
      source: 'fallback',
    };
  }

  const special = applySpecialCases(input);
  const description = special.description;
  const merchantKey =
    special.merchantKey ?? (normalizeMerchantKey(pickMerchantSource(input)) || null);
  const counterpartyName = special.counterpartyName;

  if (special.handled && special.category) {
    return {
      category: special.category,
      merchantKey,
      description,
      counterpartyName,
      source: 'special',
    };
  }

  if (merchantKey) {
    // 1) user rules
    const user = mapGet(ctx.userRules, merchantKey);
    if (user && isAllowedExpenseCategory(user)) {
      return { category: user, merchantKey, description, counterpartyName, source: 'user_rule' };
    }
    // 2) crowd
    const crowd = mapGet(ctx.globalCache, merchantKey);
    if (crowd && isAllowedExpenseCategory(crowd)) {
      return { category: crowd, merchantKey, description, counterpartyName, source: 'crowd' };
    }
    // 3) dictionary (Předplatné jen u čistě subscription brandů; Apple/Google → Elektronika/Ostatní
    //    a shluky se aplikují až post-hoc v reclassify / import modal)
    const dict = lookupMerchantDictionary(merchantKey);
    if (dict && isAllowedExpenseCategory(dict)) {
      return { category: dict, merchantKey, description, counterpartyName, source: 'dictionary' };
    }
  }

  // 4) keywords
  const kwHay = [merchantKey, pickMerchantSource(input), input.description, input.title]
    .filter(Boolean)
    .join(' ');
  const kw = lookupMerchantKeywords(kwHay);
  if (kw && isAllowedExpenseCategory(kw)) {
    return { category: kw, merchantKey, description, counterpartyName, source: 'keywords' };
  }

  if (merchantKey) {
    const hooked = classifyUnknown(merchantKey);
    if (hooked && isAllowedExpenseCategory(hooked)) {
      return {
        category: hooked,
        merchantKey,
        description,
        counterpartyName,
        source: 'unknown_hook',
      };
    }
  }

  if (input.category && input.category !== 'Ostatní' && isAllowedExpenseCategory(input.category)) {
    return {
      category: input.category,
      merchantKey,
      description,
      counterpartyName,
      source: 'fallback',
    };
  }

  return {
    category: 'Ostatní',
    merchantKey,
    description,
    counterpartyName,
    source: 'fallback',
  };
}
