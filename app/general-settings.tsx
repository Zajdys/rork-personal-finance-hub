import { Redirect } from 'expo-router';

/** Legacy → Profil (export / správa dat je v Soukromí). */
export default function GeneralSettingsRedirect() {
  return <Redirect href="/(tabs)/profile" />;
}
