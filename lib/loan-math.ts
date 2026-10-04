import { formatMoneyWithSymbol } from '@/lib/format-money';

/** Monthly interest rate from annual % p.a. */
export function monthlyRateFromAnnual(annualPercent: number): number {
  return annualPercent / 100 / 12;
}

/**
 * Amortizing loan monthly payment:
 * M = P × [r(1+r)^n] / [(1+r)^n - 1]
 */
export function monthlyPaymentAmortizing(
  principal: number,
  annualPercent: number,
  termMonths: number
): number {
  return refinanceMonthlyPayment(principal, annualPercent, termMonths);
}

/**
 * New monthly payment after refinance (remaining balance, new annual %, remaining months).
 * r = annualPercent / 100 / 12
 * newPayment = balance × (r × (1+r)^n) / ((1+r)^n − 1)
 * If r = 0: newPayment = balance / months
 */
export function refinanceMonthlyPayment(
  balance: number,
  annualPercent: number,
  months: number
): number {
  const P = balance;
  const n = months;
  if (P <= 0 || n <= 0) return 0;
  const r = annualPercent / 100 / 12;
  if (r === 0 || Math.abs(r) < 1e-15) return P / n;
  const pow = Math.pow(1 + r, n);
  return (P * r * pow) / (pow - 1);
}

/**
 * Remaining balance after k payments:
 * B = P × [(1+r)^n - (1+r)^k] / [(1+r)^n - 1]
 */
export function remainingBalanceAfterKPayments(
  principal: number,
  annualPercent: number,
  termMonths: number,
  paymentsMade: number
): number {
  const P = principal;
  const n = termMonths;
  const k = Math.min(Math.max(0, Math.floor(paymentsMade)), n);
  if (P <= 0 || n <= 0) return 0;
  const r = monthlyRateFromAnnual(annualPercent);
  if (r === 0) {
    return Math.max(0, P - (P / n) * k);
  }
  const powN = Math.pow(1 + r, n);
  const powK = Math.pow(1 + r, k);
  return (P * (powN - powK)) / (powN - 1);
}

/**
 * Měsíční amortizace po k platbách (iterace podle splátky).
 * měsíční_sazba = annualPercent / 12 / 100
 */
export function amortizationAfterMonthlyPayments(
  principal: number,
  annualPercent: number,
  monthlyPayment: number,
  paymentsMade: number,
): {
  remainingBalance: number;
  totalPrincipalPaid: number;
  totalInterestPaid: number;
} {
  const P = principal;
  const k = Math.max(0, Math.floor(paymentsMade));
  if (P <= 0 || k === 0) {
    return {
      remainingBalance: Math.max(0, P),
      totalPrincipalPaid: 0,
      totalInterestPaid: 0,
    };
  }
  const r = annualPercent / 12 / 100;
  let balance = P;
  let totalInterest = 0;
  for (let i = 0; i < k; i++) {
    const interest = balance * r;
    const principalPart = monthlyPayment - interest;
    totalInterest += interest;
    balance -= principalPart;
    if (balance <= 0) {
      balance = 0;
      break;
    }
  }
  return {
    remainingBalance: Math.max(0, balance),
    totalPrincipalPaid: Math.min(P, P - Math.max(0, balance)),
    totalInterestPaid: totalInterest,
  };
}

/** Whole calendar months between start and end (day-of-month aware). */
export function wholeMonthsElapsed(start: Date, end: Date): number {
  if (+end < +start) return 0;
  let months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

/** Počet zaplacených splátek: paymentsMade, jinak měsíce od startDate. */
export function resolvePaidMonths(opts: {
  startDate: Date;
  termMonths: number;
  paymentsMade?: number | null;
  now?: Date;
}): number {
  const n = Math.max(0, Math.floor(opts.termMonths));
  if (n <= 0) return 0;
  if (opts.paymentsMade != null && Number.isFinite(opts.paymentsMade)) {
    return Math.min(Math.max(0, Math.floor(opts.paymentsMade)), n);
  }
  return Math.min(wholeMonthsElapsed(new Date(opts.startDate), opts.now ?? new Date()), n);
}

/** remaining_months = term − zaplacené splátky. */
export function resolveRemainingMonths(termMonths: number, paidMonths: number): number {
  const n = Math.max(0, Math.floor(termMonths));
  const k = Math.max(0, Math.floor(paidMonths));
  return Math.max(0, n - k);
}

export type LoanDetailOverview = {
  paidMonths: number;
  totalMonths: number;
  monthlyPayment: number;
  /** Zaplaceno celkem = paidMonths × splátka */
  paidTotalCash: number;
  principalPaid: number;
  interestPaid: number;
  /** Zbývající jistina (current_balance nebo amortizace) */
  remainingPrincipal: number;
  /** term × splátka */
  lifetimeTotal: number;
  /** lifetimeTotal − výše úvěru */
  lifetimeInterest: number;
  /** % splaceno z jistiny */
  principalPercentPaid: number;
};

/** Přehled pro detail závazku (nová specifikace Celkový přehled). */
export function computeLoanDetailOverview(loan: {
  loanAmount: number;
  interestRate: number;
  monthlyPayment: number;
  termMonths?: number;
  remainingMonths: number;
  startDate: Date;
  paymentsMade?: number | null;
  currentBalance?: number | null;
}): LoanDetailOverview {
  const P = Number(loan.loanAmount) || 0;
  const M = Number(loan.monthlyPayment) || 0;
  const n =
    loan.termMonths && loan.termMonths > 0
      ? Math.floor(loan.termMonths)
      : Math.max(0, Math.floor(loan.remainingMonths));
  const paidMonths = resolvePaidMonths({
    startDate: loan.startDate,
    termMonths: n,
    paymentsMade: loan.paymentsMade,
  });
  const am = amortizationAfterMonthlyPayments(P, loan.interestRate, M, paidMonths);
  const remainingPrincipal =
    loan.currentBalance != null && Number.isFinite(loan.currentBalance) && loan.currentBalance >= 0
      ? Number(loan.currentBalance)
      : am.remainingBalance;
  const principalPaid =
    loan.currentBalance != null && Number.isFinite(loan.currentBalance) && loan.currentBalance >= 0
      ? Math.max(0, P - Number(loan.currentBalance))
      : am.totalPrincipalPaid;
  const lifetimeTotal = M * n;
  const lifetimeInterest = Math.max(0, lifetimeTotal - P);
  const principalPercentPaid = P > 0 ? Math.min(100, (principalPaid / P) * 100) : 0;

  return {
    paidMonths,
    totalMonths: n,
    monthlyPayment: M,
    paidTotalCash: paidMonths * M,
    principalPaid,
    interestPaid: am.totalInterestPaid,
    remainingPrincipal: Math.max(0, remainingPrincipal),
    lifetimeTotal,
    lifetimeInterest,
    principalPercentPaid: Math.round(principalPercentPaid * 100) / 100,
  };
}

/** True pokud se ruční splátka liší od vypočtené o více než 1 %. */
export function monthlyPaymentDiffersOverOnePercent(
  manual: number,
  computed: number,
): boolean {
  if (!(manual > 0) || !(computed > 0)) return false;
  return Math.abs(manual - computed) / computed > 0.01;
}


/** Minimal loan fields for refinance balance / months-left. */
export type LoanRefinanceSource = {
  loanAmount: number;
  interestRate: number;
  termMonths?: number;
  remainingMonths: number;
  startDate: Date;
  currentBalance?: number | null;
};

/**
 * Balance and remaining months for refinance, derived from the liability (not only getLoanProgress).
 * - If no payments yet (k = 0): balance = original loan amount.
 * - months left = totalMonths − paidMonths (totalMonths from termMonths or remainingMonths).
 */
export function loanRefinanceParams(loan: LoanRefinanceSource): {
  balance: number;
  monthsLeft: number;
  paidMonths: number;
  totalMonths: number;
} | null {
  const P = loan.loanAmount;
  const totalMonths =
    loan.termMonths && loan.termMonths > 0
      ? loan.termMonths
      : loan.remainingMonths > 0
        ? loan.remainingMonths
        : 0;
  if (P <= 0 || totalMonths <= 0) return null;

  const startDate = new Date(loan.startDate);
  const now = new Date();
  const paidMonths = Math.min(wholeMonthsElapsed(startDate, now), totalMonths);
  const monthsLeft = Math.max(0, totalMonths - paidMonths);

  let balance: number;
  if (paidMonths === 0) {
    balance = P;
  } else if (loan.currentBalance != null && loan.currentBalance > 0) {
    balance = loan.currentBalance;
  } else {
    balance = remainingBalanceAfterKPayments(P, loan.interestRate, totalMonths, paidMonths);
  }

  return { balance, monthsLeft, paidMonths, totalMonths };
}

export function formatDateCs(d: Date): string {
  return d.toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

export function parseDateDdMmYyyy(s: string): Date | null {
  const t = String(s).trim();
  const m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(t);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

/**
 * Konec fixace z délky v letech: start + N let − 1 den
 * (banky končí den před výročím; 20.4.2026 + 3 → 19.4.2029).
 */
export function fixationEndFromYears(start: Date, years: number): Date {
  const end = new Date(start);
  end.setHours(12, 0, 0, 0);
  end.setFullYear(end.getFullYear() + years);
  end.setDate(end.getDate() - 1);
  return end;
}

/** Celé Kč / měna pro zobrazení (cs-CZ) — sdílený formát (`formatMoney`). */
export function formatCsCurrencyRounded(amount: number, symbol: string): string {
  return formatMoneyWithSymbol(amount, 'cs-CZ', symbol);
}

/** Procenta se 2 desetinnými místy (cs-CZ). */
export function formatCsPercent2(value: number): string {
  return value.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** „359 (29,9 let)“ — roky: Math.round(months / 12 * 10) / 10 */
export function formatCsRemainingMonthsWithYears(monthsLeft: number): string {
  const years = Math.round((monthsLeft / 12) * 10) / 10;
  const yStr = years.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${monthsLeft} (${yStr} let)`;
}
