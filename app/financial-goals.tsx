import { Redirect } from 'expo-router';

/** Legacy → tab Plán */
export default function FinancialGoalsRedirect() {
  return <Redirect href="/(tabs)/plan" />;
}
