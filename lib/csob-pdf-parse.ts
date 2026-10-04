/**
 * ČSOB výpis z plain textu (pdf.co): každá transakce na jednom řádku DD.MM. … částka zůstatek,
 * volitelně řádek Místo: … (často až za řádkem s čísly účtu).
 */
import type { ImportBucket, ParsedImportRow } from '@/lib/bank-statement-parser';
import { bucketToStoreCategory } from '@/lib/bank-statement-parser';
import { normalizeAccount, isOwnCounterpartyAccount } from '@/utils/normalizeAccount';

/** Poslední dvě čísla na řádku: částka (včetně záporné), zůstatek. */
const LINE_END_AMOUNTS = /(-?\d{1,3}(?:\s\d{3})*,\d{2})\s+(\d{1,3}(?:\s\d{3})*,\d{2})$/;

/** Řádek začíná datem DD.MM. */
const LINE_START_DATE = /^(\d{1,2})\.(\d{1,2})\.\s*(.+)$/;

const MISTO_LINE = /^M[ií]sto:\s*(.+)$/i;
const MAX_CSOB_DESC_LEN = 40;

/** Typický jednořádkový text bez konkrétního obchodu — doplníme z Místo/Nákup/Příjemce. */
const GENERIC_DESC_MAIN =
  /^(transakce\s+platební\s+kartou|platba\s+kartou|platba\s+debetní\s+kartou)$/i;

function trimCsobDesc(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= MAX_CSOB_DESC_LEN) return t;
  return `${t.slice(0, MAX_CSOB_DESC_LEN - 1)}…`;
}

/**
 * Z hlavního řádku + následujících řádků (do dalšího data) vybere popis podle priority:
 * Místo: → Nákup: → Příjemce: → jinak původní řádek.
 */
function pickCsobMerchantLabel(descMain: string, lines: string[], startIdx: number): string {
  const max = Math.min(startIdx + 8, lines.length);
  const windowLines: string[] = [];
  for (let j = startIdx + 1; j < max; j++) {
    const L = lines[j].trim();
    if (LINE_START_DATE.test(L)) break;
    windowLines.push(L);
  }
  const block = [descMain, ...windowLines].join('\n');
  const m = block.match(/M[ií]sto:\s*([^\n(]+)/i);
  if (m?.[1]) return m[1].trim();
  const n = block.match(/Nákup:\s*([^\n(]+)/i);
  if (n?.[1]) return n[1].trim();
  const p = block.match(/Příjemce:\s*([^\n(]+)/i);
  if (p?.[1]) return p[1].trim();
  return descMain.trim();
}

/** Stejná klasifikace pro jiné bankovní PDF importy (např. Raiffeisenbank). */
export function classifyCsob(desc: string, místo?: string): ImportBucket {
  const d = desc.toLowerCase();
  const p = (místo ?? '').toLowerCase();
  const hit = (re: RegExp) => re.test(d) || re.test(p);

  // Vlastní převody mezi účty — řeší caller přes isOwnCounterpartyAccount(counterpartyAccount).
  // Žádná hardcodovaná čísla účtů.

  if (hit(/trading|xtb|anycoin|etoro|degiro|revolut|coinbase|binance|bitpanda|portu|fondee|broker|invest/i))
    return 'Investice';
  if (hit(/\bnotino\b/)) return 'Ostatní';
  if (
    hit(
      /penny|albert|lidl|kaufland|billa|tesco|globus|rohlik|rohlík|košík|kosik|makro|\bcba\b|norma|zelenina|pekárna|pekarna|potraviny|coop|jednota|hruška|hruska|\bfresh\b|grocery|spar|aldi|kraj|večerka|vecerka|ovoce|mlékárna|mlekarna|řeznictví|reznictvi/i,
    )
  )
    return 'Jídlo';
  if (
    hit(
      /mcdonald|\bmcd\b|kfc|burger\s+king|\bburger\b|pizza|pizzeria|piazza|starbucks|cafe|kavárna|kavarna|restaurace|sushi|kebab|subway|dominos|pizza\s*hut|papa\s*johns|wolt|bolt\s*food|dáme\s+jídlo|dame\s+jidlo|just\s+eat|foodora|\brud\b|bistro|\bsnack\b|bufet/i,
    )
  )
    return 'Restaurace';
  if (
    hit(
      /shell|omv|benzina|benzína|eurooil|mol|čerpac|parkování|parking|parkoviště|parkoviste|dálniční|dálnicni|toll|mytí\s+auta|myti\s+auta|pneu|autoservis|arriva|student\s+agency|flixbus|regiojet|cd\.cz|české\s+dráhy|ceske\s+drahy|idos|autobus|\bbus\b|\btrain\b|vlak|dp\s+praha|dpmo|dpmb|\bmhd\b|taxi|\bbolt\b|uber|liftago/i,
    )
  )
    return 'Auto/Benzín';
  if (
    hit(
      /nájem|elektřina|elektrina|plyn|voda|internet|pojištění|pojisteni|innogy|čez|cez|ikea|baumax|obi|hornbach|datart|alza/i,
    )
  )
    return 'Bydlení';
  if (
    hit(
      /bazén|bazen|aquapark|plavání|plavani|swim|fitness|fitko|\bgym\b|\bsport\b|squash|tenis|fotbal|hockey|hokej|running|cyklo|spinning|yoga|pilates|crossfit/i,
    )
  )
    return 'Sport';
  if (
    hit(
      /lékárna|lekarna|doktor|nemocnice|pharmacy|optika|oční|ocni|zubar|zubař|fyzio/i,
    )
  )
    return 'Zdraví';
  // Předplatné
  if (
    hit(
      new RegExp(
        'youtube|spotify|netflix|apple.*music|apple.*tv|disney|hbo|dazn|amazon.*prime|prime.*video|twitch|adobe|microsoft.*365|office.*365|dropbox|google.*one|icloud|tidal|deezer|crunchyroll|pandora|peacock|paramount|apple\\.com/bill|applepay.*apple|google\\*|apple\\*',
        'i',
      ),
    )
  ) {
    return 'Předplatné';
  }
  return 'Ostatní';
}

/** Rok z hlavičky výpisu (řádky s 20xx). */
function inferYearFromHeader(lines: string[]): number {
  const head = lines.slice(0, 40).join('\n');
  const full = lines.join('\n');
  const text = (head + full).slice(0, 8000);
  const counts = new Map<number, number>();
  for (const m of text.matchAll(/\b(20\d{2})\b/g)) {
    const y = +m[1];
    counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  let bestY = new Date().getFullYear();
  let bestC = 0;
  for (const [y, c] of counts) {
    if (c > bestC) {
      bestC = c;
      bestY = y;
    }
  }
  return bestY;
}

/**
 * Parsuje částku v českém formátu (mezery jako oddělovače tisíců, čárka jako desetinná).
 * Rozumnost částky (max. 1 M Kč) řeší hlavní smyčka — tam se loguje podezřelý řádek.
 */
function parseCsobMoney(s: string): number {
  const t = s.replace(/[−\u2212]/g, '-').replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(t);
  return isFinite(n) ? n : NaN;
}

/** Číselné ID transakce těsně před částkou (136, 139, …). */

function extractCsobCounterpartyAccount(block: string[]): string | undefined {
  for (const l of block) {
    const m = l.match(/\b(\d{1,6}-)?\d{2,10}\/\d{4}\b/);
    if (m) {
      const n = normalizeAccount(m[0]);
      if (n) return n;
    }
  }
  return undefined;
}

function stripTrailingTxnId(before: string): string {
  return before.replace(/\s+\d{1,6}$/, '').trim();
}

/**
 * Částka v PDF může začínat číselným ID transakce (≤999, bez čárky) slepeným s částkou:
 * "130 219,00" → skutečná částka "219,00". Tisícové formáty zůstanou: "2 450,00", "100 000,00".
 * Rozlišíme podle toho, že ID+částka je přesně "NNN mezera jednoduché číslo,DD" a druhá část
 * nezačíná "000," (to je "100 000,00").
 */
function normalizeCsobMatchedAmount(amountStr: string): string {
  const trimmed = amountStr.trim();
  const neg = trimmed.startsWith('-');
  const u = neg ? trimmed.slice(1) : trimmed;

  const txnPlusSimple = u.match(/^(\d{3})\s+(\d{1,3},\d{2})$/);
  if (txnPlusSimple) {
    const after = txnPlusSimple[2]!;
    if (!after.startsWith('000,')) {
      return neg ? `-${after}` : after;
    }
  }

  if (!/\s/.test(trimmed)) return trimmed;

  const commaIdx = u.indexOf(',');
  if (commaIdx < 0) return trimmed;

  const beforeComma = u.slice(0, commaIdx);
  const parts = beforeComma.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return trimmed;

  if (parts.length === 2 && parts[0]!.length <= 2 && parts[1]!.length === 3) return trimmed;
  if (parts.length === 2 && parts[1] === '000' && parts[0]!.length <= 3) return trimmed;
  if (parts.length >= 3) return trimmed;

  return trimmed;
}

/**
 * Split PDF.co / plain extracted text into logical lines.
 * Spojí osamocené „-“ s následující částkou (pdfjs u RB často dělí „-“ / „132.10 CZK“).
 */
export function csobPlainTextToLines(text: string): string[] {
  const raw = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const joined: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '-' && i + 1 < raw.length && /^\d/.test(raw[i + 1]!)) {
      joined.push('-' + raw[i + 1]!);
      i++;
    } else {
      joined.push(raw[i]!);
    }
  }
  return joined;
}

/**
 * Parsuje jednořádkové ČSOB transakce + řádky Místo: pod hlavním řádkem.
 */
export function parseCsobLinesToImportRows(lines: string[], ownerAccounts: string[] = []): ParsedImportRow[] {
  let datePatternCount = 0;
  let amountPatternCount = 0;
  for (const raw of lines) {
    const line = raw.trim();
    const dm = line.match(LINE_START_DATE);
    if (dm) {
      datePatternCount++;
      const rest = dm[3].trim();
      if (LINE_END_AMOUNTS.test(rest)) amountPatternCount++;
    }
  }
  console.log(
    '[csob-pdf-parse] lines matching date pattern:',
    datePatternCount,
    '| lines matching amount pattern (rest after date):',
    amountPatternCount,
  );

  const year = inferYearFromHeader(lines);
  const rows: ParsedImportRow[] = [];
  const seen = new Set<string>();

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const dm = line.match(LINE_START_DATE);
    if (!dm) {
      i++;
      continue;
    }

    const rest = dm[3].trim();
    const endMatch = rest.match(LINE_END_AMOUNTS);
    if (!endMatch) {
      i++;
      continue;
    }

    const day = +dm[1];
    const month = +dm[2];
    const beforeAmount = rest.slice(0, rest.length - endMatch[0].length).trim();
    let descMain = stripTrailingTxnId(beforeAmount)
      .replace(/\s*okamžitá\s+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    let místoText: string | undefined;
    let nextIdx = i + 1;
    for (let j = i + 1; j <= i + 5 && j < lines.length; j++) {
      const L = lines[j].trim();
      console.log('[csob] checking line', j, 'for Místo:', JSON.stringify(L));
      const mis = L.match(MISTO_LINE);
      if (mis) {
        místoText = mis[1].trim();
        nextIdx = j + 1;
        break;
      }
      if (LINE_START_DATE.test(L)) break;
    }

    let label = pickCsobMerchantLabel(descMain, lines, i);
    if (GENERIC_DESC_MAIN.test(descMain.trim())) {
      const fromBelow = pickCsobMerchantLabel('', lines, i);
      if (fromBelow && !GENERIC_DESC_MAIN.test(fromBelow)) {
        label = fromBelow;
      }
    }

    let desc = trimCsobDesc(label);
    if (!desc) desc = 'Bez popisu';

    const amountNormalized = normalizeCsobMatchedAmount(endMatch[1]);
    const rawAmount = parseCsobMoney(amountNormalized);
    if (!isFinite(rawAmount)) {
      i = nextIdx;
      continue;
    }

    const type: 'income' | 'expense' = rawAmount >= 0 ? 'income' : 'expense';
    const amount = Math.abs(rawAmount);

    if (amount > 1_000_000) {
      if (__DEV__) {
        console.warn('[csob-pdf-parse] Skipping suspicious amount:', amount, 'from line:', line);
      }
      i = nextIdx;
      continue;
    }

    const sliceLines = lines.slice(i, nextIdx);
    const counterpartyAccount = extractCsobCounterpartyAccount(sliceLines);
    const isSelfTransfer = isOwnCounterpartyAccount(counterpartyAccount, ownerAccounts);
    // Vlastní příchozí převody NEskipovat — jinak chybí kreditní položky výpisu

    const bucket = isSelfTransfer ? 'Převod' : classifyCsob(label || descMain, místoText);
    const category = bucketToStoreCategory(bucket, type);

    const check = new Date(year, month - 1, day);
    if (check.getMonth() !== month - 1) {
      i = nextIdx;
      continue;
    }

    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const key = `${day}|${month}|${rawAmount}|${desc.slice(0, 96)}`;
    if (seen.has(key)) {
      i = nextIdx;
      continue;
    }
    seen.add(key);

    rows.push({
      date,
      rawAmount,
      description: isSelfTransfer ? 'Převod mezi účty' : desc || 'Bez popisu',
      type,
      amount,
      bucket,
      category,
      ...(counterpartyAccount ? { counterpartyAccount } : {}),
    });

    i = nextIdx;
  }

  const transactions = rows.filter((t) => t.amount > 0);
  return transactions;
}

/** Nový formát: datum zcela na vlastním řádku „13.03.“ (konec tečkou, bez mezery za ním). */
const NEW_CSOB_LINE_HINT = /^\d{1,2}\.\d{2}\.$/;

/**
 * Nový formát ČSOB (pdfjs): datum „DD.MM.“ na samostatném řádku, částka a zůstatek na vlastních řádcích.
 */
export function parseCsobNewFormatLines(lines: string[], _ownerName?: string, ownerAccounts: string[] = []): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
  const seen = new Set<string>();
  const year = inferYearFromHeader(lines);

  const txStarts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (NEW_CSOB_LINE_HINT.test(lines[i]!.trim())) {
      txStarts.push(i);
    }
  }

  for (let s = 0; s < txStarts.length; s++) {
    const start = txStarts[s]!;
    const end = txStarts[s + 1] ?? lines.length;
    const block = lines.slice(start, end).map((l) => l.trim()).filter((l) => l.length > 0);

    const dateMatch = block[0]?.match(/^(\d{1,2})\.(\d{2})\.$/);
    if (!dateMatch) continue;
    const day = +dateMatch[1]!;
    const month = +dateMatch[2]!;

    const amountLines: number[] = [];
    for (let j = 1; j < block.length; j++) {
      const l = block[j]!.trim();
      const m = l.match(/^(-?\d{1,3}(?:\s\d{3})*,\d{2})$/);
      if (m) {
        const v = parseCsobMoney(m[1]!);
        if (isFinite(v)) amountLines.push(v);
      }
    }
    if (amountLines.length === 0) continue;
    const rawAmount =
      amountLines.length >= 2 ? amountLines[amountLines.length - 2]! : amountLines[0]!;
    if (!isFinite(rawAmount) || Math.abs(rawAmount) < 0.01) continue;
    if (Math.abs(rawAmount) > 1_000_000) continue;

    let merchant = '';
    for (const l of block) {
      const mm = l.match(/^M[íi]sto:\s*(.+)/i);
      if (mm) {
        merchant = mm[1]!.trim();
        break;
      }
    }

    const txLabel = block[1] || 'Bez popisu';
    const forClass = merchant || cleanMerchantLabel(txLabel) || 'Bez popisu';
    const description = trimCsobDesc(forClass) || 'Bez popisu';

    const counterpartyAccount = extractCsobCounterpartyAccount(block);
    const isSelfTransfer = isOwnCounterpartyAccount(counterpartyAccount, ownerAccounts);
    // Vlastní příchozí převody NEskipovat — jinak chybí kreditní položky

    const type: 'income' | 'expense' = rawAmount >= 0 ? 'income' : 'expense';
    const amount = Math.abs(rawAmount);
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const check = new Date(year, month - 1, day);
    if (check.getMonth() !== month - 1) continue;

    const bucket: ImportBucket = isSelfTransfer
      ? 'Převod'
      : classifyCsob(forClass, merchant || undefined);
    const category = bucketToStoreCategory(bucket, type);

    const key = `${day}|${month}|${year}|${rawAmount}|${description.slice(0, 96)}|${s}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      date,
      rawAmount,
      description: isSelfTransfer ? 'Převod mezi účty' : description || 'Bez popisu',
      type,
      amount,
      bucket,
      category,
      ...(counterpartyAccount ? { counterpartyAccount } : {}),
    });
  }

  return rows.filter((t) => t.amount >= 0.01);
}

function cleanMerchantLabel(txLabel: string): string {
  return txLabel
    .replace(/\s*okamžitá\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseCsobPdfPlainText(text: string, ownerAccounts: string[] = []): ParsedImportRow[] {
  const lines = csobPlainTextToLines(text);
  if (lines.some((l) => NEW_CSOB_LINE_HINT.test(l.trim()))) {
    return parseCsobNewFormatLines(lines, undefined, ownerAccounts);
  }
  return parseCsobLinesToImportRows(lines, ownerAccounts);
}
