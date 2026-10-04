/**
 * Návrhy vlastních účtů z importovaných transakcí.
 * Klasifikace Převod se řídí jen číslem účtu — jméno je jen pro návrhy.
 */
import {
  compactAccountKey,
  expandOwnerAccountNeedles,
} from '@/lib/owner-account-match';
import { normalizeAccount } from '@/utils/normalizeAccount';
import { isLoanPaymentText } from '@/lib/loan-payment-detect';

const CZ_ACCOUNT_RE = /\b(\d{1,6}-)?\d{2,10}\/\d{4}\b/g;
const CZ_IBAN_RE = /\bCZ\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/gi;

/** Tituly / akademické zkratky — nepatří do porovnání jména. */
const NAME_TITLE_TOKENS = new Set([
  'ing',
  'mgr',
  'bc',
  'bsc',
  'msc',
  'mba',
  'phd',
  'phdr',
  'judr',
  'mudr',
  'mvdr',
  'mdidr',
  'rndr',
  'dis',
  'doc',
  'prof',
  'dr',
  'ml',
  'st',
  'jr',
  'sr',
]);

/**
 * Sběrné / platební brány — nikdy nenavrhovat jako vlastní účet.
 * klíč = normalizované číslo účtu, hodnota = zobrazený label služby.
 */
export const POOLED_COUNTERPARTY_LABELS: Record<string, string> = {
  '2001141349/0800': 'Revolut',
};

/** lower, bez diakritiky, bez titulů, slova abecedně → "Jan Hájek" === "HÁJEK JAN" */
export function normalizePersonNameKey(name: string): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !NAME_TITLE_TOKENS.has(w))
    .sort()
    .join(' ');
}

export function namesMatchOwner(counterpartyName: string, ownerName: string): boolean {
  const a = normalizePersonNameKey(counterpartyName);
  const b = normalizePersonNameKey(ownerName);
  if (!a || !b) return false;
  return a === b;
}

/** Shoda, pokud protistrana odpovídá kterémukoli vlastnímu jménu. */
export function namesMatchAnyOwner(
  counterpartyName: string,
  ownerNames: string[],
): boolean {
  const names = (ownerNames ?? []).map((n) => String(n ?? '').trim()).filter(Boolean);
  if (!names.length) return false;
  return names.some((n) => namesMatchOwner(counterpartyName, n));
}

export function extractCzechAccountNumbers(text: string): string[] {
  const out: string[] = [];
  const s = String(text ?? '');
  for (const m of s.matchAll(CZ_ACCOUNT_RE)) {
    out.push(m[0]!.replace(/\s+/g, ''));
  }
  for (const m of s.matchAll(CZ_IBAN_RE)) {
    out.push(m[0]!.replace(/[\s-]/g, ''));
  }
  return [...new Set(out)];
}

/** Kanonický zápis pro dedupe / dismiss (compact). */
export function canonicalAccountKey(raw: string): string {
  const needles = expandOwnerAccountNeedles(raw);
  const withSlash = needles.find((n) => n.includes('/'));
  return compactAccountKey(withSlash || needles[0] || raw);
}

export function isPooledCounterpartyAccount(account: string | null | undefined): boolean {
  const n = normalizeAccount(account);
  if (!n) return false;
  return n in POOLED_COUNTERPARTY_LABELS;
}

export function pooledServiceLabel(account: string | null | undefined): string | null {
  const n = normalizeAccount(account);
  if (!n) return null;
  return POOLED_COUNTERPARTY_LABELS[n] ?? null;
}

export type OwnAccountSuggestTx = {
  id?: string;
  title?: string;
  description?: string;
  type?: 'income' | 'expense';
  amount?: number;
  date?: string;
  category?: string;
  counterpartyAccount?: string | null;
  counterpartyName?: string | null;
};

export type OwnAccountCandidate = {
  accountNumber: string;
  counterpartyName: string;
  count: number;
  /** compact key for dismiss / dedupe */
  key: string;
};

export type PooledTransferCandidate = {
  id: string;
  accountNumber: string;
  serviceLabel: string;
  amount: number;
  date: string;
  title: string;
  type: 'income' | 'expense';
};

export type RevolutCardTopupCandidate = {
  id: string;
  amount: number;
  date: string;
  title: string;
};

/** Návrh: účet vypadá na splátku úvěru, ne vlastní účet. */
export type LoanPaymentSuggestCandidate = {
  accountNumber: string;
  counterpartyName: string;
  count: number;
  totalAmount: number;
  key: string;
  sampleTxIds: string[];
};

function displayAccountNumber(raw: string): string {
  const n = normalizeAccount(raw);
  if (n) return n;
  const needles = expandOwnerAccountNeedles(raw);
  const withSlash = needles.find((x) => /^\d/.test(x) && x.includes('/'));
  if (withSlash) return withSlash;
  return raw.replace(/\s+/g, '');
}

function isExistingOrDismissed(
  key: string,
  existing: Set<string>,
  dismissed: Set<string>,
): boolean {
  if (dismissed.has(key) || existing.has(key)) return true;
  for (const e of existing) {
    if (e.includes(key) || key.includes(e)) return true;
  }
  return false;
}

function pickBestName(names: Map<string, number>): string {
  let bestName = '';
  let bestN = 0;
  for (const [n, c] of names) {
    if (c > bestN) {
      bestN = c;
      bestName = n;
    }
  }
  return bestName;
}

/** Jen řádky s uloženým protiúčtem (ne karty / ATM). */
function counterpartyAccountOf(tx: OwnAccountSuggestTx): string | null {
  return normalizeAccount(tx.counterpartyAccount);
}

/**
 * Shoda jména majitele + counterparty_account.
 * Stačí 1 transakce. Karty/ATM (bez CP) a sběrné účty se vynechají.
 */
export function findOwnAccountCandidates(params: {
  txs: OwnAccountSuggestTx[];
  ownerName: string;
  existingAccounts: string[];
  dismissedKeys: string[];
}): OwnAccountCandidate[] {
  const ownerKey = normalizePersonNameKey(params.ownerName);
  if (!ownerKey) return [];

  const existing = new Set(
    params.existingAccounts.flatMap((a) => expandOwnerAccountNeedles(a).map(compactAccountKey)),
  );
  const dismissed = new Set(params.dismissedKeys.map(compactAccountKey));

  type Agg = { count: number; names: Map<string, number>; display: string };
  const byAccount = new Map<string, Agg>();

  for (const tx of params.txs) {
    const cpAcc = counterpartyAccountOf(tx);
    if (!cpAcc) continue;
    if (isPooledCounterpartyAccount(cpAcc)) continue;

    const nameRaw = (tx.counterpartyName || '').trim();
    if (!nameRaw || !namesMatchOwner(nameRaw, params.ownerName)) continue;

    // Splátka úvěru / hypotéky — nikdy nenabízet jako vlastní účet
    if (
      isLoanPaymentText(tx.title, tx.description, tx.counterpartyName)
    ) {
      continue;
    }

    const key = canonicalAccountKey(cpAcc);
    if (!key || key.length < 6) continue;
    if (isExistingOrDismissed(key, existing, dismissed)) continue;

    const display = displayAccountNumber(cpAcc);
    let agg = byAccount.get(key);
    if (!agg) {
      agg = { count: 0, names: new Map(), display };
      byAccount.set(key, agg);
    }
    agg.count += 1;
    agg.names.set(nameRaw, (agg.names.get(nameRaw) ?? 0) + 1);
  }

  const out: OwnAccountCandidate[] = [];
  for (const [key, agg] of byAccount) {
    out.push({
      accountNumber: agg.display,
      counterpartyName: pickBestName(agg.names),
      count: agg.count,
      key,
    });
  }

  out.sort((a, b) => b.count - a.count || a.accountNumber.localeCompare(b.accountNumber));
  return out;
}

/** Jen shoda jména majitele výpisu — obousměrný tok bez jména generuje šum. */
export function buildOwnAccountSuggestions(params: {
  txs: OwnAccountSuggestTx[];
  ownerName: string | null | undefined;
  existingAccounts: string[];
  dismissedKeys: string[];
}): OwnAccountCandidate[] {
  const owner = (params.ownerName || '').trim();
  if (!owner) return [];
  return findOwnAccountCandidates({
    txs: params.txs,
    ownerName: owner,
    existingAccounts: params.existingAccounts,
    dismissedKeys: params.dismissedKeys,
  });
}

/** Platby přes sběrný účet (např. Revolut přes ČS) — výběr po transakcích. */
export function findPooledTransferCandidates(
  txs: OwnAccountSuggestTx[],
): PooledTransferCandidate[] {
  const out: PooledTransferCandidate[] = [];
  for (const tx of txs) {
    if (!tx.id) continue;
    if (tx.category === 'Převod') continue;
    const cp = counterpartyAccountOf(tx);
    if (!cp) continue;
    const label = pooledServiceLabel(cp);
    if (!label) continue;
    out.push({
      id: tx.id,
      accountNumber: cp,
      serviceLabel: label,
      amount: tx.amount ?? 0,
      date: tx.date ?? '',
      title: (tx.title || tx.description || label).trim(),
      type: tx.type === 'income' ? 'income' : 'expense',
    });
  }
  return out;
}

/** Kartové „Revolut**…“ / dobití — nabídnout jako převod na vlastní Revolut. */
export function findRevolutCardTopupCandidates(
  txs: OwnAccountSuggestTx[],
): RevolutCardTopupCandidate[] {
  const out: RevolutCardTopupCandidate[] = [];
  for (const tx of txs) {
    if (!tx.id) continue;
    if (tx.category === 'Převod') continue;
    // Jen kartové / bez protiúčtu — dobití přes merchant Revolut
    if (counterpartyAccountOf(tx)) continue;
    const blob = [tx.title, tx.description, tx.counterpartyName].filter(Boolean).join('\n');
    if (!/revolut/i.test(blob)) continue;
    out.push({
      id: tx.id,
      amount: tx.amount ?? 0,
      date: tx.date ?? '',
      title: (tx.title || tx.description || 'Revolut').trim(),
    });
  }
  return out;
}

/**
 * Účty se zprávou o splátce úvěru / hypotéky / leasingu —
 * nabídnout „Splátky úvěrů“, ne vlastní účet.
 */
export function findLoanPaymentCandidates(params: {
  txs: OwnAccountSuggestTx[];
  existingAccounts?: string[];
}): LoanPaymentSuggestCandidate[] {
  type Agg = {
    count: number;
    total: number;
    names: Map<string, number>;
    display: string;
    ids: string[];
  };
  const byAccount = new Map<string, Agg>();

  for (const tx of params.txs) {
    if (tx.type === 'income') continue;
    if (tx.category === 'Splátky úvěrů') continue;
    const cpAcc = counterpartyAccountOf(tx);
    if (!cpAcc) continue;
    if (!isLoanPaymentText(tx.title, tx.description, tx.counterpartyName)) continue;

    const key = canonicalAccountKey(cpAcc);
    if (!key) continue;
    const display = displayAccountNumber(cpAcc);
    let agg = byAccount.get(key);
    if (!agg) {
      agg = { count: 0, total: 0, names: new Map(), display, ids: [] };
      byAccount.set(key, agg);
    }
    agg.count += 1;
    agg.total += Math.abs(tx.amount ?? 0);
    if (tx.id) agg.ids.push(tx.id);
    const nameRaw = (tx.counterpartyName || '').trim();
    if (nameRaw) agg.names.set(nameRaw, (agg.names.get(nameRaw) ?? 0) + 1);
  }

  const out: LoanPaymentSuggestCandidate[] = [];
  for (const [key, agg] of byAccount) {
    out.push({
      accountNumber: agg.display,
      counterpartyName: pickBestName(agg.names) || 'Splátka úvěru',
      count: agg.count,
      totalAmount: Math.round(agg.total * 100) / 100,
      key,
      sampleTxIds: agg.ids,
    });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}

/** Transakce se shodným normalizovaným protiúčtem (pro překlasifikaci). */
export function findTransactionIdsMatchingAccounts(
  txs: Array<{
    id: string;
    category?: string;
    counterpartyAccount?: string | null;
  }>,
  accountNumbers: string[],
): string[] {
  if (!accountNumbers.length) return [];
  const wanted = new Set(
    accountNumbers.map((a) => normalizeAccount(a)).filter((a): a is string => !!a),
  );
  if (!wanted.size) return [];
  const ids: string[] = [];
  for (const tx of txs) {
    if (tx.category === 'Převod') continue;
    const cp = normalizeAccount(tx.counterpartyAccount);
    if (!cp) continue;
    if (wanted.has(cp)) ids.push(tx.id);
  }
  return ids;
}
