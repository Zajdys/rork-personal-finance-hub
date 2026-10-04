import { Redirect } from 'expo-router';

/** Same premium UI as login — use shared auth screen in register mode. */
export default function RegisterScreen() {
  return <Redirect href="/auth?mode=register" />;
}
