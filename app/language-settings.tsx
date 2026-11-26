import { Redirect } from 'expo-router';

/** Legacy → Vzhled (jazyk / měna / téma). */
export default function LanguageSettingsRedirect() {
  return <Redirect href="/appearance-settings" />;
}
