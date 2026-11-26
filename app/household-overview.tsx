import { Redirect } from 'expo-router';

/** Legacy → tab Domácnost. */
export default function HouseholdOverviewRedirect() {
  return <Redirect href="/(tabs)/household" />;
}
