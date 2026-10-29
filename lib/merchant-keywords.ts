/**
 * Klíčová slova po normalizaci merchant_key / popisu → kategorie (+ volitelná podkategorie).
 * Shoda jako celé slovo, prefix tokenu, nebo (u selected) infix.
 */
export type KeywordRule = {
  keywords: string[];
  category: string;
  subcategory?: string | null;
  /** Hledej i uvnitř slova (např. ARENA v ESPORTARENA) */
  infix?: boolean;
};

export type KeywordCategoryHit = { category: string; subcategory?: string | null };

export const MERCHANT_KEYWORD_RULES: KeywordRule[] = [
  {
    category: 'Jídlo',
    subcategory: 'Restaurace',
    keywords: [
      'KURAK',
      'GRIL',
      'GRILL',
      'KEBAB',
      'BURGER',
      'SUSHI',
      'BAGET',
      'PIZZA',
      'RESTAURACE',
      'RESTAURANT',
      'BISTRO',
      'HOSPODA',
      'BUFET',
    ],
  },
  {
    category: 'Jídlo',
    subcategory: 'Kavárny',
    keywords: ['KAVARNA', 'CAFE', 'COFFEE', 'CUKRARNA', 'ZMRZLINA'],
  },
  {
    category: 'Jídlo',
    subcategory: 'Potraviny',
    keywords: [
      'PEKARNA',
      'PEKAR',
      'POTRAVINY',
      'SUPERMARKET',
      'MARKET',
      'LIDL',
      'ALBERT',
      'KAUFLAND',
      'BILLA',
      'TESCO',
    ],
  },
  {
    category: 'Nákupy',
    subcategory: 'Domácnost a nábytek',
    keywords: [
      'NABYTEK',
      'HOBBY',
      'STAVEBNINY',
      'NARADI',
      'ZAHRADA',
      'BYTOVE',
      'BRAINMARKET',
      'COLORLAK',
      'VYSAVAC',
      'HORNBACH',
      'BAUHAUS',
      'SIKO',
    ],
  },
  {
    category: 'Auto a doprava',
    subcategory: 'Benzín a nafta',
    keywords: ['BENZIN', 'NAFTA', 'TANK', 'OIL', 'PETROL', 'CERPACI', 'CERPACI STANICE'],
  },
  {
    category: 'Auto a doprava',
    subcategory: 'Parkování a dálnice',
    keywords: ['PARKOV', 'DALNICE', 'MYTO'],
  },
  {
    category: 'Auto a doprava',
    subcategory: 'MHD a vlak',
    keywords: ['VLAK', 'AUTOBUS', 'MHD', 'CD.CZ', 'TAXI', 'UBER', 'BOLT', 'LETISTE'],
  },
  {
    category: 'Auto a doprava',
    subcategory: 'Servis a STK',
    keywords: ['CARVERTICAL', 'AUTOMOTO', 'LKQ', 'STK'],
  },
  {
    category: 'Investice',
    keywords: ['GOLDEN GATE', 'GOLDENGATE', 'OK INVESTICE'],
  },
  {
    category: 'Nákupy',
    keywords: ['ALLEGRO', 'AUKRO', 'IHERB', 'THEPAY', 'NANU NANA', 'STARGAZE', 'TEMU'],
  },
  {
    category: 'Volný čas',
    subcategory: 'Kultura',
    keywords: [
      'DOLNIMORAVA',
      'DOLNI MORAVA',
      'DETSKY PARK',
      'AQUAPARK',
      'AQUALAND',
      'BOWLING',
      'LASER',
      'LASERGAME',
      'CINEMA',
      'KINO',
      'DIVADLO',
      'MUZEUM',
      'GALERIE',
      'KONCERT',
      'FESTIVAL',
      'ZOO',
      'ESCAPE',
    ],
  },
  {
    category: 'Volný čas',
    subcategory: 'Hry',
    keywords: ['ARENA'],
    infix: true,
  },
  {
    category: 'Zdraví',
    subcategory: 'Lékárna',
    keywords: ['LEKARNA', 'PHARM', 'LEKAREN'],
  },
  {
    category: 'Zdraví',
    subcategory: 'Lékař',
    keywords: ['DOKTOR', 'KLINIKA', 'ORDINACE', 'STOMATO'],
  },
  {
    category: 'Volný čas',
    subcategory: 'Sport',
    keywords: ['SPORT', 'BAZEN', 'PLAVANI', 'SQUASH', 'TENIS'],
  },
  {
    category: 'Předplatné',
    subcategory: 'Posilovna',
    keywords: ['FITNESS', 'GYM', 'POSILOVNA'],
  },
  {
    category: 'Nákupy',
    subcategory: 'Oblečení a obuv',
    keywords: ['FASHION', 'OBUV', 'TEXTIL', 'ODĚVY', 'ODEVY', 'BOTY', 'OBUVNICK'],
  },
  {
    category: 'Cestování',
    subcategory: 'Ubytování',
    keywords: ['HOTEL', 'PENZION', 'AIRBNB', 'BOOKING', 'HOSTEL', 'CAMPING', 'UBYTOVANI', 'UBYT'],
  },
  {
    category: 'Nákupy',
    subcategory: 'Elektronika',
    keywords: ['ELECTRO', 'ELEKTRO', 'NOTEBOOK', 'MOBIL', 'PC ', 'COMPUTER'],
  },
  {
    category: 'Bydlení',
    subcategory: 'Energie',
    keywords: ['CEZ', 'INNOGY', 'PLYNARENSKA', 'ENERGIE', 'ELEKTRINA', 'PLYN'],
  },
  {
    category: 'Bydlení',
    subcategory: 'Nájem',
    keywords: ['NAJEM'],
  },
  {
    category: 'Bydlení',
    subcategory: 'Voda',
    keywords: ['VODA'],
  },
  {
    category: 'Auto a doprava',
    subcategory: 'Pojištění',
    keywords: ['POJISTENI', 'POJISTKA', 'POJISTOVNA'],
  },
  {
    category: 'Bydlení',
    subcategory: 'Internet a telefon',
    keywords: ['VODAFONE', 'T-MOBILE', 'TMOBILE', 'STARNET', 'NEJ.CZ'],
  },
  {
    category: 'Poplatky a hotovost',
    subcategory: 'Bankovní poplatky',
    keywords: ['POPLATEK', 'POPLATKY'],
  },
  {
    category: 'Úvěry',
    subcategory: 'Hypotéka',
    keywords: ['HYPOTEK'],
  },
  {
    category: 'Úvěry',
    subcategory: 'Leasing',
    keywords: ['LEASING'],
  },
  {
    category: 'Úvěry',
    subcategory: 'Půjčka',
    keywords: ['SPLATKA UVERU'],
  },
  {
    category: 'Předplatné',
    subcategory: 'Streaming',
    // Bez APPLE.COM — App Store nákupy i předplatná; shluk řeší subscription-detect
    keywords: ['SUBSCRIPTION', 'MEMBERSHIP', 'NETFLIX', 'SPOTIFY', 'HBO', 'DISNEY'],
  },
];

function normalizeHaystack(raw: string): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * „CS MILOVICE“ / „CS PRAHA“ → Auto a doprava / Benzín a nafta.
 */
export function isCsFuelStationName(raw: string): boolean {
  const hay = normalizeHaystack(raw);
  return /^CS\s+[A-Z]/.test(hay) || /\bCS\s+[A-Z]{3,}/.test(hay);
}

/**
 * Shoda klíčového slova jako celé slovo, prefix tokenu, nebo infix (ARENA).
 */
export function lookupMerchantKeywords(raw: string): KeywordCategoryHit | null {
  const hay = normalizeHaystack(raw);
  if (!hay || hay.length < 3) return null;

  if (isCsFuelStationName(hay) || hay.includes('CERPACI STANICE') || hay.includes('CERPACI')) {
    if (isCsFuelStationName(hay) || hay.includes('CERPACI')) {
      return { category: 'Auto a doprava', subcategory: 'Benzín a nafta' };
    }
  }

  const tokens = hay.split(' ').filter(Boolean);

  for (const rule of MERCHANT_KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      const k = normalizeHaystack(kw);
      if (!k) continue;
      if (rule.infix) {
        if (hay.includes(k)) {
          return { category: rule.category, subcategory: rule.subcategory ?? null };
        }
        continue;
      }
      if (hay === k || hay.startsWith(`${k} `) || hay.includes(` ${k} `) || hay.endsWith(` ${k}`)) {
        return { category: rule.category, subcategory: rule.subcategory ?? null };
      }
      if (tokens.some((t) => t === k || t.startsWith(k))) {
        return { category: rule.category, subcategory: rule.subcategory ?? null };
      }
    }
  }
  return null;
}
