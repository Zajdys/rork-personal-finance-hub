/**
 * Mapa merchant_key → brand metadata pro předplatné (simple-icons slug + barva).
 * Ikony, které v simple-icons chybí (ochranné známky), se v BrandIcon vykreslí jako monogram.
 */

export type SubscriptionBrand = {
  /** simple-icons slug (např. "netflix") */
  slug: string;
  displayName: string;
  /** Hex bez #, nebo s # — BrandIcon normalizuje */
  brandColor: string;
};

/** merchant_key (UPPER) → brand */
export const SUBSCRIPTION_BRANDS: Record<string, SubscriptionBrand> = {
  APPLE: {
    slug: 'apple',
    displayName: 'Apple (iCloud)',
    brandColor: '#000000',
  },
  'YOUTUBE PREMIUM': {
    slug: 'youtube',
    displayName: 'YouTube Premium',
    brandColor: '#FF0000',
  },
  NETFLIX: {
    slug: 'netflix',
    displayName: 'Netflix',
    brandColor: '#E50914',
  },
  SPOTIFY: {
    slug: 'spotify',
    displayName: 'Spotify',
    brandColor: '#1ED760',
  },
  'DISNEY PLUS': {
    slug: 'disneyplus',
    displayName: 'Disney+',
    brandColor: '#113CCF',
  },
  'HBO MAX': {
    slug: 'hbomax',
    displayName: 'HBO Max',
    brandColor: '#000000',
  },
  'AMAZON PRIME': {
    slug: 'amazonprime',
    displayName: 'Amazon Prime',
    brandColor: '#00A8E1',
  },
  'GOOGLE ONE': {
    slug: 'google',
    displayName: 'Google One',
    brandColor: '#4285F4',
  },
  CHATGPT: {
    slug: 'openai',
    displayName: 'ChatGPT',
    brandColor: '#10A37F',
  },
  OPENAI: {
    slug: 'openai',
    displayName: 'OpenAI',
    brandColor: '#10A37F',
  },
  'MICROSOFT 365': {
    slug: 'microsoft',
    displayName: 'Microsoft 365',
    brandColor: '#00A4EF',
  },
  ADOBE: {
    slug: 'adobe',
    displayName: 'Adobe',
    brandColor: '#FF0000',
  },
  DUOLINGO: {
    slug: 'duolingo',
    displayName: 'Duolingo',
    brandColor: '#58CC02',
  },
  TINDER: {
    slug: 'tinder',
    displayName: 'Tinder',
    brandColor: '#FF6B6B',
  },
  PLAYSTATION: {
    slug: 'playstation',
    displayName: 'PlayStation',
    brandColor: '#0070D1',
  },
  XBOX: {
    slug: 'xbox',
    displayName: 'Xbox',
    brandColor: '#107C10',
  },
  STEAM: {
    slug: 'steam',
    displayName: 'Steam',
    brandColor: '#000000',
  },
};

/** Alias → kanonický merchant_key */
const ALIASES: Record<string, string> = {
  'APPLE.COM': 'APPLE',
  'APPLE COM': 'APPLE',
  ICLOUD: 'APPLE',
  YOUTUBE: 'YOUTUBE PREMIUM',
  'GOOGLE YOUTUBE': 'YOUTUBE PREMIUM',
  DISNEY: 'DISNEY PLUS',
  DISNEYPLUS: 'DISNEY PLUS',
  'DISNEY+': 'DISNEY PLUS',
  HBO: 'HBO MAX',
  HBOMAX: 'HBO MAX',
  MAX: 'HBO MAX',
  AMAZON: 'AMAZON PRIME',
  PRIME: 'AMAZON PRIME',
  'AMAZON PRIME VIDEO': 'AMAZON PRIME',
  GOOGLEONE: 'GOOGLE ONE',
  'OPEN AI': 'OPENAI',
  GPT: 'CHATGPT',
  MICROSOFT: 'MICROSOFT 365',
  M365: 'MICROSOFT 365',
  'OFFICE 365': 'MICROSOFT 365',
  OFFICE: 'MICROSOFT 365',
  PS: 'PLAYSTATION',
  PSN: 'PLAYSTATION',
  'PLAYSTATION PLUS': 'PLAYSTATION',
  'PLAYSTATION PLUS EXTRA': 'PLAYSTATION',
  'XBOX GAME PASS': 'XBOX',
  'GAME PASS': 'XBOX',
};

function normalizeKey(raw: string): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9+&\s.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Najde brand podle merchant_key nebo volného názvu předplatného (např. "Netflix").
 */
export function resolveSubscriptionBrand(
  merchantKeyOrName: string,
): { key: string; brand: SubscriptionBrand } | null {
  const normalized = normalizeKey(merchantKeyOrName);
  if (!normalized) return null;

  const viaAlias = ALIASES[normalized];
  if (viaAlias && SUBSCRIPTION_BRANDS[viaAlias]) {
    return { key: viaAlias, brand: SUBSCRIPTION_BRANDS[viaAlias]! };
  }
  if (SUBSCRIPTION_BRANDS[normalized]) {
    return { key: normalized, brand: SUBSCRIPTION_BRANDS[normalized]! };
  }

  // Delší klíče dřív (YOUTUBE PREMIUM před YOUTUBE)
  const keys = Object.keys(SUBSCRIPTION_BRANDS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (
      normalized === key ||
      normalized.startsWith(`${key} `) ||
      (key.length >= 5 && normalized.includes(key))
    ) {
      return { key, brand: SUBSCRIPTION_BRANDS[key]! };
    }
  }

  for (const [alias, canon] of Object.entries(ALIASES)) {
    const hit =
      normalized === alias ||
      normalized.startsWith(`${alias} `) ||
      (alias.length >= 5 && normalized.includes(alias));
    if (hit && SUBSCRIPTION_BRANDS[canon]) {
      return { key: canon, brand: SUBSCRIPTION_BRANDS[canon]! };
    }
  }

  return null;
}

/** Zobrazovaný název předplatného (displayName z mapy, jinak původní text). */
export function subscriptionDisplayName(merchantKeyOrName: string): string {
  const resolved = resolveSubscriptionBrand(merchantKeyOrName);
  if (resolved) return resolved.brand.displayName;
  const trimmed = String(merchantKeyOrName ?? '').trim();
  return trimmed || 'Předplatné';
}

/** Kategorie pro známé / detekované předplatné. */
export const SUBSCRIPTION_CATEGORY = 'Předplatné';
