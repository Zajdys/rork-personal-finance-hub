import { Redirect, useLocalSearchParams } from 'expo-router';

/** Legacy → plan-goal-detail */
export default function SavingsGoalDetailRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (id) {
    return <Redirect href={{ pathname: '/plan-goal-detail', params: { id } }} />;
  }
  return <Redirect href="/(tabs)/plan" />;
}
