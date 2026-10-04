/**
 * Detekce banky z PDF před voláním Edge (název souboru + náhled bajtů).
 * Bez RN/parser závislostí — použitelné i v bun selftestech.
 */
import { PDF_IMPORT_SOURCES, type PdfImportSource } from './bank-import-source';

export type PdfBankType = PdfImportSource;
/** Klient: známá banka, nebo `auto` když Edge má rozhodnout z pdfjs textu. */
export type ClientPdfBankType = PdfBankType | 'auto';

/** Náhled těla PDF (binárka) pro BIC / známé podřetězce. */
const PDF_SNIFF_MAX_BYTES = 500_000;

function normalizePdfBase64(base64: string): string {
  return base64.replace(/^data:application\/pdf;base64,/i, '').trim();
}

/**
 * George ČS: `Account_statement_0-6344660093_from_20260930.pdf`
 * Číslo po pomlčce bereme jen jako nápovědu (účet), ne jako důkaz banky.
 */
const GEORGE_CS_EN_RE = /^account_statement_(\d+)-(\d+)_from_(\d{8})\.pdf$/i;
/** Česká varianta George exportu (underscore po `uctu_`, ne Fio `Vypis_z_uctu-…`). */
const GEORGE_CS_CS_RE = /^vypis_z_uctu_(\d+)-(\d+)_from_(\d{8})\.pdf$/i;

function isKbSniff(sample: string): boolean {
  if (sample.includes('VYPIS1_NDB')) return true;
  if (sample.includes('Komer') && sample.includes('Příkopě 33')) return true;
  if (/Komerční\s+banka/i.test(sample) && /\/0100\b/.test(sample)) return true;
  return false;
}

function isFioSniff(sample: string): boolean {
  return (
    sample.includes('FIOBCZPPXXX') ||
    (/Fio banka,\s*a\.s\./i.test(sample) && sample.includes('61858374'))
  );
}

function isAirBankSniff(sample: string): boolean {
  return (
    sample.includes('Air Bank') ||
    sample.includes('AIRACZPP') ||
    (sample.includes('3030') && sample.includes('Výpis z'))
  );
}

function isMonetaSniff(sample: string): boolean {
  if (/MONETA\s+Money\s+Bank/i.test(sample)) return true;
  if (sample.includes('AGBACZPP')) return true;
  if (/www\.moneta\.cz/i.test(sample)) return true;
  if (
    /\/\s*0600\b/.test(sample) &&
    (/Výpis\s+z\s+běžného\s+účtu/i.test(sample) || /Statement\s+of\s+current\s+account/i.test(sample))
  ) {
    return true;
  }
  return false;
}

/** Stejné markery jako `isCsPdfText` (lib + Edge). */
export function isCsPdfSniff(sampleIn: string): boolean {
  const sample = sampleIn.slice(0, 25_000);
  if (/GIBACZP[PX]/i.test(sample)) return true;
  if (/Česká\s+spořitelna/i.test(sample) && /\/0800\b/.test(sample)) return true;
  if (/Ceska\s+sporitelna/i.test(sample) && /\/0800\b/.test(sample)) return true;
  if (/Standard\s+účet\s+České\s+spořitelny/i.test(sample)) return true;
  if (/Číslo\s+účtu\/kód\s+banky:/i.test(sample) && /\/0800\b/.test(sample)) return true;
  if (
    /Standard\s+účet/i.test(sample) &&
    /\/0800\b/.test(sample) &&
    /Zaúčtováno|Provedeno|PŘEHLED\s+POHYBŮ/i.test(sample)
  ) {
    return true;
  }
  return false;
}

/** Účet z George názvu — jen nápověda pro log / budoucí matching. */
export function extractAccountHintFromPdfFileName(fileName: string | undefined): string | null {
  if (!fileName?.trim()) return null;
  const base = fileName.trim().split(/[/\\]/).pop() ?? fileName.trim();
  const m = base.match(GEORGE_CS_EN_RE) ?? base.match(GEORGE_CS_CS_RE);
  if (!m) return null;
  const account = m[2]?.replace(/\D/g, '');
  return account && account.length >= 4 ? account : null;
}

/** Z názvu souboru (i s diakritikou sjednocenou). */
export function detectBankTypeFromFileName(fileName: string | undefined): PdfBankType | null {
  if (!fileName?.trim()) return null;
  const base = fileName.trim().split(/[/\\]/).pop() ?? fileName.trim();
  const n0 = base.toLowerCase();
  const n = n0.normalize('NFD').replace(/\p{M}/gu, '');

  if (
    /\bvypis1_ndb\b/i.test(n) ||
    /\bkomer[cč]ni\b/i.test(n) ||
    /\bkomercni\b/i.test(n) ||
    (/\bkb\b/.test(n) && /\.pdf$/i.test(n))
  ) {
    return 'kb';
  }

  if (/fio/i.test(n) || /fiobczppxxx/i.test(n)) {
    return 'fio';
  }

  // George / ČS export — před obecnými „ceska“ vzory (které historicky míří na ČSOB)
  if (GEORGE_CS_EN_RE.test(base) || GEORGE_CS_CS_RE.test(base)) {
    const hint = extractAccountHintFromPdfFileName(base);
    if (hint) {
      console.log('[detectBankType] CS account hint from filename:', hint);
    }
    return 'cs';
  }

  if (
    /\bgibaczp[px]\b/i.test(n) ||
    /\bceska[\s_-]*sporitelna\b/i.test(n) ||
    /\bcsas\b/i.test(n) ||
    /(?:^|[_\-])cs(?:[_\-]|\.pdf$)/i.test(n) ||
    /\/0800\b/.test(n) ||
    /\bstandard[\s_-]*ucet[\s_-]*ceske[\s_-]*sporitelny\b/i.test(n)
  ) {
    return 'cs';
  }

  // ČSOB výpisy mají formát: čísloúčtu_datum_číslo_MCZB.pdf
  if (/MCZB/i.test(n) || /CEKOCZPP/i.test(n)) {
    return 'csob';
  }
  if (/^363\d+_/.test(base)) {
    return 'csob';
  }

  if (
    /\bMCZB\b|CEKOCZPP|_csob|\bcsob\b|ceko|cekocz|csob-|\bcs-ob|cesko[\s-]*spor|cesko[\s-]*slov|ceskoslovenska|ceska[\s-]*s/i.test(
      n,
    ) ||
    n0.includes('csob')
  ) {
    return 'csob';
  }
  if (
    /\braiffeisenbank\b|\braiffeisen\b|\braif_|_rzb\b|rzbcczpp|vypisrzb|bezny-ucet|statement.*rzb/i.test(
      n,
    )
  ) {
    return 'raiffeisenbank';
  }

  if (/\bair\s*bank\b/i.test(n) || /airaczpp/i.test(n) || /\/3030\b/.test(n)) {
    return 'airbank';
  }

  if (/\bmoneta\b/i.test(n) || /agbaczpp/i.test(n) || /\/0600\b/.test(n)) {
    return 'moneta';
  }

  return null;
}

/** První stovky tisíc bajtů PDF jako string — hledání BIC a klíčových slov. */
export function detectBankTypeFromPdfBytes(pdfBase64: string): PdfBankType | null {
  const normalized = normalizePdfBase64(pdfBase64);
  const b64CharsNeeded = Math.ceil((PDF_SNIFF_MAX_BYTES * 4) / 3) + 8;
  const b64Head = normalized.slice(0, b64CharsNeeded);
  let binary: string;
  try {
    binary = atob(b64Head);
  } catch (e) {
    console.error('[import] detectBankTypeFromPdfBytes atob failed', e);
    return null;
  }
  const head = binary.slice(0, Math.min(binary.length, PDF_SNIFF_MAX_BYTES));

  if (isKbSniff(head)) return 'kb';
  if (isFioSniff(head)) return 'fio';

  if (head.includes('CEKOCZPP') || head.includes('Cekoczpp') || head.includes('ČSOB')) {
    return 'csob';
  }
  if (head.includes('CSOB') && head.includes('CEK')) {
    return 'csob';
  }

  if (
    head.includes('RZBCCZPP') ||
    /Raiffeisenbank/i.test(head) ||
    (head.includes('Výpis z běžného') && /Raiffeisenbank/i.test(head))
  ) {
    return 'raiffeisenbank';
  }

  if (isAirBankSniff(head)) return 'airbank';
  if (isMonetaSniff(head)) return 'moneta';

  if (isCsPdfSniff(head)) return 'cs';

  return null;
}

/**
 * Routování podle extrahovaného textu (pdfjs na Edge) — přepíše chybný / `auto` bankType z klienta.
 */
export function detectBankTypeFromExtractedText(text: string): PdfBankType | null {
  const sample = text.slice(0, 20_000);

  if (isKbSniff(sample)) return 'kb';
  if (isFioSniff(sample)) return 'fio';

  if (sample.includes('RZBCCZPP') || /Raiffeisenbank\s+a\.?\s*s\.?/i.test(sample)) {
    return 'raiffeisenbank';
  }

  if (sample.includes('CEKOCZPP')) return 'csob';
  if (/Československá obchodní banka/i.test(sample)) return 'csob';
  if (/(?:^|[\s,;(])ČSOB(?:[\s,;.]|$)/i.test(sample)) return 'csob';

  if (isAirBankSniff(sample)) return 'airbank';
  if (isMonetaSniff(sample)) return 'moneta';
  if (isCsPdfSniff(sample)) return 'cs';

  return null;
}

/**
 * Klientská detekce. Neznámá banka → `'auto'` (Edge rozhodne z pdfjs textu).
 * Chybu „Nepodařilo se rozpoznat banku“ háže až Edge, když nepozná ani tam.
 */
export function detectBankType(pdfBase64: string, fileName: string | undefined): ClientPdfBankType {
  const fromBytes = detectBankTypeFromPdfBytes(pdfBase64);
  const fromFileName = detectBankTypeFromFileName(fileName);
  const result = fromBytes ?? fromFileName;
  console.log(
    '[detectBankType] fileName:',
    fileName,
    '| fromFileName:',
    fromFileName,
    '| fromBytes:',
    fromBytes,
    '| result:',
    result ?? 'auto',
  );
  return result ?? 'auto';
}

export function detectPdfBankTypeForImport(
  pdfBase64: string,
  fileName: string | undefined,
): ClientPdfBankType {
  return detectBankType(pdfBase64, fileName);
}

export { PDF_IMPORT_SOURCES };
