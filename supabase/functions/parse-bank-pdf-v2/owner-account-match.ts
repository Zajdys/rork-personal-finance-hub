/**
 * Normalizace a shoda vlastních bankovních účtů (CSV i PDF import).
 * Podporuje zápisy: 767628012/5500, s mezerami, IBAN CZ67 5500 …
 */

/** Odstraní mezery a pomlčky, lower-case. Lomítko `/` ponechá. */
export function compactAccountKey(raw: string): string {
  return String(raw ?? '')
    .replace(/[\s\-]/g, '')
    .toLowerCase();
}

/** CZ IBAN (24 znaků bez mezer) → domácí tvary čísla účtu. */
export function czechIbanToDomesticForms(compact: string): string[] {
  const m = compact.match(/^cz\d{2}(\d{4})(\d{6})(\d{10})$/);
  if (!m) return [];
  const bank = m[1]!;
  const prefixRaw = m[2]!;
  const numberRaw = m[3]!;
  const prefix = prefixRaw.replace(/^0+/, '');
  const number = numberRaw.replace(/^0+/, '') || '0';
  const withSlash = prefix ? `${prefix}-${number}/${bank}` : `${number}/${bank}`;
  return [withSlash, number, numberRaw, `${prefixRaw}${numberRaw}`, `${bank}${prefixRaw}${numberRaw}`];
}

/**
 * Všechny tvary, které můžou ve výpisu/CSV sedět na zadaný účet.
 * Krátké jehly (< 6 znaků) vynecháme — jinak by sedělo „5500“ apod.
 */
export function expandOwnerAccountNeedles(raw: string): string[] {
  const compact = compactAccountKey(raw);
  if (!compact) return [];

  const out = new Set<string>([compact]);

  for (const f of czechIbanToDomesticForms(compact)) {
    out.add(compactAccountKey(f));
  }

  // Domácí: [předčíslí-]číslo/kód banky
  const dom = compact.match(/^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/);
  if (dom) {
    const prefix = dom[1];
    const num = dom[2]!;
    const bank = dom[3]!;
    out.add(num);
    out.add(`${num}/${bank}`);
    if (prefix) {
      out.add(`${prefix}-${num}/${bank}`);
      out.add(`${prefix}${num}/${bank}`);
    }
    const paddedNum = num.padStart(10, '0');
    const paddedPrefix = (prefix ?? '').padStart(6, '0');
    out.add(paddedNum);
    out.add(`${paddedNum}/${bank}`);
    out.add(`${bank}${paddedPrefix}${paddedNum}`);
  } else if (/^\d{6,12}$/.test(compact)) {
    out.add(compact);
  }

  return [...out].filter((n) => n.length >= 6);
}

/** True, pokud text transakce obsahuje některý z vlastních účtů (po normalizaci). */
export function blockContainsAnyOwnerAccount(
  blockText: string,
  accounts: string[],
): boolean {
  if (!accounts.length) return false;
  const haystack = compactAccountKey(blockText);
  if (!haystack) return false;
  for (const acc of accounts) {
    for (const needle of expandOwnerAccountNeedles(acc)) {
      if (haystack.includes(needle)) return true;
    }
  }
  return false;
}

/** Normalizovaný flat seznam čísel z UI / storage. */
export function normalizeOwnerAccountList(accounts: string[]): string[] {
  const out: string[] = [];
  for (const a of accounts) {
    const n = String(a ?? '').replace(/\s+/g, '').trim();
    if (n) out.push(n);
  }
  return [...new Set(out)];
}
