/**
 * Feature flags pro betu / postupné zapínání.
 *
 * INVESTMENTS_IN_TOTALS — přičítat tržní hodnotu broker portfolií
 * (investment_portfolios / portfolio calc) do dashboardu, měsíčního reportu,
 * čistého jmění a dalších „hlavních“ součtů mimo záložku Investice.
 *
 * false = portfolio zůstává jen na záložce Investice.
 * Kategorie bankovní transakce „Investice“ (výdaj) je mimo součty zvlášť
 * přes isTransferLikeTransaction — tímto flagem se nemění.
 *
 * Stav 2026-09: žádné call-site nepřidávají portfolio do hlavních součtů
 * (dashboard, monthly-report, profile NW). Flag je připravený pro budoucí
 * zapojení — nové součty musí být gated: `if (INVESTMENTS_IN_TOTALS) …`.
 */
export const INVESTMENTS_IN_TOTALS = false;

/** Helper — preferovat místo přímého čtení konstanty v UI/součtech. */
export function includeInvestmentsInAppTotals(): boolean {
  return INVESTMENTS_IN_TOTALS;
}

/**
 * true až po aplikaci SQL migrace interest/tax na investment_transactions_type_check.
 * Dokud false, XTB (a další) import s úroky/daněmi hodí chybu — ne tiše nepřeskočí.
 */
export const INVESTMENT_TX_INTEREST_TAX_ENABLED = true;

