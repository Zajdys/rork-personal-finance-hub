import { Redirect } from 'expo-router';

/** Legacy → tab Domácnost. */
export default function HouseholdPoliciesRedirect() {
  return <Redirect href="/(tabs)/household" />;
}
