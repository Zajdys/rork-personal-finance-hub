/**
 * Formát částky pro UI:
 * - 2 desetinná místa, pokud jsou haléře nenulové (46 610,30)
 * - celé koruny, pokud jsou haléře nulové (46 610)
 */
export function formatMoney(amount: number, locale: string): string {
  if (!Number.isFinite(amount)) return '0';
  const rounded = Math.round(amount * 100) / 100;
  const isWhole = Math.abs(rounded - Math.round(rounded)) < 1e-9;
  return rounded.toLocaleString(locale, {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  });
}

/** Stejné jako `formatMoney`, plus měnový symbol (např. „46 610,30 Kč“). */
export function formatMoneyWithSymbol(amount: number, locale: string, symbol: string): string {
  return `${formatMoney(amount, locale)} ${symbol}`;
}
