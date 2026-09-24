/**
 * Anycoin CSV export → investment_transactions.
 *
 * Typy:
 * - deposit (CZK) → deposit
 * - trade payment (CZK) + trade fill (BTC) se stejným Order ID → 1× buy
 * - trade refund (CZK) → withdrawal (snižuje Vloženo)
 * - withdrawal (BTC) → transfer_out (evidence na Trezor; NEODEČÍTÁ držení)
 * - withdrawal_block / withdrawal_unblock → přeskočit
 */

export type AnycoinTransactionType =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'deposit'
  | 'withdrawal'
  | 'fee'
  | 'promo'
  | 'transfer_out'
  | 'gift';

export type ParsedAnycoinTransaction = {
  type: AnycoinTransactionType;
  ticker: string | null;
  isin: string | null;
  units: number | null;
  price_per_unit: number | null;
  amount: number;
  fee: number;
  original_currency: string;
  date: string;
  external_id: string;
  source: 'import';
  note?: string | null;
};

export type AnycoinParseResult = {
  transactions: ParsedAnycoinTransaction[];
  skipped: number;
  warnings: string[];
  summary: Record<AnycoinTransactionType, { count: number; amountSum: number; unitsSum: number }>;
};

function emptySummary(): AnycoinParseResult['summary'] {
  return {
    buy: { count: 0, amountSum: 0, unitsSum: 0 },
    sell: { count: 0, amountSum: 0, unitsSum: 0 },
    dividend: { count: 0, amountSum: 0, unitsSum: 0 },
    deposit: { count: 0, amountSum: 0, unitsSum: 0 },
    withdrawal: { count: 0, amountSum: 0, unitsSum: 0 },
    fee: { count: 0, amountSum: 0, unitsSum: 0 },
    promo: { count: 0, amountSum: 0, unitsSum: 0 },
    transfer_out: { count: 0, amountSum: 0, unitsSum: 0 },
    gift: { count: 0, amountSum: 0, unitsSum: 0 },
  };
}

function splitLines(text: string): string[] {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
}

function detectDelimiter(headerLine: string): ',' | ';' {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  return semis > commas ? ';' : ',';
}

function splitCsvLine(line: string, delimiter: ',' | ';'): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function normHeader(h: string): string {
  return h
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

type ColMap = {
  date: number;
  type: number;
  amount: number;
  currency: number;
  orderId: number;
  txId: number;
  description: number;
  fundingId: number;
  tradeId: number;
};

function resolveColumns(headers: string[]): ColMap | null {
  const h = headers.map(normHeader);
  const find = (...names: string[]) =>
    h.findIndex((s) => names.some((n) => s === n || s.includes(n)));

  const date = find('date', 'datum');
  const type = find('type', 'typ');
  const amount = find('amount', 'částka', 'castka');
  const currency = find('currency', 'měna', 'mena');
  const orderId = find('order id', 'orderid');
  const txId = find('anycoin tx id', 'tx id', 'txid');
  const description = find('description', 'popis');
  const fundingId = find('funding id', 'fundingid');
  const tradeId = find('trade id', 'tradeid');

  if (date < 0 || type < 0 || amount < 0 || currency < 0) return null;

  return {
    date,
    type,
    amount,
    currency,
    orderId: orderId >= 0 ? orderId : -1,
    txId: txId >= 0 ? txId : -1,
    description: description >= 0 ? description : -1,
    fundingId: fundingId >= 0 ? fundingId : -1,
    tradeId: tradeId >= 0 ? tradeId : -1,
  };
}

function cell(cells: string[], idx: number): string {
  if (idx < 0 || idx >= cells.length) return '';
  return (cells[idx] ?? '').trim();
}

function parseAmount(raw: string): number {
  if (!raw || !String(raw).trim()) return 0;
  let t = String(raw).trim().replace(/\s/g, '').replace(/'/g, '');
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma > lastDot && lastComma !== -1) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else {
    t = t.replace(/,/g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** Date → YYYY-MM-DD (ISO, EU dd.mm.yyyy, Excel-ish). */
export function parseAnycoinDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const eu = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (eu) {
    return `${eu[3]}-${eu[2]!.padStart(2, '0')}-${eu[1]!.padStart(2, '0')}`;
  }
  const ms = Date.parse(s);
  if (Number.isFinite(ms)) return new Date(ms).toISOString().slice(0, 10);
  return null;
}

function normType(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_');
}

type RawRow = {
  date: string;
  type: string;
  amount: number;
  currency: string;
  orderId: string;
  txId: string;
  description: string;
  fundingId: string;
  tradeId: string;
};

function externalId(txId: string, fallbackKey: string): string {
  const id = txId.trim();
  if (id) return `anycoin:${id}`;
  return `anycoin:${fallbackKey}`;
}

function summarize(txs: ParsedAnycoinTransaction[]): AnycoinParseResult['summary'] {
  const summary = emptySummary();
  for (const tx of txs) {
    summary[tx.type].count += 1;
    summary[tx.type].amountSum += tx.amount;
    summary[tx.type].unitsSum += Math.abs(tx.units ?? 0);
  }
  return summary;
}

/**
 * Detekce Anycoin CSV podle hlavičky.
 */
export function isAnycoinCsv(text: string): boolean {
  const lines = splitLines(text);
  if (lines.length < 1) return false;
  const header = normHeader(lines[0]!);
  return (
    header.includes('anycoin tx id') ||
    (header.includes('type') &&
      header.includes('amount') &&
      header.includes('currency') &&
      (header.includes('funding id') || header.includes('order id')))
  );
}

/**
 * Parsuje Anycoin CSV export.
 */
export function parseAnycoinCsv(csvText: string): AnycoinParseResult {
  const lines = splitLines(csvText);
  const warnings: string[] = [];
  let skipped = 0;

  if (lines.length < 2) {
    return {
      transactions: [],
      skipped: 0,
      warnings: ['Prázdný CSV soubor.'],
      summary: emptySummary(),
    };
  }

  const delimiter = detectDelimiter(lines[0]!);
  const headers = splitCsvLine(lines[0]!, delimiter);
  const col = resolveColumns(headers);
  if (!col) {
    return {
      transactions: [],
      skipped: 0,
      warnings: ['Nepodařilo se rozpoznat sloupce Anycoin CSV.'],
      summary: emptySummary(),
    };
  }

  const rawRows: RawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!, delimiter);
    const typeRaw = cell(cells, col.type);
    if (!typeRaw) {
      skipped += 1;
      continue;
    }
    const date = parseAnycoinDate(cell(cells, col.date));
    if (!date) {
      warnings.push(`Řádek ${i + 1}: neplatné datum.`);
      skipped += 1;
      continue;
    }
    rawRows.push({
      date,
      type: normType(typeRaw),
      amount: parseAmount(cell(cells, col.amount)),
      currency: cell(cells, col.currency).toUpperCase() || 'CZK',
      orderId: cell(cells, col.orderId),
      txId: cell(cells, col.txId),
      description: cell(cells, col.description),
      fundingId: cell(cells, col.fundingId),
      tradeId: cell(cells, col.tradeId),
    });
  }

  const transactions: ParsedAnycoinTransaction[] = [];

  // trade payment + trade fill párování přes Order ID
  const paymentsByOrder = new Map<string, RawRow[]>();
  const fillsByOrder = new Map<string, RawRow[]>();

  for (const row of rawRows) {
    const t = row.type;
    if (t === 'withdrawal_block' || t === 'withdrawal_unblock') {
      skipped += 1;
      continue;
    }

    if (t === 'trade_payment' || t === 'tradepayment') {
      const key = row.orderId || row.tradeId || row.txId;
      if (!key) {
        warnings.push(`trade payment bez Order ID (${row.date}) — přeskočeno.`);
        skipped += 1;
        continue;
      }
      const list = paymentsByOrder.get(key) ?? [];
      list.push(row);
      paymentsByOrder.set(key, list);
      continue;
    }

    if (t === 'trade_fill' || t === 'tradefill') {
      const key = row.orderId || row.tradeId || row.txId;
      if (!key) {
        warnings.push(`trade fill bez Order ID (${row.date}) — přeskočeno.`);
        skipped += 1;
        continue;
      }
      const list = fillsByOrder.get(key) ?? [];
      list.push(row);
      fillsByOrder.set(key, list);
      continue;
    }

    if (t === 'deposit') {
      const amt = Math.abs(row.amount);
      if (!(amt > 0)) {
        skipped += 1;
        continue;
      }
      transactions.push({
        type: 'deposit',
        ticker: null,
        isin: null,
        units: null,
        price_per_unit: null,
        amount: amt,
        fee: 0,
        original_currency: row.currency || 'CZK',
        date: row.date,
        external_id: externalId(row.txId, `deposit:${row.date}:${amt}:${row.currency}`),
        source: 'import',
        note: row.description || null,
      });
      continue;
    }

    if (t === 'trade_refund' || t === 'traderefund') {
      const amt = Math.abs(row.amount);
      if (!(amt > 0)) {
        skipped += 1;
        continue;
      }
      // Refund snižuje Vloženo (jako withdrawal).
      transactions.push({
        type: 'withdrawal',
        ticker: null,
        isin: null,
        units: null,
        price_per_unit: null,
        amount: -amt,
        fee: 0,
        original_currency: row.currency || 'CZK',
        date: row.date,
        external_id: externalId(row.txId, `refund:${row.date}:${amt}:${row.currency}`),
        source: 'import',
        note: row.description || 'trade refund',
      });
      continue;
    }

    if (t === 'withdrawal') {
      const units = Math.abs(row.amount);
      if (!(units > 0)) {
        skipped += 1;
        continue;
      }
      // BTC na Trezor — evidence, ne prodej / ne odečet držení.
      transactions.push({
        type: 'transfer_out',
        ticker: row.currency || 'BTC',
        isin: null,
        units,
        price_per_unit: null,
        amount: units,
        fee: 0,
        original_currency: row.currency || 'BTC',
        date: row.date,
        external_id: externalId(row.txId, `transfer_out:${row.date}:${units}:${row.currency}`),
        source: 'import',
        note: row.description || 'withdrawal to wallet',
      });
      continue;
    }

    warnings.push(`Neznámý typ „${row.type}“ (${row.date}) — přeskočeno.`);
    skipped += 1;
  }

  // Párování buy
  const allOrderIds = new Set([...paymentsByOrder.keys(), ...fillsByOrder.keys()]);
  for (const orderId of allOrderIds) {
    const payments = paymentsByOrder.get(orderId) ?? [];
    const fills = fillsByOrder.get(orderId) ?? [];

    if (payments.length === 0 || fills.length === 0) {
      warnings.push(
        `Order ${orderId}: neúplný pár (payment=${payments.length}, fill=${fills.length}).`,
      );
      skipped += payments.length + fills.length;
      continue;
    }

    // Typicky 1 payment + 1 fill; při více sečti.
    const czkPaid = payments.reduce((s, p) => s + Math.abs(p.amount), 0);
    const btcFilled = fills.reduce((s, f) => s + Math.abs(f.amount), 0);
    const payCcy = payments[0]!.currency || 'CZK';
    const fillCcy = (fills[0]!.currency || 'BTC').toUpperCase();
    const date = fills[0]!.date || payments[0]!.date;
    const txIdForBuy =
      fills.map((f) => f.txId).filter(Boolean).join('+') ||
      payments.map((p) => p.txId).filter(Boolean).join('+') ||
      orderId;

    if (!(czkPaid > 0) || !(btcFilled > 0)) {
      warnings.push(`Order ${orderId}: nulová částka — přeskočeno.`);
      skipped += payments.length + fills.length;
      continue;
    }

    const pricePerUnit = czkPaid / btcFilled;
    transactions.push({
      type: 'buy',
      ticker: fillCcy === 'BTC' ? 'BTC' : fillCcy,
      isin: null,
      units: btcFilled,
      price_per_unit: Math.round(pricePerUnit * 1e8) / 1e8,
      amount: czkPaid,
      fee: 0,
      original_currency: payCcy,
      date,
      external_id: externalId(txIdForBuy, `buy:${orderId}`),
      source: 'import',
      note: `Order ${orderId}`,
    });
  }

  transactions.sort((a, b) => a.date.localeCompare(b.date) || a.external_id.localeCompare(b.external_id));

  // Dedupe podle external_id (poslední vyhraje)
  const byId = new Map<string, ParsedAnycoinTransaction>();
  for (const tx of transactions) byId.set(tx.external_id, tx);
  const deduped = [...byId.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.external_id.localeCompare(b.external_id),
  );

  return {
    transactions: deduped,
    skipped,
    warnings,
    summary: summarize(deduped),
  };
}

export function logAnycoinParseSummary(result: AnycoinParseResult): void {
  console.log(
    `[anycoin] Parsed ${result.transactions.length} transactions (skipped ${result.skipped}).`,
  );
  for (const type of Object.keys(result.summary) as AnycoinTransactionType[]) {
    const row = result.summary[type];
    if (row.count === 0) continue;
    console.log(
      `  ${type}: ${row.count} rows, amountSum=${row.amountSum.toFixed(2)}, unitsSum=${row.unitsSum.toFixed(8)}`,
    );
  }
  const heldBtc = result.summary.buy.unitsSum;
  const deposits = result.summary.deposit.amountSum;
  const refunds = Math.abs(result.summary.withdrawal.amountSum);
  console.log(
    `[anycoin] Vloženo (deposit − refund) = ${(deposits - refunds).toFixed(2)} CZK; držené BTC (Σ buy) = ${heldBtc.toFixed(8)}`,
  );
  if (result.warnings.length) {
    console.log(`[anycoin] Warnings (${result.warnings.length}):`);
    for (const w of result.warnings.slice(0, 8)) console.log(`  - ${w}`);
  }
}
