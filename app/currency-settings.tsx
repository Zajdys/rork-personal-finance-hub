import { Redirect } from 'expo-router';

/** Legacy → Vzhled (jazyk / měna / téma). */
export default function CurrencySettingsRedirect() {
  return <Redirect href="/appearance-settings" />;
}
