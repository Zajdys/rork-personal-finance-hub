import { Redirect } from 'expo-router';

/** Legacy → Nastavení notifikací. */
export default function HouseholdNotificationSettingsRedirect() {
  return <Redirect href="/notifications-settings" />;
}
