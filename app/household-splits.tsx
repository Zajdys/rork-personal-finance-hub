import { Redirect } from 'expo-router';

/** Legacy → tab Domácnost. */
export default function HouseholdSplitsRedirect() {
  return <Redirect href="/(tabs)/household" />;
}
