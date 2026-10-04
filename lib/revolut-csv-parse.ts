/**
 * Revolut account-statement CSV (EN export, UTF-8, comma).
 * Header: Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
 * Jeden soubor = jedna měna (CZK / EUR / USD).
 */
import type { ImportBucket, ParsedImportRow, BankFormat } from '@/lib/bank-statement-parser';
import {
  parseAmount,
  parseTransactionDate,
  classifyDescription,
  bucketToStoreCategory,
} from '@/lib/bank-statement-parser';
import { toYyyyMmDd } from '@/lib/transaction-date';
import { normalizeMerchantKey } from '@/lib/normalize-merchant-key';
import { lookupMerchantDictionary } from '@/lib/merchant-dictionary';
import {
  extractTransferPartyName,
  matchImportTransferRules,
} from '@/lib/import-transfer-rules';
import { coerceOwnerNames } from '@/lib/owner-names';
import Papa from 'papaparse';

export const REVOLUT_FORMAT: BankFormat = {
  id: 'revolut',
  label: 'Revolut',
  dateCol: 'Completed Date',
  amountCol: 'Amount',
  descCol: 'Description',
};

/** Přesná hlavička 1. řádku (bez BOM). */
export const REVOLUT_HEADER =
  'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance';

const SUPPORTED_CURRENCIES = new Set(['CZK', 'EUR', 'USD']);

const SKIP_TYPES = new Set(['TEMP_BLOCK', 'CARD_CREDIT']);

type PapaRow = Record<string, string>;

export function isRevolutCsvText(text: string): boolean {
  const first = String(text ?? '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)[0]
    ?.trim();
  return first === REVOLUT_HEADER;
}

function ymdFromRaw(raw: string): string | null {
  const d = parseTransactionDate(raw);
  return d ? toYyyyMmDd(d) : null;
}

function normCurrency(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase();
}

/**
 * Dedup otisk (Revolut nemá bankovní ID).
 * unique_key = Completed Date + Amount + Currency + Description + Type + #rowIndex
 * (+ `|fee` u poplatku ze sloupce Fee).
 * `rowIndex` = 1-based pořadí řádku v CSV datech (řeší dvě platby ve stejné sekundě).
 */
export function buildRevolutBankTransactionId(params: {
  completedDate: string;
  amount: number;
  currency: string;
  description: string;
  type: string;
  /** 1-based index řádku v Papa `data` (ne číslo řádku souboru s hlavičkou). */
  rowIndex: number;
  feeSuffix?: boolean;
}): string {
  const amt = Number(params.amount).toFixed(2);
  const desc = (params.description || '').trim();
  const base = `${params.completedDate}|${amt}|${params.currency}|${desc}|${params.type}|#${params.rowIndex}`;
  return params.feeSuffix ? `${base}|fee` : base;
}

function categorizeByDescription(description: string): {
  category: string;
  bucket: ImportBucket;
  categorySource?: ParsedImportRow['categorySource'];
} {
  // U převodů zkus nejprve protistranu („To XTB“ → XTB), pak celý popis.
  const party = extractTransferPartyName(description);
  for (const candidate of party ? [party, description] : [description]) {
    const mk = normalizeMerchantKey(candidate);
    const fromDict = mk ? lookupMerchantDictionary(mk) : null;
    if (fromDict) {
      return {
        category: fromDict,
        bucket: classifyDescription(candidate),
        categorySource: 'dictionary',
      };
    }
  }
  const bucket = classifyDescription(description);
  return {
    bucket,
    category: bucketToStoreCategory(bucket, 'expense'),
    categorySource: 'keyword',
  };
}

/** Topup / Exchange / Transfer — sdílená pravidla, jinak běžná kategorizace. */
function categorizeTransferLike(
  description: string,
  ownerNames?: string | string[] | null,
): {
  category: string;
  bucket: ImportBucket;
  categorySource?: ParsedImportRow['categorySource'];
} {
  const names = coerceOwnerNames(ownerNames);
  const hit = matchImportTransferRules(description, names);
  if (hit?.kind === 'prevod') {
    return { category: 'Převod', bucket: 'Převod', categorySource: 'transfer' };
  }
  if (hit?.kind === 'investice') {
    return {
      category: 'Investice',
      bucket: 'Investice',
      categorySource: hit.reason === 'dictionary' ? 'dictionary' : 'keyword',
    };
  }
  return categorizeByDescription(description);
}

function pushMoneyRow(
  rows: ParsedImportRow[],
  opts: {
    date: string;
    bookingDate: string | null;
    rawAmount: number;
    description: string;
    type: 'income' | 'expense';
    category: string;
    bucket: ImportBucket;
    currency: string;
    bankTransactionId: string;
    isRefund?: boolean;
    categorySource?: ParsedImportRow['categorySource'];
  },
): void {
  const amount = Math.abs(opts.rawAmount);
  const isCzk = opts.currency === 'CZK';
  rows.push({
    date: opts.date,
    bookingDate: opts.bookingDate,
    rawAmount: opts.rawAmount,
    description: opts.description,
    type: opts.type,
    amount,
    bucket: opts.bucket,
    category: opts.category,
    source: 'revolut',
    bankTransactionId: opts.bankTransactionId,
    ...(opts.isRefund ? { isRefund: true } : {}),
    ...(opts.categorySource ? { categorySource: opts.categorySource } : {}),
    ...(isCzk
      ? { originalAmount: null, originalCurrency: null }
      : {
          originalAmount: amount,
          originalCurrency: opts.currency,
        }),
  });
}

export function parseRevolutCsv(
  text: string,
  _ownerAccounts: string[] = [],
  ownerNames?: string | string[] | null,
): { bank: BankFormat; rows: ParsedImportRow[] } | { error: string } {
  const names = coerceOwnerNames(ownerNames);
  if (!isRevolutCsvText(text)) {
    return { error: 'Soubor nevypadá jako výpis Revolut (očekávána EN hlavička Type,Product,…).' };
  }

  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
    delimiter: ',',
    transformHeader: (h: string) => h.replace(/^\uFEFF/, '').trim(),
  }) as {
    data: PapaRow[];
    errors?: { type?: string; message?: string }[];
  };

  if (parsed.errors?.length) {
    const fatal = parsed.errors.find(
      (e: { type?: string; message?: string }) => e.type === 'Quotes' || e.type === 'Delimiter',
    );
    if (fatal) {
      return { error: fatal.message || 'Chyba při čtení Revolut CSV.' };
    }
  }

  const rows: ParsedImportRow[] = [];
  let fileCurrency: string | null = null;
  const data = parsed.data || [];

  for (let i = 0; i < data.length; i++) {
    const rec = data[i]!;
    const rowIndex = i + 1; // 1-based v CSV datech
    const state = String(rec.State ?? '')
      .trim()
      .toUpperCase();
    if (state !== 'COMPLETED') continue;

    const revolutType = String(rec.Type ?? '').trim();
    if (!revolutType || SKIP_TYPES.has(revolutType)) continue;

    const currency = normCurrency(rec.Currency ?? '');
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      return {
        error: `Revolut výpis obsahuje nepodporovanou měnu ${currency || '(prázdná)'}. Podporováno: CZK, EUR, USD.`,
      };
    }
    if (fileCurrency == null) fileCurrency = currency;
    else if (fileCurrency !== currency) {
      return {
        error: `Revolut výpis míchá měny (${fileCurrency} a ${currency}). Importujte každý výpis zvlášť.`,
      };
    }

    const completedRaw = String(rec['Completed Date'] ?? '').trim();
    const startedRaw = String(rec['Started Date'] ?? '').trim();
    const date = ymdFromRaw(completedRaw);
    if (!date) continue;
    const bookingDate = ymdFromRaw(startedRaw);

    const description = String(rec.Description ?? '').trim() || revolutType;
    const rawAmount = parseAmount(rec.Amount ?? '');
    const feeAbs = Math.abs(parseAmount(rec.Fee ?? ''));

    // Hlavní pohyb (Amount == 0 přeskoč, Fee se řeší zvlášť)
    if (Math.abs(rawAmount) >= 0.005) {
      let type: 'income' | 'expense' = rawAmount >= 0 ? 'income' : 'expense';
      let category: string;
      let bucket: ImportBucket;
      let isRefund = false;
      let categorySource: ParsedImportRow['categorySource'] | undefined;

      switch (revolutType) {
        case 'Topup':
        case 'Exchange':
        case 'Transfer': {
          const cat = categorizeTransferLike(description, names);
          category = cat.category;
          bucket = cat.bucket;
          categorySource = cat.categorySource;
          break;
        }
        case 'Card Payment': {
          type = 'expense';
          const cat = categorizeByDescription(description);
          category = cat.category;
          bucket = cat.bucket;
          categorySource = cat.categorySource;
          break;
        }
        case 'Card Refund':
          type = 'income';
          isRefund = true;
          {
            const cat = categorizeByDescription(description);
            category = cat.category;
            bucket = cat.bucket;
            categorySource = cat.categorySource;
          }
          break;
        case 'Reward':
          type = 'income';
          category = 'Ostatní';
          bucket = 'Ostatní';
          break;
        case 'Fee':
          type = 'expense';
          category = 'Bankovní poplatky';
          bucket = 'Ostatní';
          break;
        default:
          // Neznámý typ — klasifikuj podle znaménka + popisu
          if (type === 'expense') {
            const cat = categorizeByDescription(description);
            category = cat.category;
            bucket = cat.bucket;
            categorySource = cat.categorySource;
          } else {
            category = 'Ostatní';
            bucket = 'Ostatní';
          }
          break;
      }

      pushMoneyRow(rows, {
        date,
        bookingDate,
        rawAmount,
        description,
        type,
        category,
        bucket,
        currency,
        bankTransactionId: buildRevolutBankTransactionId({
          completedDate: completedRaw,
          amount: rawAmount,
          currency,
          description,
          type: revolutType,
          rowIndex,
        }),
        isRefund,
        categorySource,
      });
    }

    // Fee sloupec → samostatná transakce Bankovní poplatky
    if (feeAbs >= 0.005) {
      pushMoneyRow(rows, {
        date,
        bookingDate,
        rawAmount: -feeAbs,
        description: `Poplatek · ${description}`,
        type: 'expense',
        category: 'Bankovní poplatky',
        bucket: 'Ostatní',
        currency,
        bankTransactionId: buildRevolutBankTransactionId({
          completedDate: completedRaw,
          amount: -feeAbs,
          currency,
          description,
          type: revolutType,
          rowIndex,
          feeSuffix: true,
        }),
      });
    }
  }

  if (rows.length === 0) {
    return { error: 'V Revolut CSV nebyly nalezeny žádné COMPLETED transakce.' };
  }

  return { bank: REVOLUT_FORMAT, rows };
}
