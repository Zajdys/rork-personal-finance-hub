export function normalizeCashSign(action: string | undefined, amount: number | null): number | null {
  if (amount == null) return null;
  const a = (action || "").toLowerCase();
  if (/buy/.test(a)) return -Math.abs(amount);
  if (/sell|interest|dividend/.test(a)) return Math.abs(amount);
  return amount;
}
