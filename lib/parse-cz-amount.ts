import { parseDecimalInput, parseMoneyInput } from '@/lib/parse-money-input';

/** @deprecated Použij parseMoneyInput — vrací null místo 0. */
export function parseCzAmount(raw: string | number | null | undefined): number {
  return parseMoneyInput(raw) ?? 0;
}

/** @deprecated Použij parseMoneyInput. */
export function parseCzAmountOptional(
  raw: string | number | null | undefined,
): number | undefined {
  const n = parseMoneyInput(raw);
  return n == null ? undefined : n;
}

export { parseDecimalInput, parseMoneyInput } from '@/lib/parse-money-input';
