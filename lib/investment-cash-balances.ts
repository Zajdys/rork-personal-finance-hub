/**
 * Native cash ledger po měnách z investment_transactions
 * (deposit/promo/sell/dividend +, buy/withdrawal/fee −).
 */
import { convertToCzk, ensureExchangeRates } from '@/lib/cnb-exchange-rates';

export type CashflowTx = {
  type: string;
  amount: number;
  original_currency: string;
};

export function computeNativeCashBalances(transactions: CashflowTx[]): Record<string, number> {
  const bal: Record<string, number> = {};
  for (const tx of transactions) {
    const ccy = String(tx.original_currency ?? 'EUR')
      .trim()
      .toUpperCase() || 'EUR';
    const amt = Math.abs(Number(tx.amount) || 0);
    if (!Number.isFinite(amt)) continue;
    const prev = bal[ccy] ?? 0;
    switch (tx.type) {
      case 'deposit':
      case 'promo':
      case 'sell':
      case 'dividend':
      case 'interest':
        bal[ccy] = prev + amt;
        break;
      case 'buy':
      case 'withdrawal':
      case 'fee':
      case 'tax':
        bal[ccy] = prev - amt;
        break;
      default:
        break;
    }
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(bal)) {
    // Zachovej měny s pohybem i při zůstatku 0 (UI ukáže všechny „viděné“ měny).
    out[k] = Math.round(v * 1e8) / 1e8;
  }
  return out;
}

export function roundCashMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Součet hotovosti po měnách → CZK přes ČNB (dnešní / poslední pracovní den). */
export async function sumCashBalancesToCzk(
  balances: Record<string, number>,
  dateIso = new Date().toISOString().slice(0, 10),
): Promise<number | null> {
  const entries = Object.entries(balances).filter(([, v]) => Number.isFinite(v) && Math.abs(v) >= 1e-10);
  if (!entries.length) return null;

  const date = dateIso.slice(0, 10);
  const foreign = entries.filter(([ccy]) => ccy !== 'CZK').map(([ccy]) => ({ date, currency: ccy }));
  const rates = foreign.length ? await ensureExchangeRates(foreign) : new Map();

  let sum = 0;
  for (const [ccy, amt] of entries) {
    if (ccy === 'CZK') {
      sum += amt;
      continue;
    }
    const hit = rates.get(`${date}|${ccy}`);
    if (!hit) return null;
    const absCzk = convertToCzk(amt, hit.perUnit);
    sum += amt < 0 ? -absCzk : absCzk;
  }
  return roundCashMoney(sum);
}
