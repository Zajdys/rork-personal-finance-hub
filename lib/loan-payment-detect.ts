/**
 * Detekce splátek úvěrů / hypoték / leasingu z popisu transakce.
 * Tyto účty se nikdy nenavrhují jako „vlastní účet“.
 */
export function isLoanPaymentText(...parts: Array<string | null | undefined>): boolean {
  const f = parts
    .filter(Boolean)
    .join('\n')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  if (!f.trim()) return false;
  return (
    /splatka\s+uveru/.test(f) ||
    /planovana\s+splatka\s+uveru/.test(f) ||
    /splatka\s+uroku/.test(f) ||
    /\buver(?:u|em|y)?\b/.test(f) ||
    /hypotek/.test(f) ||
    /leasing/.test(f) ||
    /splaceni\s+uveru/.test(f)
  );
}

export const LOAN_PAYMENT_CATEGORY = 'Splátky úvěrů';
