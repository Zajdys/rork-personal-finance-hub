/**
 * Re-export sdílené normalizace z monorepa (žádná lokální kopie).
 * Cesta: services/kontomatik-bank → ../../lib|utils
 */
export {
  normalizeMerchantKey,
  isGenericPaymentLabel,
} from '../../../../lib/normalize-merchant-key.ts';
export {
  normalizeAccount,
  isOwnCounterpartyAccount,
} from '../../../../utils/normalizeAccount.ts';
