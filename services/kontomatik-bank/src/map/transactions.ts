import {
  classifyImportRow,
  type ClassifyContext,
} from '../../../../lib/classify-import-category.ts';
import {
  assignKontomatikTxIds,
  type AisMoneyTx,
} from '../kontomatik/fingerprint';
import { mapKontomatikTargetToSource } from './bank-target';
import { mapClassifySourceToCategorySource } from './category-source';
import {
  isGenericPaymentLabel,
  isOwnCounterpartyAccount,
  normalizeAccount,
  normalizeMerchantKey,
} from './merchant';

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

export type MapAisOptions = {
  userId: string;
  target: string | null;
  officialName: string | null;
  accounts: AisAccount[];
  /** owner_bank_accounts + vlastní AIS IBAN-y */
  ownerAccounts?: string[];
  classifyCtx?: ClassifyContext;
};

function buildUniqueKey(params: {
  userId: string;
  bank: string;
  kontomatikTxId: string;
}): string {
  return `${params.userId}|${params.bank}|ktx:${params.kontomatikTxId}`;
}

/** Obchodník z AIS: party, jinak title — nikdy holé „Platba“ / kind. */
export function pickAisMerchantSource(
  party: string | null | undefined,
  title: string | null | undefined,
): string {
  const p = (party ?? '').trim();
  if (p && !isGenericPaymentLabel(p)) return p;
  const t = (title ?? '').trim();
  if (t && !isGenericPaymentLabel(t)) return t;
  return '';
}

/** Stejně jako RB PDF: jen název obchodníka (segment před prvním „;“). */
export function aisMerchantDisplayLine(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  return s.split(';')[0]!.trim();
}

/**
 * Popis pro DB/UI — bez města/země/typu transakce (kind „Platba kartou“).
 * Převod: jméno protistrany; jinak název obchodníka před „;“.
 */
export function buildAisDescription(params: {
  merchantSrc: string;
  party: string | null;
  title: string;
  isTransfer: boolean;
}): string {
  if (params.isTransfer) {
    const name = (params.party ?? '').trim();
    if (name) return aisMerchantDisplayLine(name);
    return 'Převod';
  }
  const src = params.merchantSrc.trim();
  if (src) return aisMerchantDisplayLine(src);
  const fromTitle = (params.title ?? '').trim();
  if (fromTitle && !isGenericPaymentLabel(fromTitle)) {
    return aisMerchantDisplayLine(fromTitle);
  }
  return 'Bez názvu';
}

export function mapAisAccountsToRows(params: MapAisOptions): {
  rows: MappedBankRow[];
  bank: string;
  ibans: string[];
} {
  const bank = mapKontomatikTargetToSource(params.target, params.officialName);
  const rows: MappedBankRow[] = [];
  const ibans: string[] = [];
  const classifyCtx = params.classifyCtx ?? {};

  const ownerAccounts = [
    ...(params.ownerAccounts ?? []),
    ...params.accounts.map((a) => a.iban).filter(Boolean),
  ];

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
      const party = (tx.party ?? '').trim() || null;
      const partyIban = normalizeAccount(tx.partyIban);
      const merchantSrc = pickAisMerchantSource(party, title);
      const isTransfer = isOwnCounterpartyAccount(partyIban, ownerAccounts);
      const description = buildAisDescription({
        merchantSrc,
        party,
        title,
        isTransfer,
      });
      const merchantKey = merchantSrc
        ? normalizeMerchantKey(merchantSrc) || null
        : null;
      const kontomatikTxId = ids[i]!;
      const transactionOn = (tx.transactionOn || '').slice(0, 10);
      const bookingDate =
        transactionOn && transactionOn !== booked ? transactionOn : null;

      const classified = classifyImportRow(
        {
          type,
          category: isTransfer ? 'Převod' : null,
          description,
          title: merchantSrc || title || null,
          counterpartyAccount: partyIban,
          counterpartyName: party,
          merchantRaw: merchantSrc || null,
          amount,
        },
        classifyCtx,
      );

      rows.push({
        date: booked,
        booking_date: bookingDate,
        amount,
        type,
        category: classified.category,
        description,
        source: bank,
        counterparty_account: partyIban,
        counterparty_name: classified.counterpartyName ?? party,
        merchant_key: classified.merchantKey ?? merchantKey,
        category_source: mapClassifySourceToCategorySource(classified.source),
        external_id: `kontomatik:${kontomatikTxId}`,
        unique_key: buildUniqueKey({
          userId: params.userId,
          bank,
          kontomatikTxId,
        }),
        kontomatik_tx_id: kontomatikTxId,
        import_needs_review: false,
      });
    }
  }

  return { rows, bank, ibans: [...new Set(ibans)] };
}
