/**
 * Klíčová slova po normalizaci merchant_key / popisu → kategorie.
 * Shoda jako celé slovo, prefix tokenu, nebo (u selected) infix.
 */
export type KeywordRule = {
  keywords: string[];
  category: string;
  /** Hledej i uvnitř slova (např. ARENA v ESPORTARENA) */
  infix?: boolean;
};

export const MERCHANT_KEYWORD_RULES: KeywordRule[] = [
  {
    category: 'Jídlo a nápoje',
    keywords: [
      'KURAK',
      'GRIL',
      'GRILL',
      'KEBAB',
      'BURGER',
      'SUSHI',
      'PEKARNA',
      'PEKAR',
      'BAGET',
      'PIZZA',
      'RESTAURACE',
      'RESTAURANT',
      'KAVARNA',
      'CAFE',
      'COFFEE',
      'BISTRO',
      'HOSPODA',
      'BUFET',
      'CUKRARNA',
      'ZMRZLINA',
      'POTRAVINY',
      'SUPERMARKET',
      'MARKET',
    ],
  },
  {
    category: 'Domácnost a nábytek',
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
    category: 'Doprava',
    keywords: [
      'PARKOV',
      'BENZIN',
      'NAFTA',
      'OIL',
      'PETROL',
      'AUTOBUS',
      'MHD',
      'CD.CZ',
      'TAXI',
      'UBER',
      'BOLT',
      'CERPACI',
      'CERPACI STANICE',
      'DALNICE',
      'MYTO',
      'CARVERTICAL',
      'AUTOMOTO',
      'LKQ',
      'LETISTE',
    ],
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
    category: 'Zábava a kultura',
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
    category: 'Zábava a kultura',
    keywords: ['ARENA'],
    infix: true,
  },
  {
    category: 'Zdraví',
    keywords: ['LEKARNA', 'PHARM', 'LEKAREN', 'DOKTOR', 'KLINIKA', 'ORDINACE', 'STOMATO'],
  },
  {
    category: 'Sport',
    keywords: ['SPORT', 'FITNESS', 'GYM', 'BAZEN', 'PLAVANI', 'SQUASH', 'TENIS'],
  },
  {
    category: 'Oblečení a obuv',
    keywords: ['FASHION', 'OBUV', 'TEXTIL', 'ODĚVY', 'ODEVY', 'BOTY', 'OBUVNICK'],
  },
  {
    category: 'Cestování a ubytování',
    keywords: ['HOTEL', 'PENZION', 'AIRBNB', 'BOOKING', 'HOSTEL', 'CAMPING', 'UBYTOVANI', 'UBYT'],
  },
  {
    category: 'Elektronika',
    keywords: ['ELECTRO', 'ELEKTRO', 'NOTEBOOK', 'MOBIL', 'PC ', 'COMPUTER'],
  },
  {
    category: 'Bydlení',
    keywords: ['POJISTENI', 'POJISTKA', 'POJISTOVNA', 'CEZ', 'INNOGY', 'PLYNARENSKA'],
  },
  {
    category: 'Telefon a internet',
    keywords: ['VODAFONE', 'T-MOBILE', 'TMOBILE', 'STARNET', 'NEJ.CZ'],
  },
  {
    category: 'Bankovní poplatky',
    keywords: ['POPLATEK', 'POPLATKY'],
  },
  {
    category: 'Splátky úvěrů',
    keywords: ['SPLATKA UVERU', 'HYPOTEK', 'LEASING'],
  },
  {
    category: 'Předplatné',
    // Bez APPLE.COM — App Store nákupy i předplatná; shluk řeší subscription-detect
    keywords: ['SUBSCRIPTION', 'MEMBERSHIP'],
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
 * „CS MILOVICE“ / „CS PRAHA“ → Doprava (čerpací stanice CS).
 */
export function isCsFuelStationName(raw: string): boolean {
  const hay = normalizeHaystack(raw);
  return /^CS\s+[A-Z]/.test(hay) || /\bCS\s+[A-Z]{3,}/.test(hay);
}

/**
 * Shoda klíčového slova jako celé slovo, prefix tokenu, nebo infix (ARENA).
 */
export function lookupMerchantKeywords(raw: string): string | null {
  const hay = normalizeHaystack(raw);
  if (!hay || hay.length < 3) return null;

  if (isCsFuelStationName(hay) || hay.includes('CERPACI STANICE') || hay.includes('CERPACI')) {
    // CERPACI samotné už je v Doprava; CS <město> explicitně
    if (isCsFuelStationName(hay) || hay.includes('CERPACI')) {
      return 'Doprava';
    }
  }

  const tokens = hay.split(' ').filter(Boolean);

  for (const rule of MERCHANT_KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      const k = normalizeHaystack(kw);
      if (!k) continue;
      if (rule.infix) {
        if (hay.includes(k)) return rule.category;
        continue;
      }
      if (hay === k || hay.startsWith(`${k} `) || hay.includes(` ${k} `) || hay.endsWith(` ${k}`)) {
        return rule.category;
      }
      if (tokens.some((t) => t === k || t.startsWith(k))) {
        return rule.category;
      }
    }
  }
  return null;
}
