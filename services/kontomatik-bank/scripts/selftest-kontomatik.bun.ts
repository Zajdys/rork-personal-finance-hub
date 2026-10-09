/**
 * Self-test: fingerprint + dedupe (+ optional live KontoBank mock-session).
 * Run from services/kontomatik-bank:
 *   bun --env-file=.env.local run scripts/selftest-kontomatik.bun.ts
 */
import { loadTestEnv } from '../src/env';
import {
  assignKontomatikTxIds,
  buildKontomatikTxId,
  type AisMoneyTx,
} from '../src/kontomatik/fingerprint';
import { KontomatikClient, sinceDaysAgo } from '../src/kontomatik/client';
import {
  computeDedupeDateWindow,
  dryRunAisImport,
} from '../src/import-pipeline';
import type { ExistingTx } from '../src/dedupe/match';
import { encryptMultipleAccessId, decryptMultipleAccessId } from '../src/crypto/token';
import { canSyncNow } from '../src/sync-quota';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function coffeeTx(balance: number): AisMoneyTx {
  return {
    transactionOn: '2026-03-01',
    bookedOn: '2026-03-01',
    currencyAmount: -59,
    currencyBalance: balance,
    partyIban: null,
    party: 'KAFE S.R.O.',
    title: 'KAFE',
    kind: 'CARD',
    status: 'DONE',
    variableSymbol: null,
    constantSymbol: null,
  };
}

console.log('=== kontomatik-bank selftest ===');

// --- crypto roundtrip ---
{
  const key = 'test-token-enc-key-do-not-use-prod';
  const { encHex, nonceHex } = encryptMultipleAccessId('ma-token-abc', key);
  assert(
    decryptMultipleAccessId(encHex, nonceHex, key) === 'ma-token-abc',
    'crypto roundtrip',
  );
}

// --- quota ---
{
  const a = canSyncNow({ sync_window_start: null, sync_count_in_window: 0 });
  assert(a.ok && a.next.sync_count_in_window === 1, 'quota first');
  let state = a.next;
  for (let i = 0; i < 3; i++) {
    const r = canSyncNow(state);
    assert(r.ok, `quota ${i + 2}`);
    state = r.next;
  }
  const blocked = canSyncNow(state);
  assert(!blocked.ok, 'quota 5th blocked');
}

// --- 1) Two identical same-day payments with different currencyBalance → 2 ids ---
console.log('--- fingerprint: 2× same-day coffee ---');
{
  const iban = 'CZ6508000000192000145399';
  const txs = [coffeeTx(1000.0), coffeeTx(941.0)];
  const ids = assignKontomatikTxIds(iban, txs);
  assert(ids.length === 2, '2 ids');
  assert(ids[0] !== ids[1], `ids must differ: ${ids[0]} vs ${ids[1]}`);
  assert(ids[0]!.startsWith('ktx:'), 'prefix 0');
  assert(ids[1]!.startsWith('ktx:'), 'prefix 1');

  // Same inputs → stable
  assert(
    buildKontomatikTxId({ accountIban: iban, tx: txs[0]! }) === ids[0],
    'stable id 0',
  );

  const mapped = dryRunAisImport(
    'user-1',
    'KontoBankApi',
    'KontoBank',
    [{ iban, moneyTransactions: txs }],
    [],
  );
  assert(mapped.toInsert.length === 2, `insert 2 got ${mapped.toInsert.length}`);
  assert(mapped.rows[0]!.kontomatik_tx_id !== mapped.rows[1]!.kontomatik_tx_id, 'row ids differ');
}

// --- 2) Repeated sync → 0 new inserts ---
console.log('--- dedupe: resync → 0 new ---');
{
  const iban = 'CZ6508000000192000145399';
  const txs = [coffeeTx(1000.0), coffeeTx(941.0)];
  const first = dryRunAisImport(
    'user-1',
    'KontoBankApi',
    'KontoBank',
    [{ iban, moneyTransactions: txs }],
    [],
  );
  assert(first.toInsert.length === 2, 'first insert 2');

  const existing: ExistingTx[] = first.toInsert.map((r, i) => ({
    id: `db-${i}`,
    date: r.date,
    amount: r.amount,
    type: r.type,
    description: r.description,
    counterparty_account: r.counterparty_account,
    merchant_key: r.merchant_key,
    category: r.category,
    category_source: r.category_source,
    kontomatik_tx_id: r.kontomatik_tx_id,
    source: r.source,
  }));

  const second = dryRunAisImport(
    'user-1',
    'KontoBankApi',
    'KontoBank',
    [{ iban, moneyTransactions: txs }],
    existing,
  );
  assert(second.toInsert.length === 0, `resync inserts ${second.toInsert.length}`);
  assert(second.enrichments.length === 2, `resync enrich ${second.enrichments.length}`);
}

// --- 3) Match existing PDF row → enrich kontomatik_tx_id, keep category_source=user ---
console.log('--- dedupe: PDF enrich, preserve user category ---');
{
  const iban = 'CZ6508000000192000145399';
  const txs = [coffeeTx(500.0)];
  const mapped = dryRunAisImport(
    'user-1',
    'cs',
    'Česká spořitelna',
    [{ iban, moneyTransactions: txs }],
    [],
  );
  const aisRow = mapped.rows[0]!;

  const pdfExisting: ExistingTx[] = [
    {
      id: 'pdf-1',
      date: aisRow.date,
      amount: 59,
      type: 'expense',
      description: 'KAFE Praha',
      counterparty_account: null,
      merchant_key: 'KAFE',
      category: 'Jídlo',
      category_source: 'user',
      kontomatik_tx_id: null,
      source: aisRow.source,
    },
  ];

  const result = dryRunAisImport(
    'user-1',
    'cs',
    'Česká spořitelna',
    [{ iban, moneyTransactions: txs }],
    pdfExisting,
  );
  assert(result.toInsert.length === 0, `PDF match should not insert (got ${result.toInsert.length})`);
  assert(result.enrichments.length === 1, 'one enrichment');
  assert(
    result.enrichments[0]!.kontomatik_tx_id === aisRow.kontomatik_tx_id,
    'enriched id',
  );
  assert(
    result.enrichments[0]!.category_source === 'user',
    'preserve user category_source flag',
  );
}

// --- missing balance seq fallback ---
console.log('--- fingerprint: missing balance seq ---');
{
  const iban = 'CZ00';
  const base: AisMoneyTx = {
    ...coffeeTx(0),
    currencyBalance: null,
  };
  const ids = assignKontomatikTxIds(iban, [base, { ...base }]);
  assert(ids[0] !== ids[1], 'missing-balance seq differs');
}

// --- A/B: IBAN vs domestic + merchant_key + Převod ---
console.log('--- dedupe/classify: IBAN↔domestic, GOPAY, HORNBACH, Převod ---');
{
  const ownIban = 'CZ5508000000001234567890';
  const savingsDomestic = '1234567890/0800'; // stejný účet jako ownIban v domácím tvaru
  // Anonymizovaný RB běžný: CZ45 5500 … 0767628012 ↔ 767628012/5500
  const counterpartyIban = 'CZ4555000000000767628012';
  const counterpartyDomestic = '767628012/5500';

  const aisIban = 'CZ6555000000000999888777';
  const txs: AisMoneyTx[] = [
    {
      transactionOn: '2026-04-10',
      bookedOn: '2026-04-10',
      currencyAmount: -199,
      currencyBalance: 5000,
      partyIban: null,
      party: 'GOPAY *TELLY.CZ',
      title: 'Platba',
      kind: 'CARD',
      status: 'DONE',
      variableSymbol: null,
      constantSymbol: null,
    },
    {
      transactionOn: '2026-04-11',
      bookedOn: '2026-04-12', // ±1 den vs PDF
      currencyAmount: -1250.5,
      currencyBalance: 3749.5,
      partyIban: null,
      party: 'HORNBACH 666 PLZEN',
      title: 'Platba',
      kind: 'CARD',
      status: 'DONE',
      variableSymbol: null,
      constantSymbol: null,
    },
    {
      transactionOn: '2026-04-13',
      bookedOn: '2026-04-13',
      currencyAmount: -5000,
      currencyBalance: 0,
      partyIban: counterpartyIban,
      party: null,
      title: 'Platba',
      kind: 'TRANSFER',
      status: 'DONE',
      variableSymbol: null,
      constantSymbol: null,
    },
    {
      // převod na vlastní spořák (owner_bank_accounts v domestic tvaru)
      transactionOn: '2026-04-14',
      bookedOn: '2026-04-14',
      currencyAmount: -2000,
      currencyBalance: -2000,
      partyIban: ownIban,
      party: null,
      title: 'Platba',
      kind: 'TRANSFER',
      status: 'DONE',
      variableSymbol: null,
      constantSymbol: null,
    },
  ];

  const mapped = dryRunAisImport(
    'user-rb',
    'RaiffeisenbankApi',
    'Raiffeisenbank',
    [{ iban: aisIban, moneyTransactions: txs }],
    [],
    { ownerAccounts: [savingsDomestic] },
  );

  const gopay = mapped.rows.find((r) => r.amount === 199)!;
  assert(!!gopay, 'gopay row');
  assert(
    gopay.merchant_key === 'GOPAY TELLY',
    `gopay key got ${gopay.merchant_key}`,
  );
  assert(
    gopay.category !== 'Ostatní',
    `gopay category should classify, got ${gopay.category}`,
  );
  assert(gopay.category_source !== 'import' || gopay.category !== 'Ostatní', 'gopay not bare import Ostatní');
  assert(
    gopay.description === 'GOPAY *TELLY.CZ',
    `gopay description ${gopay.description}`,
  );
  assert(
    !/platba kartou/i.test(gopay.description),
    'description must not include transaction type',
  );

  const alzaOnly = dryRunAisImport(
    'user-rb',
    'RaiffeisenbankApi',
    'Raiffeisenbank',
    [
      {
        iban: aisIban,
        moneyTransactions: [
          {
            transactionOn: '2026-04-15',
            bookedOn: '2026-04-15',
            currencyAmount: -999,
            currencyBalance: 4000,
            partyIban: null,
            party: 'Alza; Plzen; CZE',
            title: 'Platba kartou',
            kind: 'CARD',
            status: 'DONE',
            variableSymbol: null,
            constantSymbol: null,
          },
        ],
      },
    ],
    [],
  );
  assert(
    alzaOnly.rows[0]!.description === 'Alza',
    `alza description got ${alzaOnly.rows[0]!.description}`,
  );

  const hornbach = mapped.rows.find((r) => r.amount === 1250.5)!;
  assert(hornbach.merchant_key === 'HORNBACH', `hornbach key ${hornbach.merchant_key}`);
  assert(
    hornbach.category === 'Domácnost a nábytek',
    `hornbach cat ${hornbach.category}`,
  );
  assert(hornbach.category_source === 'dictionary', `hornbach src ${hornbach.category_source}`);

  const transferOwn = mapped.rows.find((r) => r.amount === 2000)!;
  assert(transferOwn.category === 'Převod', `own transfer cat ${transferOwn.category}`);
  assert(
    transferOwn.category_source === 'transfer',
    `own transfer source ${transferOwn.category_source}`,
  );

  // PDF řádky (domácí účet / kratší merchant) → enrich, ne insert
  const pdfExisting: ExistingTx[] = [
    {
      id: 'pdf-gopay',
      date: '2026-04-10',
      amount: 199,
      type: 'expense',
      description: 'GOPAY TELLY',
      counterparty_account: null,
      merchant_key: 'GOPAY TELLY',
      category: 'Nákupy',
      category_source: 'dictionary',
      kontomatik_tx_id: null,
      source: mapped.bank,
    },
    {
      id: 'pdf-hornbach',
      date: '2026-04-11',
      amount: 1250.5,
      type: 'expense',
      description: 'HORNBACH',
      counterparty_account: null,
      merchant_key: 'HORNBACH',
      category: 'Domácnost a nábytek',
      category_source: 'dictionary',
      kontomatik_tx_id: null,
      source: mapped.bank,
    },
    {
      id: 'pdf-transfer-cp',
      date: '2026-04-13',
      amount: 5000,
      type: 'expense',
      description: 'Platba',
      counterparty_account: counterpartyDomestic,
      merchant_key: null,
      category: 'Platby lidem',
      category_source: 'import',
      kontomatik_tx_id: null,
      source: mapped.bank,
    },
  ];

  const deduped = dryRunAisImport(
    'user-rb',
    'RaiffeisenbankApi',
    'Raiffeisenbank',
    [{ iban: aisIban, moneyTransactions: txs }],
    pdfExisting,
    { ownerAccounts: [savingsDomestic] },
  );
  // 3 PDF matches enrich; vlastní převod 2000 je nový insert
  assert(
    deduped.enrichments.length === 3,
    `expected 3 enrichments, got ${deduped.enrichments.length}`,
  );
  assert(
    deduped.toInsert.length === 1 && deduped.toInsert[0]!.amount === 2000,
    `expected 1 insert (own transfer), got ${deduped.toInsert.length}`,
  );
  assert(
    deduped.toInsert[0]!.category === 'Převod',
    'inserted own transfer stays Převod',
  );
}

// --- dedupe 1:1: opakované stejné platby ---
console.log('--- dedupe: 4 AIS × 4 PDF → 0 new; 4×3 → 1 new ---');
{
  const savings = '1234567890/0800';
  const bank = 'raiffeisenbank';
  const dates = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-03'];
  const aisTxs: AisMoneyTx[] = dates.map((d, i) => ({
    transactionOn: d,
    bookedOn: d,
    currencyAmount: -1000,
    currencyBalance: 10000 - (i + 1) * 1000,
    partyIban: 'CZ5508000000001234567890',
    party: null,
    title: 'Platba',
    kind: 'TRANSFER',
    status: 'DONE',
    variableSymbol: null,
    constantSymbol: null,
  }));

  const pdf4: ExistingTx[] = dates.map((d, i) => ({
    id: `pdf-1k-${i}`,
    date: d,
    amount: 1000,
    type: 'expense' as const,
    description: 'Převod',
    counterparty_account: savings,
    merchant_key: null,
    category: 'Převod',
    category_source: 'transfer',
    kontomatik_tx_id: null,
    source: bank,
  }));

  const fourFour = dryRunAisImport(
    'user-1k',
    'RaiffeisenbankApi',
    'Raiffeisenbank',
    [{ iban: 'CZ6555000000000999888777', moneyTransactions: aisTxs }],
    pdf4,
    { ownerAccounts: [savings] },
  );
  assert(fourFour.toInsert.length === 0, `4×4 inserts ${fourFour.toInsert.length}`);
  assert(
    fourFour.enrichments.length === 4,
    `4×4 enrich ${fourFour.enrichments.length}`,
  );

  const pdf3 = pdf4.slice(0, 3);
  const fourThree = dryRunAisImport(
    'user-1k',
    'RaiffeisenbankApi',
    'Raiffeisenbank',
    [{ iban: 'CZ6555000000000999888777', moneyTransactions: aisTxs }],
    pdf3,
    { ownerAccounts: [savings] },
  );
  assert(fourThree.toInsert.length === 1, `4×3 inserts ${fourThree.toInsert.length}`);
  assert(
    fourThree.enrichments.length === 3,
    `4×3 enrich ${fourThree.enrichments.length}`,
  );
  assert(
    !fourThree.toInsert[0]!.import_needs_review,
    'excess AIS only → insert without review',
  );

  // Stejný obchodník 4×115 Kč
  const shopDates = ['2026-06-01', '2026-06-01', '2026-06-02', '2026-06-03'];
  const shopAis: AisMoneyTx[] = shopDates.map((d, i) => ({
    transactionOn: d,
    bookedOn: d,
    currencyAmount: -115,
    currencyBalance: 5000 - (i + 1) * 115,
    partyIban: null,
    party: 'KAFE S.R.O.',
    title: 'Platba',
    kind: 'CARD',
    status: 'DONE',
    variableSymbol: null,
    constantSymbol: null,
  }));
  const shopPdf: ExistingTx[] = shopDates.map((d, i) => ({
    id: `pdf-kafe-${i}`,
    date: d,
    amount: 115,
    type: 'expense' as const,
    description: 'KAFE',
    counterparty_account: null,
    merchant_key: 'KAFE',
    category: 'Jídlo a nápoje',
    category_source: 'dictionary',
    kontomatik_tx_id: null,
    source: bank,
  }));
  const shop = dryRunAisImport(
    'user-kafe',
    'RaiffeisenbankApi',
    'Raiffeisenbank',
    [{ iban: 'CZ6555000000000999888777', moneyTransactions: shopAis }],
    shopPdf,
  );
  assert(shop.toInsert.length === 0, `4× kafe inserts ${shop.toInsert.length}`);
  assert(shop.enrichments.length === 4, `4× kafe enrich ${shop.enrichments.length}`);
}

// --- dedupe: >1000 existujících, shoda až na konci ---
console.log('--- dedupe: match after 1000+ filler rows ---');
{
  const matchDate = '2026-07-14';
  const aisTx: AisMoneyTx = {
    transactionOn: matchDate,
    bookedOn: matchDate,
    currencyAmount: -340,
    currencyBalance: 10000,
    partyIban: null,
    party: 'GOPAY *TELLY.CZ',
    title: 'Platba',
    kind: 'CARD',
    status: 'DONE',
    variableSymbol: null,
    constantSymbol: null,
  };
  const bank = 'raiffeisenbank';
  const filler: ExistingTx[] = [];
  for (let i = 0; i < 1200; i++) {
    filler.push({
      id: `filler-${i}`,
      date: '2020-01-01',
      amount: 1 + (i % 50) * 0.01,
      type: 'expense',
      description: `Filler ${i}`,
      counterparty_account: null,
      merchant_key: `FILLER${i}`,
      category: 'Ostatní',
      category_source: 'import',
      kontomatik_tx_id: null,
      source: bank,
    });
  }
  filler.push({
    id: 'pdf-tail-match',
    date: matchDate,
    amount: 340,
    type: 'expense',
    description: 'GOPAY TELLY',
    counterparty_account: null,
    merchant_key: 'GOPAY TELLY',
    category: 'Nákupy',
    category_source: 'dictionary',
    kontomatik_tx_id: null,
    source: bank,
  });

  const win = computeDedupeDateWindow([matchDate]);
  assert(win?.from === '2026-07-11', `window from ${win?.from}`);
  assert(win?.to === '2026-07-17', `window to ${win?.to}`);

  const inWindow = filler.filter(
    (e) => e.date >= win!.from && e.date <= win!.to,
  );
  assert(inWindow.length === 1, `inWindow ${inWindow.length}`);

  const result = dryRunAisImport(
    'user-big',
    'RaiffeisenbankApi',
    'Raiffeisenbank',
    [{ iban: 'CZ6555000000000999888777', moneyTransactions: [aisTx] }],
    filler,
  );
  assert(result.toInsert.length === 0, `should enrich, inserts ${result.toInsert.length}`);
  assert(result.enrichments.length === 1, `enrichments ${result.enrichments.length}`);
  assert(
    result.enrichments[0]!.id === 'pdf-tail-match',
    'matched tail PDF row',
  );
}

// --- optional live KontoBank mock-session ---
const testEnv = loadTestEnv();
if (!testEnv.kontomatikApiKey) {
  console.log('--- live mock-session: SKIP (no KONTOMATIK_API_KEY in env) ---');
} else {
  console.log('--- live mock-session KontoBank ---');
  console.log('  mock params', {
    country: testEnv.mockCountry,
    login: testEnv.mockLogin,
    ownerEmail: testEnv.mockOwnerEmail,
  });
  const kt = new KontomatikClient({
    apiKey: testEnv.kontomatikApiKey,
    baseUrl: testEnv.kontomatikBaseUrl,
  });
  const ownerExternalId = `selftest-${Date.now()}`;
  // Coverage: https://developer.kontomatik.com/coverage?resource=test-accounts
  // CZ | test1 | OWNER | CZK (password/SMS Test123)
  const session = await kt.createMockSession({
    login: testEnv.mockLogin,
    country: testEnv.mockCountry,
    ownerExternalId,
    multipleAccess: true,
    ownerEmail: testEnv.mockOwnerEmail,
  });
  assert(!!session.sessionId, 'sessionId');
  assert(!!session.sessionIdSignature, 'signature');
  console.log('  mock session ok', {
    sessionId: session.sessionId,
    hasMa: !!session.multipleAccessId,
  });

  const commandId = await kt.defaultImport({
    sessionId: session.sessionId,
    sessionIdSignature: session.sessionIdSignature,
    since: sinceDaysAgo(90),
  });
  const imported = await kt.pollImportResult(commandId, {
    intervalMs: 2500,
    maxAttempts: 40,
  });
  assert(imported.accounts.length > 0, 'import accounts');
  const txCount = imported.accounts.reduce(
    (s, a) => s + a.moneyTransactions.length,
    0,
  );
  console.log('  import ok', {
    accounts: imported.accounts.length,
    txs: txCount,
    status: imported.commandStatus,
    state: imported.commandState,
    target: imported.target,
  });

  const dry = dryRunAisImport(
    ownerExternalId,
    imported.target,
    imported.officialName,
    imported.accounts,
    [],
  );
  assert(dry.toInsert.length > 0, 'mapped inserts');
  const again = dryRunAisImport(
    ownerExternalId,
    imported.target,
    imported.officialName,
    imported.accounts,
    dry.toInsert.map((r, i) => ({
      id: `x-${i}`,
      date: r.date,
      amount: r.amount,
      type: r.type,
      description: r.description,
      counterparty_account: r.counterparty_account,
      merchant_key: r.merchant_key,
      category_source: 'import',
      kontomatik_tx_id: r.kontomatik_tx_id,
      source: r.source,
    })),
  );
  assert(again.toInsert.length === 0, 'live resync 0 inserts');

  if (session.multipleAccessId) {
    await kt.revokeMultipleAccess(session.multipleAccessId);
    console.log('  revoked multipleAccessId');
  }
}

console.log('kontomatik-bank selftest: OK');
