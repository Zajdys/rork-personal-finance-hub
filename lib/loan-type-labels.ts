import type { LoanType } from '@/store/finance-store';
import { useLanguageStore } from '@/store/language-store';

export function getLoanTypeLabel(type: LoanType): string {
  const { t } = useLanguageStore.getState();
  switch (type) {
    case 'mortgage':
      return t('loanTypeMortgage');
    case 'car':
      return t('loanTypeCar');
    case 'personal':
      return t('loanTypePersonal');
    case 'student':
      return t('loanTypeStudent');
    case 'other':
      return t('loanTypeOther');
    default:
      return t('loanTypeGeneric');
  }
}

export function loanCountLabel(count: number): string {
  const { t } = useLanguageStore.getState();
  if (count === 1) return t('loanCountOne');
  if (count >= 2 && count <= 4) return t('loanCountFew');
  return t('loanCountMany');
}

export function loanYearLabel(years: number): string {
  const { t } = useLanguageStore.getState();
  if (years === 1) return t('loanYearOne');
  if (years >= 2 && years <= 4) return t('loanYearFew');
  return t('loanYearMany');
}
