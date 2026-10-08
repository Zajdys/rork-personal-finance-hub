import { createHash } from 'crypto';

export type AisMoneyTx = {
  transactionOn: string | null;
  bookedOn: string | null;
  currencyAmount: number;
  currencyBalance: number | null;
  partyIban: string | null;
  party: string | null;
  title: string | null;
  kind: string | null;
  status: string | null;
  variableSymbol: string | null;
  constantSymbol: string | null;
};

function norm(s: string | null | undefined): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function amountStr(n: number): string {
  return Number(n).toFixed(2);
}

/**
 * Stable Kontomatik AIS id.
 * Prefer currencyBalance (distinguishes same-day identical amounts).
 * Fallback: seq within (iban, bookedOn, amount, partyIban) when balance missing.
 */
export function buildKontomatikTxId(params: {
  accountIban: string;
  tx: AisMoneyTx;
  /** 0-based order among txs sharing same soft key when balance is null */
  missingBalanceSeq?: number;
}): string {
  const booked = (params.tx.bookedOn || params.tx.transactionOn || '').slice(0, 10);
  const iban = norm(params.accountIban);
  const partyIban = norm(params.tx.partyIban);
  const title = norm(params.tx.title);
  const amt = amountStr(params.tx.currencyAmount);

  let balancePart: string;
  if (params.tx.currencyBalance != null && Number.isFinite(params.tx.currencyBalance)) {
    balancePart = amountStr(params.tx.currencyBalance);
  } else {
    const seq = params.missingBalanceSeq ?? 0;
    balancePart = `bal:missing|seq:${seq}`;
  }

  const raw = `${iban}|${booked}|${amt}|${partyIban}|${title}|${balancePart}`;
  const hash = createHash('sha256').update(raw, 'utf8').digest('hex');
  return `ktx:${hash}`;
}

/** Soft key used to assign seq when currencyBalance is absent. */
export function softGroupKey(accountIban: string, tx: AisMoneyTx): string {
  const booked = (tx.bookedOn || tx.transactionOn || '').slice(0, 10);
  return [
    norm(accountIban),
    booked,
    amountStr(tx.currencyAmount),
    norm(tx.partyIban),
  ].join('|');
}

/** Assign missingBalanceSeq in appearance order within soft groups. */
export function assignKontomatikTxIds(
  accountIban: string,
  txs: AisMoneyTx[],
): string[] {
  const seqByGroup = new Map<string, number>();
  return txs.map((tx) => {
    let missingBalanceSeq: number | undefined;
    if (tx.currencyBalance == null || !Number.isFinite(tx.currencyBalance)) {
      const g = softGroupKey(accountIban, tx);
      const seq = seqByGroup.get(g) ?? 0;
      seqByGroup.set(g, seq + 1);
      missingBalanceSeq = seq;
    }
    return buildKontomatikTxId({ accountIban, tx, missingBalanceSeq });
  });
}
