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
  DROPBOX: {
    slug: 'dropbox',
    displayName: 'Dropbox',
    brandColor: '#0061FF',
  },
  CANVA: {
    slug: 'canva',
    displayName: 'Canva',
    brandColor: '#00C4CC',
  },
  ANTHROPIC: {
    slug: 'anthropic',
    displayName: 'Anthropic',
    brandColor: '#D4A27F',
  },
  CURSOR: {
    slug: 'cursor',
    displayName: 'Cursor',
    brandColor: '#000000',
  },
  PATREON: {
    slug: 'patreon',
    displayName: 'Patreon',
    brandColor: '#FF424D',
  },
  DEEZER: {
    slug: 'deezer',
    displayName: 'Deezer',
    brandColor: '#FEAA2D',
  },
  NOTION: {
    slug: 'notion',
    displayName: 'Notion',
    brandColor: '#000000',
  },
  FIGMA: {
    slug: 'figma',
    displayName: 'Figma',
    brandColor: '#F24E1E',
  },
  GITHUB: {
    slug: 'github',
    displayName: 'GitHub',
    brandColor: '#181717',
  },
  DAZN: {
    slug: 'dazn',
    displayName: 'DAZN',
    brandColor: '#F7FF1A',
  },
  SKYSHOWTIME: {
    slug: 'skyshowtime',
    displayName: 'SkyShowtime',
    brandColor: '#000000',
  },
  'PREHRAJ.TO': {
    slug: 'prehrajto',
    displayName: 'Přehraj.to',
    brandColor: '#E11D48',
  },
  HEROHERO: {
    slug: 'herohero',
    displayName: 'Herohero',
    brandColor: '#FF5A5F',
  },
  VOYO: {
    slug: 'voyo',
    displayName: 'Voyo',
    brandColor: '#E30613',
  },
  ONEPLAY: {
    slug: 'oneplay',
    displayName: 'Oneplay',
    brandColor: '#E30613',
  },
};

/** Alias → kanonický merchant_key */
const ALIASES: Record<string, string> = {
  'APPLE.COM': 'APPLE',
  'APPLE COM': 'APPLE',
  ICLOUD: 'APPLE',
  'APPLE MUSIC': 'APPLE',
  'APPLE TV': 'APPLE',
  YOUTUBE: 'YOUTUBE PREMIUM',
  'GOOGLE YOUTUBE': 'YOUTUBE PREMIUM',
  YOUTUBEPREMIUM: 'YOUTUBE PREMIUM',
  'GOOGLE YOUTUBEPREMIUM': 'YOUTUBE PREMIUM',
  DISNEY: 'DISNEY PLUS',
  DISNEYPLUS: 'DISNEY PLUS',
  'DISNEY+': 'DISNEY PLUS',
  HBO: 'HBO MAX',
  HBOMAX: 'HBO MAX',
  // Ne alias „MAX“ — kolize s MAX FITNESS apod.
  'MAX COM': 'HBO MAX',
  'AMAZON PRIME VIDEO': 'AMAZON PRIME',
  PRIME: 'AMAZON PRIME',
  GOOGLEONE: 'GOOGLE ONE',
  'OPEN AI': 'OPENAI',
  GPT: 'CHATGPT',
  'CHATGPT SUBSCR': 'CHATGPT',
  'OPENAI CHATGPT': 'CHATGPT',
  'OPENAI CHATGPT SUBSCR': 'CHATGPT',
  'OPENAI SUBSCR': 'CHATGPT',
  CLAUDE: 'ANTHROPIC',
  'CLAUDE AI': 'ANTHROPIC',
  'CLAUDE.AI': 'ANTHROPIC',
  'CURSOR AI': 'CURSOR',
  'CURSOR.COM': 'CURSOR',
  PREHRAJ: 'PREHRAJ.TO',
  'PREHRAJ TO': 'PREHRAJ.TO',
  PREHRAJTO: 'PREHRAJ.TO',
  HERO: 'HEROHERO',
  'HERO HERO': 'HEROHERO',
  VOYO: 'VOYO',
  ONEPLAY: 'ONEPLAY',
  'ONE PLAY': 'ONEPLAY',
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
