import {
  assignKontomatikTxIds,
  type AisMoneyTx,
} from '../kontomatik/fingerprint';
import { mapKontomatikTargetToSource } from './bank-target';
import { normalizeAccount, normalizeMerchantKey } from './merchant';

export type MappedBankRow = {
  date: string;
  booking_date: string | null;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description: string;
  source: string;
  counterparty_account: string | null;
  counterparty_name: string | null;
  merchant_key: string | null;
  category_source: string;
  external_id: string | null;
  unique_key: string;
  kontomatik_tx_id: string;
  import_needs_review: boolean;
};

export type AisAccount = {
  iban: string;
  name?: string | null;
  currencyName?: string | null;
  moneyTransactions: AisMoneyTx[];
};

function buildUniqueKey(params: {
  userId: string;
  bank: string;
  date: string;
  amount: number;
  description: string;
  kontomatikTxId: string;
}): string {
  // Prefer kontomatik id so AIS↔AIS syncs collide cleanly.
  return `${params.userId}|${params.bank}|ktx:${params.kontomatikTxId}`;
}

export function mapAisAccountsToRows(params: {
  userId: string;
  target: string | null;
  officialName: string | null;
  accounts: AisAccount[];
}): { rows: MappedBankRow[]; bank: string; ibans: string[] } {
  const bank = mapKontomatikTargetToSource(params.target, params.officialName);
  const rows: MappedBankRow[] = [];
  const ibans: string[] = [];

  for (const acc of params.accounts) {
    const iban = String(acc.iban ?? '').trim();
    if (!iban) continue;
    ibans.push(iban);

    const txs = acc.moneyTransactions ?? [];
    const ids = assignKontomatikTxIds(iban, txs);

    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i]!;
      const status = (tx.status ?? 'DONE').trim().toUpperCase();
      if (status && status !== 'DONE') continue;

      const booked = (tx.bookedOn || tx.transactionOn || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(booked)) continue;

      const amountRaw = Number(tx.currencyAmount);
      if (!Number.isFinite(amountRaw) || amountRaw === 0) continue;

      const type: 'income' | 'expense' = amountRaw > 0 ? 'income' : 'expense';
      const amount = Math.round(Math.abs(amountRaw) * 100) / 100;
      const title = (tx.title ?? '').trim();
      const kind = (tx.kind ?? '').trim();
      const description =
        [title, kind].filter(Boolean).join(' · ') || 'Bez názvu';
      const party = (tx.party ?? '').trim() || null;
      const partyIban = normalizeAccount(tx.partyIban);
      const merchantKey =
        normalizeMerchantKey(party || title) || null;
      const kontomatikTxId = ids[i]!;
      const transactionOn = (tx.transactionOn || '').slice(0, 10);
      const bookingDate =
        transactionOn && transactionOn !== booked ? transactionOn : null;

      rows.push({
        date: booked,
        booking_date: bookingDate,
        amount,
        type,
        category: 'Ostatní',
        description,
        source: bank,
        counterparty_account: partyIban,
        counterparty_name: party,
        merchant_key: merchantKey,
        category_source: 'import',
        external_id: `kontomatik:${kontomatikTxId}`,
        unique_key: buildUniqueKey({
          userId: params.userId,
          bank,
          date: booked,
          amount,
          description,
          kontomatikTxId,
        }),
        kontomatik_tx_id: kontomatikTxId,
        import_needs_review: false,
      });
    }
  }

  return { rows, bank, ibans: [...new Set(ibans)] };
}
