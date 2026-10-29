import { Redirect } from 'expo-router';

/** Legacy → tab Plán (nový cíl přes sheet) */
export default function AddSavingsGoalRedirect() {
  return <Redirect href="/(tabs)/plan" />;
}
