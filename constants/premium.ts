/**
 * Free vs Premium — identifikátory funkcí a dev přepínač.
 */

export const PREMIUM_ENTITLEMENT_ID = 'premium';

/** Jen v __DEV__: EXPO_PUBLIC_DEV_FORCE_PREMIUM=true → vždy premium. */
export function isDevForcePremium(): boolean {
  return (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ === true &&
    String(process.env.EXPO_PUBLIC_DEV_FORCE_PREMIUM ?? '').toLowerCase() === 'true'
  );
}

export type PremiumFeatureId =
  | 'fio_sync'
  | 'household'
  | 'subscriptions'
  | 'financial_goals'
  | 'budgets'
  | 'save'
  | 'monthly_report'
  | 'investments'
  | 'bank_sync'
  | 'unlimited_imports';

export const PREMIUM_FEATURE_META: Record<
  PremiumFeatureId,
  { titleKey: string; blurbKey: string }
> = {
  fio_sync: {
    titleKey: 'premium.featureFioTitle',
    blurbKey: 'premium.featureFioBlurb',
  },
  household: {
    titleKey: 'premium.featureHouseholdTitle',
    blurbKey: 'premium.featureHouseholdBlurb',
  },
  subscriptions: {
    titleKey: 'premium.featureSubsTitle',
    blurbKey: 'premium.featureSubsBlurb',
  },
  financial_goals: {
    titleKey: 'premium.featureGoalsTitle',
    blurbKey: 'premium.featureGoalsBlurb',
  },
  budgets: {
    titleKey: 'premium.featureBudgetsTitle',
    blurbKey: 'premium.featureBudgetsBlurb',
  },
  save: {
    titleKey: 'premium.featureSaveTitle',
    blurbKey: 'premium.featureSaveBlurb',
  },
  monthly_report: {
    titleKey: 'premium.featureReportTitle',
    blurbKey: 'premium.featureReportBlurb',
  },
  investments: {
    titleKey: 'premium.featureInvestTitle',
    blurbKey: 'premium.featureInvestBlurb',
  },
  bank_sync: {
    titleKey: 'premium.featureBankSyncTitle',
    blurbKey: 'premium.featureBankSyncBlurb',
  },
  unlimited_imports: {
    titleKey: 'premium.featureImportsTitle',
    blurbKey: 'premium.featureImportsBlurb',
  },
};

/** Free uživatel má až tolik rozpočtů (quick-setup nabízí 4 kategorie). */
export const FREE_BUDGET_LIMIT = 4;
