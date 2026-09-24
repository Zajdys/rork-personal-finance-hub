/**
 * Extrakce jména majitele z hlavičky PDF výpisu (plain text).
 */

function cleanOwnerCandidate(raw: string): string | undefined {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  // Ořez adresy / PSČ za jménem
  s = s.replace(/,?\s*\d{3}\s?\d{2}\b.*$/u, '').trim();
  s = s.replace(/,?\s*(?:ul\.|Ul\.|nám\.|Nám\.).*$/u, '').trim();
  // Fio: "Příjmení, Jméno, adresa…" → "Jméno Příjmení"
  const commaParts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (
    commaParts.length >= 2 &&
    !/^\d/.test(commaParts[0]!) &&
    !/^\d/.test(commaParts[1]!) &&
    commaParts[0]!.split(/\s+/).length <= 3 &&
    commaParts[1]!.split(/\s+/).length <= 3
  ) {
    s = `${commaParts[1]} ${commaParts[0]}`.trim();
  }
  // Zahodit zjevně ne-jména
  if (s.length < 3 || s.length > 80) return undefined;
  if (/^\d/.test(s)) return undefined;
  if (/:$/.test(s)) return undefined;
  if (/účet|iban|bic|výpis|období|zůstatek|strana\s*\d|měna|frekvence/i.test(s)) return undefined;
  return s;
}

function valueAfterLabel(text: string, labelRe: RegExp): string | undefined {
  const m = text.match(labelRe);
  if (!m || m.index == null) return undefined;
  const after = text.slice(m.index + m[0].length);
  const lines = after.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 4)) {
    const cleaned = cleanOwnerCandidate(line);
    if (cleaned) return cleaned;
  }
  return undefined;
}

/** RB / ČSOB: „Název účtu:“ + následující řádek */
export function extractOwnerFromNazevUctu(text: string): string | undefined {
  return valueAfterLabel(text, /N[áa]zev\s+[uú]čtu\s*:/i);
}

/** Fio: „Majitel účtu:“ (+ adresa na stejném / dalším řádku) */
export function extractOwnerFromMajitelUctu(text: string): string | undefined {
  const sameLine = text.match(/Majitel\s+[uú]čtu\s*:\s*([^\n]+)/i);
  if (sameLine?.[1]?.trim()) {
    const c = cleanOwnerCandidate(sameLine[1]);
    if (c) return c;
  }
  return valueAfterLabel(text, /Majitel\s+[uú]čtu\s*:/i);
}

/**
 * KB: jméno na samostatném řádku mezi „Výpis z účtu …“ a „Trvalý pobyt“ / „Informace o účtu“.
 */
export function extractOwnerFromKbHeader(text: string): string | undefined {
  const m = text.match(
    /V[ýy]pis\s+z\s+[uú]čtu[^\n]*\n+([\s\S]{0,400}?)(?:Trval[ýy]\s+pobyt|Informace\s+o\s+[uú]čtu)/i,
  );
  if (!m?.[1]) return undefined;
  const lines = m[1]
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^\d{1,2}\.\s*\d{1,2}\.\s*\d{4}/.test(l))
    .filter((l) => !/komer[cč]n[ií]\s+banka|vypis1_ndb|id:\s*code/i.test(l));
  for (const line of lines) {
    // Preferuj řádek co vypadá jako jméno (2+ slova nebo VELKÁ PÍSMENA)
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 5 && /^[\p{L}\s.-]+$/u.test(line)) {
      const c = cleanOwnerCandidate(line);
      if (c) return c;
    }
  }
  for (const line of lines) {
    const c = cleanOwnerCandidate(line);
    if (c) return c;
  }
  return undefined;
}

/** Air Bank — jméno je typicky první řádek adresního bloku před „Výpis z běžného účtu“. */
export function extractOwnerFromAirBankHeader(text: string): string | undefined {
  const before = text.split(/Výpis\s+z\s+běžného\s+účtu/i)[0] ?? '';
  const lines = before
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^---PAGE\b/i.test(l));
  for (const line of lines.slice(0, 4)) {
    if (
      line.length >= 3 &&
      line.length <= 80 &&
      !/\d{2,}\/\d{4}/.test(line) &&
      !/Air Bank|AIRACZPP|http|^\d{3}\s?\d{2}\b/i.test(line) &&
      /^[\p{L}][\p{L}\s.'-]+$/u.test(line)
    ) {
      const c = cleanOwnerCandidate(line);
      if (c) return c;
    }
  }

  return (
    extractOwnerFromNazevUctu(text) ||
    extractOwnerFromMajitelUctu(text) ||
    valueAfterLabel(text, /Majitel\s*:/i) ||
    valueAfterLabel(text, /Jméno\s+klienta\s*:/i) ||
    undefined
  );
}

export function extractStatementOwnerName(
  text: string,
  bankType: string,
): string | undefined {
  switch (bankType) {
    case 'raiffeisenbank':
    case 'csob':
      return extractOwnerFromNazevUctu(text);
    case 'fio':
      return extractOwnerFromMajitelUctu(text);
    case 'kb':
      return extractOwnerFromKbHeader(text);
    case 'cs':
      return extractOwnerFromMajitelUctu(text);
    case 'airbank':
      return extractOwnerFromAirBankHeader(text);
    default:
      return undefined;
  }
}
