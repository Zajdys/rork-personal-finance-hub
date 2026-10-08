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
import { dryRunAisImport } from '../src/import-pipeline';
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
