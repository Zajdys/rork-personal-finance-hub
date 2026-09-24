/**
 * Společná detekce neúspěšných vkladů/výběrů napříč brokery (eToro, T212, XTB).
 * Takové řádky se do investment_transactions neimportují.
 */
export const FAILED_BROKER_PAYMENT_RE =
  /insufficient\s*balance|rejected|failed|declined|cancelled|canceled|neúspěš|neuspes|zamítnut|zamitnut|odmítnut|odmitnut/i;

const SUCCESS_BROKER_PAYMENT_RE =
  /approved|completed|executed|success|successful|ok|done|confirmed|processed/i;

/**
 * @returns `true` = selhalo, `false` = úspěch, `null` = status chybí / nerozhodnuto
 */
export function classifyBrokerPaymentStatus(status: string | null | undefined): boolean | null {
  const s = (status ?? '').trim();
  if (!s) return null;
  if (SUCCESS_BROKER_PAYMENT_RE.test(s)) return false;
  if (FAILED_BROKER_PAYMENT_RE.test(s)) return true;
  // Explicitní status, který není úspěšný → bereme jako neúspěch
  return true;
}

export function textLooksLikeFailedBrokerPayment(text: string): boolean {
  return FAILED_BROKER_PAYMENT_RE.test(text);
}
