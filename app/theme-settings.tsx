import { Redirect } from 'expo-router';

/** Legacy → Vzhled (jazyk / měna / téma). */
export default function ThemeSettingsRedirect() {
  return <Redirect href="/appearance-settings" />;
}
