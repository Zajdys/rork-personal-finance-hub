import { Redirect } from 'expo-router';

/** Legacy → Nápověda. */
export default function UserGuideRedirect() {
  return <Redirect href="/help-support" />;
}