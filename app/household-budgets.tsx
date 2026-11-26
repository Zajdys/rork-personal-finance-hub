import { Redirect } from 'expo-router';

/** Legacy → tab Plán (rozpočty). */
export default function HouseholdBudgetsRedirect() {
  return <Redirect href="/(tabs)/plan" />;
}
