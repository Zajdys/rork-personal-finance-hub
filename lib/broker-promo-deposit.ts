/**
 * Promo / free-share bonus od brokera — cashflow ANO, „Vloženo“ NE.
 */
export const PROMO_BROKER_DEPOSIT_RE =
  /free\s*shares?|promotion|promo|bonus|reward|referral|gift/i;

export function textLooksLikePromoBrokerDeposit(text: string): boolean {
  return PROMO_BROKER_DEPOSIT_RE.test(text);
}
