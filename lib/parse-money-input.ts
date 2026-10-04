/**
 * Normalizace uživatelského číselného vstupu (CS/EN).
 * Odstraní mezery včetně \u00A0 a \u202F, určí desetinný oddělovač.
 * Jedna čárka (typicky iOS decimal-pad + cs locale) = desetinná část.
 * Záporná čísla: ASCII `-` i typografické minus (\u2212) / figure/en dash.
 * Prázdný / nevalidní → null.
 */
function normalizeDecimalString(raw: string | number | null | undefined): string | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? String(raw) : null;
  }
  if (raw == null) return null;

  let t = String(raw)
    .trim()
    // minus / pomlčky → ASCII hyphen-minus (PnL, copy-paste z dokumentů)
    .replace(/[\u2212\u2012\u2013\u2014]/g, '-')
    .replace(/[\s\u00A0\u202F\u2007\u2009]/g, '');

  if (!t || t === '+' || t === '-' || t === '.' || t === ',' || t === '-.' || t === '-,') {
    return null;
  }

  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    // Oba oddělovače: pozdější = desetinný
    if (lastComma > lastDot) {
      t = t.replace(/\./g, '').replace(',', '.');
    } else {
      t = t.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    // Jedna čárka = desetinná (iOS cs decimal-pad posílá „5,49“ / „0,02562144“)
    // Více čárek = tisícové oddělovače
    const commaCount = (t.match(/,/g) ?? []).length;
    if (commaCount === 1) {
      t = t.replace(',', '.');
    } else {
      t = t.replace(/,/g, '');
    }
  } else if (lastDot >= 0) {
    const parts = t.split('.');
    if (parts.length > 2) {
      const dec = parts.pop()!;
      // Poslední segment jako desetinná část, pokud vypadá rozumně
      if (dec.length > 0 && dec.length <= 12) {
        t = `${parts.join('')}.${dec}`;
      } else {
        t = parts.join('') + dec;
      }
    }
  }

  if (t.includes(',')) {
    t = t.replace(/,/g, '.');
  }

  return t;
}

/**
 * Obecné desetinné číslo (kusy, cena/ks, kurz, sazba, …).
 * Stejná normalizace jako parseMoneyInput; zaokrouhlení na maxDecimals.
 */
export function parseDecimalInput(
  raw: string | number | null | undefined,
  maxDecimals: number,
): number | null {
  const decimals = Math.max(0, Math.min(12, Math.floor(maxDecimals)));
  const factor = 10 ** decimals;

  const normalized =
    typeof raw === 'number'
      ? Number.isFinite(raw)
        ? raw
        : null
      : (() => {
          const s = normalizeDecimalString(raw);
          if (s == null) return null;
          const n = Number.parseFloat(s);
          return Number.isFinite(n) ? n : null;
        })();

  if (normalized == null) return null;
  return Math.round(normalized * factor) / factor;
}

/**
 * Částka v měně: max 2 desetinná místa (haléře).
 * Prázdný / nevalidní → null. Záporná čísla (PnL, korekce) podporována.
 */
export function parseMoneyInput(
  raw: string | number | null | undefined,
): number | null {
  return parseDecimalInput(raw, 2);
}
