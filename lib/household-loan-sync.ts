import type { LoanItem } from '@/store/finance-store';

/** Pravidelný výdaj může připsat splátku k závazku. */
export function recurringExpenseMatchesLoanRule(name: string, category: string): boolean {
  if (category === 'Bydlení') return true;
  const n = name.toLowerCase();
  return /hypotéka|hypoteka|úvěr|uver|půjčka|pujcka/.test(n);
}

function amountClose(a: number, b: number): boolean {
  return Math.abs(a - b) < 1.02;
}

function nameOverlaps(recurringName: string, loanName: string): boolean {
  const n = recurringName.toLowerCase().trim();
  const ln = loanName.toLowerCase().trim();
  if (!ln) return false;
  if (n.includes(ln) || ln.includes(n)) return true;
  const words = n.split(/\s+/).filter((w) => w.length > 2);
  return words.some((w) => ln.includes(w));
}

/** Najde závazek podle částky splátky a názvu (pro side-effect z Domácnosti). */
export function findBestMatchingLoan(
  loans: LoanItem[],
  recurringName: string,
  recurringAmount: number,
): LoanItem | null {
  if (!loans.length) return null;

  const byAmount = loans.filter((l) => amountClose(l.monthlyPayment, recurringAmount));
  if (byAmount.length === 1) return byAmount[0]!;

  if (byAmount.length > 1) {
    for (const loan of byAmount) {
      if (loan.name && nameOverlaps(recurringName, loan.name)) return loan;
    }
    return byAmount[0]!;
  }

  for (const loan of loans) {
    if (loan.name && nameOverlaps(recurringName, loan.name) && amountClose(loan.monthlyPayment, recurringAmount)) {
      return loan;
    }
  }

  for (const loan of loans) {
    if (loan.name && nameOverlaps(recurringName, loan.name)) return loan;
  }

  return null;
}

export function subtractMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  return d;
}
