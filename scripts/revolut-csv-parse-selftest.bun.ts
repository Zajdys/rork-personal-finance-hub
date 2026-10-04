/**
 * Self-test: Revolut EN CSV parser (CZK / EUR / USD).
 * Fixtures: scripts/fixtures/bank-csv/revolut/{czk,eur,usd}.csv
 * Run: bun scripts/revolut-csv-parse-selftest.bun.ts
 */
import './selftest-mocks.ts';
import { readFileSync } from 'fs';
import { join } from 'path';

const {
  isRevolutCsvText,
  parseRevolutCsv,
  buildRevolutBankTransactionId,
  REVOLUT_HEADER,
} = await import('../lib/revolut-csv-parse.ts');
const { parseBankStatementCsv } = await import('../lib/bank-statement-parser.ts');
const { normalizeMerchantKey } = await import('../lib/normalize-merchant-key.ts');
const { lookupMerchantDictionary } = await import('../lib/merchant-dictionary.ts');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}
function approx(a: number, b: number, eps = 0.02) {
  return Math.abs(a - b) <= eps;
}

/** Lokální kopie isTransferLike — finance-store tahá Expo/RN. */
function isTransferLike(t: { category?: string; type?: string }): boolean {
  if (t.category === 'Převod' || t.category === 'Vklad hotovosti') return true;
  if (t.category === 'Investice' && t.type === 'expense') return true;
  return t.type === 'transfer';
}

const FIX = join(import.meta.dir, 'fixtures/bank-csv/revolut');

type Expect = {
  file: string;
  currency: string;
  completedMain: number;
  feeCount: number;
  /** Výdaje = |Amount| výdajů + Fee sloupce (cílová tabulka). */
  expenseWithFees: number;
  income: number;
  /** Jen |Amount| výdajů bez Fee sloupců (pro kontrolu main). */
  expenseMain: number;
  byType: Record<string, number>;
};

const EXPECT: Expect[] = [
  {
    file: 'czk.csv',
    currency: 'CZK',
    completedMain: 504,
    feeCount: 9,
    expenseWithFees: 439_729.1,
    income: 439_744.91,
    expenseMain: 439_577.91,
    byType: {
      Topup: 106,
      Exchange: 242,
      'Card Payment': 80,
      Reward: 3,
      Transfer: 66,
      'Card Refund': 6,
      Fee: 1,
    },
  },
  {
    file: 'eur.csv',
    currency: 'EUR',
    completedMain: 448, // 457 COMPLETED − 9 CARD_CREDIT
    feeCount: 6,
    expenseWithFees: 22_906.12,
    income: 21_382.73, // bez CARD_CREDIT
    expenseMain: 22_903.6,
    byType: {
      Exchange: 190,
      'Card Payment': 91,
      Topup: 8,
      Transfer: 146,
      'Card Refund': 12,
      Fee: 1,
    },
  },
  {
    file: 'usd.csv',
    currency: 'USD',
    completedMain: 120,
    feeCount: 13,
    expenseWithFees: 3_032.38,
    income: 3_032.38,
    expenseMain: 3_027.85,
    byType: {
      Exchange: 74,
      'Card Payment': 42,
      'Card Refund': 4,
    },
  },
];

function revolutTypeFromId(id: string): string {
  // …|Type|#row  or  …|Type|#row|fee
  const parts = id.split('|');
  if (parts[parts.length - 1] === 'fee') {
    return parts[parts.length - 3] ?? '';
  }
  return parts[parts.length - 2] ?? '';
}

console.log('=== Revolut CSV parser self-test ===');

assert(isRevolutCsvText(REVOLUT_HEADER + '\n'), 'header detect');
assert(
  normalizeMerchantKey('Trading 212') === 'TRADING 212',
  `Trading 212 key=${normalizeMerchantKey('Trading 212')}`,
);
assert(lookupMerchantDictionary('ETORO') === 'Investice', 'ETORO → Investice');
assert(lookupMerchantDictionary('TRADING 212') === 'Investice', 'T212 → Investice');
assert(lookupMerchantDictionary('XTB') === 'Investice', 'XTB → Investice');
assert(lookupMerchantDictionary('ANYCOIN') === 'Investice', 'ANYCOIN → Investice');

// Exchange dual-leg: both sides are Převod → excluded from expense totals
const exchangeExpense = {
  id: 'x',
  type: 'expense' as const,
  amount: 3000,
  title: 'Exchanged to EUR',
  category: 'Převod',
  date: '2023-08-10',
};
assert(isTransferLike(exchangeExpense), 'Exchange Převod excluded from totals');
const investExpense = { ...exchangeExpense, category: 'Investice' };
assert(isTransferLike(investExpense), 'expense Investice excluded');
const investIncome = { ...exchangeExpense, type: 'income' as const, category: 'Investice' };
assert(!isTransferLike(investIncome), 'income Investice still counts');

for (const exp of EXPECT) {
  const text = readFileSync(join(FIX, exp.file), 'utf8');
  assert(isRevolutCsvText(text), `${exp.file} detect`);

  const parsed = parseRevolutCsv(text);
  assert(!('error' in parsed), `${exp.file} parse: ${'error' in parsed ? parsed.error : ''}`);
  if ('error' in parsed) continue;

  assert(parsed.bank.id === 'revolut', `${exp.file} bank id`);

  // Main rows = bez fee-splitů (bankTransactionId nekončí |fee)
  const main = parsed.rows.filter((r) => !String(r.bankTransactionId ?? '').endsWith('|fee'));
  const fees = parsed.rows.filter((r) => String(r.bankTransactionId ?? '').endsWith('|fee'));

  assert(fees.length === exp.feeCount, `${exp.file} fees ${fees.length} want ${exp.feeCount}`);
  assert(
    parsed.rows.length === exp.completedMain + exp.feeCount,
    `${exp.file} total rows ${parsed.rows.length}`,
  );

  // unique_key musí být unikátní (vč. dvojitých plateb ve stejné sekundě)
  const ids = parsed.rows.map((r) => r.bankTransactionId);
  assert(new Set(ids).size === ids.length, `${exp.file} unique bankTransactionId`);

  const byType: Record<string, number> = {};
  for (const r of main) {
    const type = revolutTypeFromId(String(r.bankTransactionId ?? ''));
    byType[type] = (byType[type] || 0) + 1;
  }

  for (const [t, n] of Object.entries(exp.byType)) {
    assert(byType[t] === n, `${exp.file} type ${t}: got ${byType[t]} want ${n}`);
  }
  assert(!byType['CARD_CREDIT'], `${exp.file} CARD_CREDIT skipped`);
  assert(!byType['TEMP_BLOCK'], `${exp.file} TEMP_BLOCK skipped`);

  // Sumy v původní měně
  let income = 0;
  let expenseMain = 0;
  for (const r of main) {
    if (r.rawAmount > 0) income += r.rawAmount;
    else expenseMain += Math.abs(r.rawAmount);
  }
  const feeSum = fees.reduce((s, r) => s + r.amount, 0);
  const expenseWithFees = expenseMain + feeSum;

  assert(approx(income, exp.income), `${exp.file} income ${income} want ${exp.income}`);
  assert(
    approx(expenseMain, exp.expenseMain),
    `${exp.file} expenseMain ${expenseMain} want ${exp.expenseMain}`,
  );
  assert(
    approx(expenseWithFees, exp.expenseWithFees),
    `${exp.file} expenseWithFees ${expenseWithFees} want ${exp.expenseWithFees}`,
  );

  assert(main.length === exp.completedMain, `${exp.file} main count ${main.length} want ${exp.completedMain}`);

  // Měna
  if (exp.currency === 'CZK') {
    assert(
      main.every((r) => r.originalCurrency == null && r.originalAmount == null),
      `${exp.file} CZK no original_*`,
    );
  } else {
    assert(
      main.every((r) => r.originalCurrency === exp.currency && r.originalAmount != null),
      `${exp.file} foreign original_*`,
    );
  }

  // Exchange: „Exchanged to X“ → Převod; Digital Assets → Investice
  const exchanges = main.filter((r) => revolutTypeFromId(String(r.bankTransactionId)) === 'Exchange');
  assert(exchanges.length > 0, `${exp.file} has Exchange rows`);
  for (const r of exchanges) {
    if (/Revolut\s+Digital\s+Assets/i.test(r.description)) {
      assert(r.category === 'Investice', `${exp.file} Digital Assets → Investice (${r.description})`);
    } else if (/^Exchanged\s+to\b/i.test(r.description)) {
      assert(r.category === 'Převod', `${exp.file} Exchanged to → Převod (${r.description})`);
    }
  }

  // Topup / Transfer: už NE blanket Převod — jen card top-up / vault / own name / exchange
  for (const tip of ['Topup', 'Transfer'] as const) {
    const xs = main.filter((r) => revolutTypeFromId(String(r.bankTransactionId)) === tip);
    for (const r of xs) {
      if (/^(Apple|Google)\s+Pay\s+top-up\b/i.test(r.description) || /^Top-up\s+by\b/i.test(r.description)) {
        assert(r.category === 'Převod', `${exp.file} card top-up → Převod (${r.description})`);
      }
      if (/\bSavings\s+Vault\b/i.test(r.description)) {
        assert(r.category === 'Převod', `${exp.file} Savings Vault → Převod`);
      }
      if (/\bFlexible\s+Cash\s+Funds\b/i.test(r.description) || /\binvestment\s+account\b/i.test(r.description)) {
        assert(r.category === 'Investice', `${exp.file} cash funds/investment → Investice`);
      }
      if (/^To\s+XTB\b/i.test(r.description) || /Payment\s+from\s+XTB\b/i.test(r.description)) {
        assert(r.category === 'Investice', `${exp.file} XTB → Investice (${r.description})`);
      }
      // Cizí jméno / firma NESMÍ být Převod
      if (/^Transfer\s+to\s+Petra\b/i.test(r.description) || /^Payment\s+from\s+MONTESONO\b/i.test(r.description)) {
        assert(r.category !== 'Převod', `${exp.file} third-party not Převod (${r.description})`);
      }
    }
  }

  // Fee splits
  assert(
    fees.every((r) => r.category === 'Bankovní poplatky' && r.type === 'expense'),
    `${exp.file} fee splits`,
  );

  // Broker card payments → Investice
  const brokerCards = main.filter(
    (r) =>
      revolutTypeFromId(String(r.bankTransactionId)) === 'Card Payment' &&
      /^(etoro|trading 212|xtb)$/i.test(r.description.trim()),
  );
  assert(
    brokerCards.length > 0 && brokerCards.every((r) => r.category === 'Investice'),
    `${exp.file} broker cards → Investice`,
  );

  // Via main parser
  const via = parseBankStatementCsv(text);
  assert(!('error' in via) && via.bank.id === 'revolut', `${exp.file} via main`);
  assert(via.rows.length === parsed.rows.length, `${exp.file} via row count`);

  console.log(
    `OK ${exp.file}: total=${parsed.rows.length} main=${main.length} fees=${fees.length} ${exp.currency} exp=${expenseWithFees.toFixed(2)}`,
  );
}

// Dedup id shape (+ row index)
const id = buildRevolutBankTransactionId({
  completedDate: '2023-08-10 09:52:22',
  amount: -3000,
  currency: 'CZK',
  description: 'Exchanged to EUR',
  type: 'Exchange',
  rowIndex: 2,
});
assert(
  id === '2023-08-10 09:52:22|-3000.00|CZK|Exchanged to EUR|Exchange|#2',
  `id shape ${id}`,
);

// Stejná platba 2× → různý klíč
const idA = buildRevolutBankTransactionId({
  completedDate: '2026-03-22 14:57:21',
  amount: -23.33,
  currency: 'CZK',
  description: 'PDF House',
  type: 'Card Payment',
  rowIndex: 436,
});
const idB = buildRevolutBankTransactionId({
  completedDate: '2026-03-22 14:57:21',
  amount: -23.33,
  currency: 'CZK',
  description: 'PDF House',
  type: 'Card Payment',
  rowIndex: 437,
});
assert(idA !== idB, 'duplicate payment distinct keys');

console.log('=== ALL Revolut CSV tests passed ===');
