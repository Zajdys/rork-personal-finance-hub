/**
 * Překlad Supabase Auth chyb do uživatelských zpráv (bez syrového EN/SQL).
 */

export type AuthErrorKind =
  | 'user_already_exists'
  | 'invalid_credentials'
  | 'weak_password'
  | 'generic';

export function classifyAuthError(error: unknown): AuthErrorKind {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error ?? '');
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code ?? '')
      : '';
  const blob = `${code} ${message}`.toLowerCase();

  if (
    blob.includes('user_already_exists') ||
    blob.includes('already registered') ||
    blob.includes('already been registered') ||
    blob.includes('email_exists') ||
    blob.includes('user already exists')
  ) {
    return 'user_already_exists';
  }
  if (
    blob.includes('invalid_credentials') ||
    blob.includes('invalid login credentials') ||
    blob.includes('invalid email or password')
  ) {
    return 'invalid_credentials';
  }
  if (
    blob.includes('weak_password') ||
    blob.includes('password should be') ||
    blob.includes('password is too weak') ||
    blob.includes('password is known to be weak')
  ) {
    return 'weak_password';
  }
  return 'generic';
}

/** i18n klíče pro auth chyby. */
export function authErrorI18nKey(kind: AuthErrorKind): string {
  switch (kind) {
    case 'user_already_exists':
      return 'auth.errorUserExists';
    case 'invalid_credentials':
      return 'auth.errorInvalidCredentials';
    case 'weak_password':
      return 'auth.errorWeakPassword';
    default:
      return 'auth.errorGeneric';
  }
}
