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
import {
  isLoanPaymentText,
  LOAN_PAYMENT_CATEGORY,
  LOAN_PAYMENT_SUBCATEGORY,
} from '@/lib/loan-payment-detect';
import { LEGACY_MAP, normalizeCategory } from '@/lib/category-normalize';
import { EXPENSE_CATEGORY_TREE } from '@/constants/categories';

/** Povolené názvy (nový strom + legacy klíče z LEGACY_MAP). */
export const ALLOWED_EXPENSE_CATEGORIES = [
  ...EXPENSE_CATEGORY_TREE.map((c) => c.name),
  ...Object.keys(LEGACY_MAP),
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
  subcategory?: string | null;
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

// --- Mzda: pravidelná příjmová platba od firmy (např. „SERW, SPOL. S R.O.“) ---

const COMPANY_NAME_RE =
  /(\bs\.?\s?r\.?\s?o\b|\bspol\.|\ba\.\s?s\.?(?=\s|$|,)|\bs\.\s?p\.|\bv\.\s?o\.\s?s\.|\bk\.\s?s\.|\bz\.\s?s\.|\bo\.\s?p\.\s?s\.|\bgmbh\b|\bltd\b|\binc\b|\bs\.\s?a\.)/i;
const SALARY_TEXT_RE = /\b(mzda|mzdy|vyplata|výplata|salary|payroll|odmena za praci|odměna za práci)\b/i;
const SALARY_MIN_CZK = 8000;

export type SalaryDetectRow = {
  type: 'income' | 'expense';
  amount: number;
  date: string;
  counterpartyName?: string | null;
  counterpartyAccount?: string | null;
  description?: string | null;
  title?: string | null;
  isRefund?: boolean;
  category?: string | null;
};

export function salaryPayerKey(r: Pick<SalaryDetectRow, 'counterpartyName' | 'counterpartyAccount'>): string | null {
  const acc = normalizeAccount(r.counterpartyAccount ?? undefined);
  if (acc) return `acc:${acc}`;
  const n = String(r.counterpartyName ?? '').trim().toLowerCase();
  return n ? `name:${n}` : null;
}

/** Text výslovně říká mzda / výplata. */
export function isSalaryText(r: Pick<SalaryDetectRow, 'description' | 'title' | 'counterpartyName'>): boolean {
  const t = [r.description, r.title, r.counterpartyName].filter(Boolean).join(' ');
  return SALARY_TEXT_RE.test(t);
}

/**
 * Plátci mzdy: firma (s.r.o., a.s., …), příjem ≥ 8 000 Kč aspoň ve 2 různých měsících.
 * Vstup = importované řádky + už uložené transakce (aby šla mzda poznat i z 1měsíčního výpisu).
 */
export function detectSalaryPayerKeys(rows: SalaryDetectRow[]): Set<string> {
  const months = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.type !== 'income' || r.isRefund) continue;
    if (r.category === 'Převod' || r.category === 'Investice') continue;
    if (!(Number(r.amount) >= SALARY_MIN_CZK)) continue;
    const name = String(r.counterpartyName ?? '');
    if (!COMPANY_NAME_RE.test(name) && !isSalaryText(r)) continue;
    const key = salaryPayerKey(r);
    if (!key) continue;
    const ym = String(r.date ?? '').slice(0, 7);
    if (!months.has(key)) months.set(key, new Set());
    months.get(key)!.add(ym);
  }
  const out = new Set<string>();
  for (const [k, m] of months) if (m.size >= 2) out.add(k);
  return out;
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
  subcategory?: string | null;
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
      subcategory: LOAN_PAYMENT_SUBCATEGORY,
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
      category: 'Poplatky a hotovost',
      subcategory: 'Výběr hotovosti',
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

export type ClassifyRuleValue = string | { category: string; subcategory?: string | null };

export type ClassifyContext = {
  userRules?: ReadonlyMap<string, ClassifyRuleValue> | Readonly<Record<string, ClassifyRuleValue>>;
  /** Globální crowd cache (merchant_categories source='crowd') */
  globalCache?: ReadonlyMap<string, ClassifyRuleValue> | Readonly<Record<string, ClassifyRuleValue>>;
  /**
   * @deprecated Detekce předplatného už neběží uvnitř classify — jen post-hoc shluky
   * (`collectSubscriptionClusterTxIds`). Ignorováno.
   */
  subscriptionMerchantKeys?: ReadonlySet<string>;
};

function mapGet(
  map:
    | ReadonlyMap<string, ClassifyRuleValue>
    | Readonly<Record<string, ClassifyRuleValue>>
    | undefined,
  key: string,
): ClassifyRuleValue | undefined {
  if (!map || !key) return undefined;
  if (map instanceof Map) return map.get(key);
  return (map as Record<string, ClassifyRuleValue>)[key];
}

function ruleToParts(rule: ClassifyRuleValue): { category: string; subcategory: string | null } {
  if (typeof rule === 'string') {
    const n = normalizeCategory(rule);
    return { category: n.category, subcategory: n.subcategory };
  }
  const n = normalizeCategory(rule.category, rule.subcategory);
  return { category: n.category, subcategory: n.subcategory };
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
 * Layer 0: splátka úvěru (i když by jinak byla Převod) → Úvěry
 * Layer 0b: Převod
 */
export function classifyImportRow(
  input: ClassifyImportInput,
  ctx: ClassifyContext = {},
): ClassifyImportResult {
  const result = classifyImportRowRaw(input, ctx);
  const n = normalizeCategory(result.category, result.subcategory);
  return { ...result, category: n.category, subcategory: n.subcategory };
}

function classifyImportRowRaw(
  input: ClassifyImportInput,
  ctx: ClassifyContext = {},
): ClassifyImportResult {
  const blobForLoan = [input.description, input.title, input.merchantRaw, input.counterpartyName]
    .filter(Boolean)
    .join('\n');
  if (isLoanPaymentText(blobForLoan) && input.type !== 'income') {
    return {
      category: LOAN_PAYMENT_CATEGORY,
      subcategory: LOAN_PAYMENT_SUBCATEGORY,
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
      subcategory: special.subcategory ?? null,
      merchantKey,
      description,
      counterpartyName,
      source: 'special',
    };
  }

  if (merchantKey) {
    // 1) user rules
    const user = mapGet(ctx.userRules, merchantKey);
    if (user) {
      const parts = ruleToParts(user);
      if (isAllowedExpenseCategory(parts.category)) {
        return {
          category: parts.category,
          subcategory: parts.subcategory,
          merchantKey,
          description,
          counterpartyName,
          source: 'user_rule',
        };
      }
    }
    // 2) crowd
    const crowd = mapGet(ctx.globalCache, merchantKey);
    if (crowd) {
      const parts = ruleToParts(crowd);
      if (isAllowedExpenseCategory(parts.category)) {
        return {
          category: parts.category,
          subcategory: parts.subcategory,
          merchantKey,
          description,
          counterpartyName,
          source: 'crowd',
        };
      }
    }
    // 3) dictionary
    const dict = lookupMerchantDictionary(merchantKey);
    if (dict && isAllowedExpenseCategory(dict.category)) {
      return {
        category: dict.category,
        subcategory: dict.subcategory ?? null,
        merchantKey,
        description,
        counterpartyName,
        source: 'dictionary',
      };
    }
  }

  // 4) keywords
  const kwHay = [merchantKey, pickMerchantSource(input), input.description, input.title]
    .filter(Boolean)
    .join(' ');
  const kw = lookupMerchantKeywords(kwHay);
  if (kw && isAllowedExpenseCategory(kw.category)) {
    return {
      category: kw.category,
      subcategory: kw.subcategory ?? null,
      merchantKey,
      description,
      counterpartyName,
      source: 'keywords',
    };
  }

  if (merchantKey) {
    const hooked = classifyUnknown(merchantKey);
    if (hooked && isAllowedExpenseCategory(hooked)) {
      return {
        category: hooked,
        subcategory: null,
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
      subcategory: null,
      merchantKey,
      description,
      counterpartyName,
      source: 'fallback',
    };
  }

  return {
    category: 'Ostatní',
    subcategory: null,
    merchantKey,
    description,
    counterpartyName,
    source: 'fallback',
  };
}
