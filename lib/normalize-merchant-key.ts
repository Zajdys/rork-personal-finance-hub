/**
 * Normalizace názvu obchodníka → merchant_key.
 * Stejná funkce při importu, ukládání user_category_rules i párování.
 *
 * Příklady:
 *   "ALBERT VAM DEKUJE; PLZEN; CZE" → "ALBERT"
 *   "Hobby Riha" / "HOBBY RIHA" → "HOBBY RIHA"
 *   "BAUHAUS k.s. 889" → "BAUHAUS"
 *   "Nakup: POTRAVINY LANHUNG, Stahlavy, CZ, dne 25.6.2026, castka 161.50 czk"
 *     → "POTRAVINY LANHUNG"
 *   "603 GECO VAM DEKUJE" → "GECO"
 *   "AIRBNB * HMWQHA4EMM" → "AIRBNB"
 *   "RADKA STEFLOVA ul.Tymakovska 42," → "RADKA STEFLOVA"
 *   "Slevomat.cz Pernerova 42, Praha, 18600" → "SLEVOMAT"
 *   "KFC Olympia Plzen DT Pisecka 1011/4" → "KFC"
 *   "BOLT O 2510021428" / "BOLT.EUO2509121122" / "BOLT FOOD" → "BOLT"
 */

/**
 * Ořízne českou adresu z detailů výpisu (Air Bank / podobné):
 * „<OBCHODNÍK> <ulice> <číslo>, <město>, <PSČ>, <země>“.
 * Vstup už bez diakritiky, VELKÁ PÍSMENA.
 *
 * Pozn.: neřežeme tokeny končící na -OVA/-SKA (příjmení „STEFLOVA“);
 * ulici bez „ul.“ ořeže číslo popisné + PREFIX_BRANDS v normalizeMerchantKey.
 */
export function stripCzechAddressTail(s: string): string {
  let t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';

  // Explicitní uliční labely (i slepené „UL.TYMAKOVSKA“)
  t = t.replace(/\s+UL\.?\s*.*$/i, '');
  t = t.replace(/\s+NAM\.?\s*.*$/i, '');
  t = t.replace(/\s+(NAMESTI|NAVES|TRIDA)\b.*$/i, '');

  // PSČ (332 02 / 33202)
  t = t.replace(/\s+\d{3}\s?\d{2}\b.*$/, '');

  // Číslo popisné / orientační (42, 1011/4, 168) + zbytek adresy
  const house = t.match(/\s+(\d{1,5})(?:\/\d+)?(?:\s+|$)/);
  if (house && house.index != null && house.index > 0) {
    t = t.slice(0, house.index).trim();
  }

  // Trailing ulice bez čísla: „SLEVOMAT PERNEROVA“ / „… PISECKA“ —
  // jen když zbývají 3+ tokeny (ne „RADKA STEFLOVA“)
  const streetSuffix = /^(OVA|SKA|CKA|ECKA|NIHO|EHO|ICE)$/i;
  let parts = t.split(' ').filter(Boolean);
  while (parts.length > 2) {
    const last = parts[parts.length - 1]!;
    const m = last.match(/[A-Z]+(OVA|SKA|CKA|ECKA|NIHO|EHO|ICE)$/i);
    if (!m || !streetSuffix.test(m[1]!)) break;
    parts = parts.slice(0, -1);
  }
  return parts.join(' ').trim();
}

/**
 * Odstraní koncové číselné ID transakce/pobočky (6+ číslic),
 * i když je nalepené na text („BOLT.EUO2509121122“).
 */
export function stripTrailingTxnId(s: string): string {
  let t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // Samostatný token: „BOLT O 2510021428“
  t = t.replace(/\s+\d{6,}$/g, '');
  // Nalepené na písmena/tečku: „BOLT.EUO2509121122“, „NYX2601011234“
  t = t.replace(/\d{6,}$/g, '');
  t = t.replace(/[.\-]+$/g, '').trim();
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/** Platební brány — samy nejsou obchodník; jméno za * / mezerou zachovej. */
export const PAYMENT_GATEWAYS = [
  'GOPAY',
  'NYX',
  'PAYPAL',
  'PAYU',
  'COMGATE',
] as const;

/**
 * Sjednotí varianty značek, které DO NÁZVU vkládají ID / TLD / produkt
 * (BOLT / BOLT.EU / BOLT FOOD → BOLT).
 * Neplatí pro platební brány (GOPAY *OBCHOD → GOPAY OBCHOD).
 */
export function collapseKnownBrands(s: string): string | null {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;

  // Jen skuteční obchodníci / služby — NE platební brány
  // VODAFONE / CEZ: „VODAFONE CZECH REP“ ↔ „VODAFONE“ (duplicity ve výpisech)
  const brands = ['KLEPIERRE', 'UBER', 'WOLT', 'BOLT', 'PMDP', 'VODAFONE', 'CEZ'] as const;

  for (const brand of brands) {
    if (t === brand) return brand;
    if (t.startsWith(`${brand} `) || t.startsWith(`${brand}.`) || t.startsWith(`${brand}-`)) {
      return brand;
    }
    if (t.startsWith(brand) && t.length > brand.length) {
      const rest = t.slice(brand.length).replace(/[.\-\s]/g, '');
      if (!rest || /^(FOOD|EU|EATS|TRIP|O|PAY|EUO)+$/i.test(rest)) {
        return brand;
      }
    }
  }
  return null;
}

/**
 * „GOPAY *CISTEDREVO.CZ“ / „NYX*myckasro“ → { gateway, merchant }
 * Samotné „GOPAY“ / „NYX123456“ → merchant prázdný / jen ID.
 */
export function splitPaymentGateway(s: string): { gateway: string; merchant: string } | null {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  for (const gw of PAYMENT_GATEWAYS) {
    if (t === gw) return { gateway: gw, merchant: '' };
    // GOPAY *MERCHANT | NYX*MERCHANT | GOPAY MERCHANT | NYX123…
    if (!t.startsWith(gw)) continue;
    let rest = t.slice(gw.length);
    // oddělovač: *, mezera, nebo rovnou ID/název
    if (rest.startsWith('*') || rest.startsWith(' ') || rest.startsWith('.') || rest.startsWith('-')) {
      rest = rest.replace(/^[*\s.\-]+/, '');
    } else if (/^\d/.test(rest)) {
      // NYX260101123456 — jen ID nalepené na bránu
      return { gateway: gw, merchant: rest };
    } else if (/^[A-Z]/.test(rest) && rest.length >= 3) {
      // Nyxgalerieslovanysro / Nyxmyckasro — obchodník slepený bez *
      return { gateway: gw, merchant: rest };
    } else {
      continue; // např. „GOPAYABLE“ — ne brána
    }
    return { gateway: gw, merchant: rest.trim() };
  }
  return null;
}

/** Vyčistí název obchodníka za platební bránou (bez opětovného collapse na bránu). */
function normalizeGatewayMerchantPart(raw: string): string {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  s = s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase();
  s = s.replace(/\.(CZ|COM|NET|EU|SK|AT|DE)\b/g, '');
  s = s.replace(
    /\b(S\.?\s*R\.?\s*O\.?|A\.?\s*S\.?|K\.?\s*S\.?|V\.?\s*O\.?\s*S\.?|Z\.?\s*S\.?|O\.?\s*P\.?\s*S\.?|SPOL\.?\s*S\s*R\.?\s*O\.?)\b/gi,
    ' ',
  );
  s = s.replace(/[^A-Z0-9&\s.\-]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = stripTrailingTxnId(s);
  s = s.replace(/\s+\d{2,6}$/g, '').trim();
  // Čistě číselné ID → žádný obchodník
  if (!s || /^\d+$/.test(s.replace(/\s/g, ''))) return '';
  if (s.replace(/[^A-Z]/g, '').length < 2) return '';
  return s;
}

export function normalizeMerchantKey(raw: string): string {
  let s = String(raw ?? '').trim();
  if (!s) return '';

  // Část před středníkem = obchodník; město/země za ním zahodit
  s = s.split(';')[0]!.trim();
  if (!s) return '';

  // Bez diakritiky, VELKÁ
  s = s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase();

  // Apple / Google bill — necháme APPLE.COM jako klíč
  if (/APPLE\.COM(?:\/\w+)?/i.test(s)) {
    return 'APPLE.COM';
  }

  // GOOGLE *YouTubePremium — * by jinak ořízlo produkt a zůstalo jen GOOGLE
  if (/GOOGLE\s*\*?\s*YOUTUBE/i.test(s)) {
    return 'GOOGLE YOUTUBE';
  }

  // OPENAI *CHATGPT SUBSCR → stabilní klíč (ne „OPENAI SUBSCR“)
  if (/OPENAI\s*\*?\s*CHATGPT/i.test(s) || /\bCHATGPT\s*SUBSCR/i.test(s)) {
    return 'OPENAI CHATGPT SUBSCR';
  }

  // "Platba kartou · MERCHANT" (Air Bank / podobné) — ber obchodníka za oddělovačem
  if (/[·•]/.test(s)) {
    const parts = s.split(/\s*[·•]\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      s = parts[parts.length - 1]!;
    }
  }

  // Platební brána * obchodník — PŘED obecným ořezem „*CODE“
  const gwSplit = splitPaymentGateway(s);
  if (gwSplit) {
    const merchant = normalizeGatewayMerchantPart(gwSplit.merchant);
    if (!merchant) return gwSplit.gateway;
    return `${gwSplit.gateway} ${merchant}`;
  }

  // Prefixed payment noise: "NAKUP: …", "PLATBA: …"
  s = s.replace(/^(NAKUP|PLATBA|PREVOD|UHRADA|KARTA)\s*:?\s*/i, '');

  // Odřízni datum / částku (celý ocas)
  s = s.replace(/,?\s*DNE\s+\d{1,2}\.\s*\d{1,2}\.\s*\d{2,4}\b.*$/i, '');
  s = s.replace(/,?\s*CASTKA\b.*$/i, '');

  // První segment před čárkou (město / země často za čárkou)
  // "POTRAVINY LANHUNG, STAHLAVY, CZ" → "POTRAVINY LANHUNG"
  if (s.includes(',')) {
    s = s.split(',')[0]!.trim();
  }

  s = s.replace(/\.COM\/\w+/g, '');
  s = s.replace(/\.(CZ|COM|NET|EU|SK|AT|DE)\b/g, '');

  // AIRBNB * CODE / GOOGLE *YouTube… (ne platební brány — ty už jsou výše)
  s = s.replace(/\*+\S*/g, ' ');

  // Číslo pobočky na začátku („603 GECO …“)
  s = s.replace(/^\d{2,6}\s+/, '');

  // Typické české doplatky výpisu
  s = s.replace(/\s+VAM\s+DEKUJE(?:ME)?(?:\s.*)?$/i, '');
  s = s.replace(/\s+DEKUJE(?:ME)?(?:\s.*)?$/i, '');
  s = s.replace(/\s+THANK\s+YOU(?:\s.*)?$/i, '');

  // Právní formy firem
  s = s.replace(
    /\b(S\.?\s*R\.?\s*O\.?|A\.?\s*S\.?|K\.?\s*S\.?|V\.?\s*O\.?\s*S\.?|Z\.?\s*S\.?|O\.?\s*P\.?\s*S\.?|SPOL\.?\s*S\s*R\.?\s*O\.?)\b/gi,
    ' ',
  );

  // Jen A–Z, číslice, mezery, & . -
  s = s.replace(/[^A-Z0-9&\s.\-]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  // Značky končící číslem — před stripCzechAddressTail (jinak „212“ = číslo popisné)
  if (s === 'TRADING 212' || s.startsWith('TRADING 212 ')) return 'TRADING 212';
  if (s === 'TRADING212' || s.startsWith('TRADING212 ')) return 'TRADING 212';

  // Adresa z Detailů (Air Bank …) — před ořezem trailing čísla pobočky
  s = stripCzechAddressTail(s);
  if (!s) return '';

  // Trailing číslo pobočky („BAUHAUS 889“, „NANU NANA 1326“)
  s = s.replace(/\s+\d{2,6}$/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return '';

  // Koncové ID transakce (6+ číslic) — i nalepené: „BOLT.EUO2509121122“, „BOLT O 2510021428“
  s = stripTrailingTxnId(s);
  if (!s) return '';

  // Sjednocení značek s ID / variantami (BOLT.EU, BOLT FOOD, UBER EATS, …)
  const collapsed = collapseKnownBrands(s);
  if (collapsed) return collapsed;

  // Prefixed multi-word / single brands (delší první)
  const PREFIX_BRANDS = [
    'CINEMA CITY',
    'CESKE DRAHY',
    'GOOGLE YOUTUBE',
    'YOUTUBE PREMIUM',
    'APPLE.COM',
    'APPLE COM',
    'XLCZ NABYTEK',
    'XL CZ',
    'TRADING 212',
    'MCDONALDS',
    'MC DONALD',
    'BURGER KING',
    'HOME CREDIT',
    'CESKA POSTA',
    'CERPACI STANICE',
    'DOLNI MORAVA',
    'DETSKY PARK',
    'GOLDEN GATE',
    'NANU NANA',
    'NEW YORKER',
    'NEW YORK BURGER',
    'DR MAX',
    'DR. MAX',
    'POTRAVINY LANHUNG',
    'SLEVOMAT',
    'AUTOBUSY',
    'DOMENA',
    'WEDOS',
    'FORPSI',
    'ACTIVE24',
    'GODADDY',
    'CLOUDFLARE',
    'KFC',
    'COOP',
    'LIDL',
    'PENNY',
    'ALBERT',
    'TESCO',
    'BILLA',
  ];
  for (const brand of PREFIX_BRANDS) {
    if (s === brand || s.startsWith(`${brand} `)) return brand.replace(/\s+/g, ' ');
  }

  // www.brainmarket → BRAINMARKET
  s = s.replace(/^WWW\s+/, '').replace(/^WWW\./, '');

  // Zahodť kódy zemí jako samostatné tokeny
  const tokens = s
    .split(' ')
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t.length >= 1 && !/^(CZ|CZE|SK|SVK|DE|DEU|AT|AUT)$/.test(t));

  if (!tokens.length) return '';

  // Celý zbývající název (ne jen první token) — „HOBBY RIHA“, „RADKA STEFLOVA“
  const key = tokens.join(' ').trim();
  // Příliš krátké (1 znak) odmítni
  if (key.replace(/[^A-Z]/g, '').length < 2) return '';
  return key;
}

/** Celý název před středníkem (normalizovaný), ne jen první token — pro short-name check. */
export function merchantNameCoreBeforeSemicolon(raw: string): string {
  let s = String(raw ?? '').trim().split(';')[0]?.trim() || '';
  if (!s) return '';
  s = s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9&\s.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

/** Počet písmen v jádru názvu (bez čísel/mezer) — short-name = < 3. */
export function merchantNameLetterCount(raw: string): number {
  return merchantNameCoreBeforeSemicolon(raw).replace(/[^A-Z]/g, '').length;
}

/** Z řádku merchantu vytáhne město za středníkem (pro „Neznámý obchodník (Plzeň)“). */
export function extractMerchantCityHint(raw: string): string | null {
  const parts = String(raw ?? '')
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const city = parts[1]!
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!city || /^(CZE|CZ|SVK|SK|DEU|DE|AUT|AT)$/i.test(city)) return null;
  return city
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}
