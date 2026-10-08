function required(name: string, optional = false): string {
  const v = (process.env[name] ?? '').trim();
  if (!v && !optional) {
    throw new Error(`Missing env ${name}`);
  }
  return v;
}

export type ServiceEnv = {
  kontomatikApiKey: string;
  kontomatikBaseUrl: string;
  kontomatikClientId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  tokenEncKey: string;
  port: number;
  host: string;
  redirectUri: string;
  appDeepLink: string;
  internalServiceSecret: string;
};

/** Strict load for the HTTP server (all secrets required). */
export function loadServiceEnv(): ServiceEnv {
  return {
    kontomatikApiKey: required('KONTOMATIK_API_KEY'),
    kontomatikBaseUrl: (
      process.env.KONTOMATIK_BASE_URL?.trim() || 'https://test.api.kontomatik.com'
    ).replace(/\/$/, ''),
    kontomatikClientId: process.env.KONTOMATIK_CLIENT_ID?.trim() || 'janhajek',
    supabaseUrl: required('SUPABASE_URL'),
    supabaseAnonKey: required('SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    tokenEncKey: required('TOKEN_ENC_KEY'),
    port: Number(process.env.PORT || 8787),
    host: process.env.HOST?.trim() || '127.0.0.1',
    redirectUri: required('REDIRECT_URI'),
    appDeepLink: process.env.APP_DEEP_LINK?.trim() || 'myapp://bank/kontomatik',
    internalServiceSecret: process.env.INTERNAL_SERVICE_SECRET?.trim() || '',
  };
}

/** Soft load for selftests (Kontomatik key optional → skip live calls). */
export function loadTestEnv(): {
  kontomatikApiKey: string | null;
  kontomatikBaseUrl: string;
  /** KontoBank mock country — coverage test-accounts (default cz). */
  mockCountry: string;
  /** KontoBank login for mockCountry (default test1). */
  mockLogin: string;
  mockOwnerEmail: string;
} {
  return {
    kontomatikApiKey: process.env.KONTOMATIK_API_KEY?.trim() || null,
    kontomatikBaseUrl: (
      process.env.KONTOMATIK_BASE_URL?.trim() || 'https://test.api.kontomatik.com'
    ).replace(/\/$/, ''),
    mockCountry: (process.env.KONTOMATIK_MOCK_COUNTRY?.trim() || 'cz').toLowerCase(),
    mockLogin: process.env.KONTOMATIK_MOCK_LOGIN?.trim() || 'test1',
    mockOwnerEmail:
      process.env.KONTOMATIK_MOCK_OWNER_EMAIL?.trim() || 'selftest@moneybuddy.cz',
  };
}
