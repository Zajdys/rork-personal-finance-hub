/**
 * ČSOB — Edge Function parser (samostatný Deno-free modul).
 * Shared helpers (classifyCsob, cleanMerchantName, …) are also used by Raiffeisenbank.
 */

export type ImportBucket =
  | "Jídlo"
  | "Auto/Benzín"
  | "Restaurace"
  | "Bydlení"
  | "Sport"
  | "Zdraví"
  | "Investice"
  | "Předplatné"
  | "Převod"
  | "Ostatní";

const BUCKET_TO_EXPENSE_CATEGORY: Record<ImportBucket, string> = {
  Jídlo: "Jídlo a nápoje",
  "Auto/Benzín": "Doprava",
  Restaurace: "Jídlo a nápoje",
  Bydlení: "Bydlení",
  Sport: "Sport a zdraví",
  Zdraví: "Zdraví",
  Investice: "Investice",
  Předplatné: "Předplatné",
  Převod: "Převod",
  Ostatní: "Ostatní",
};
const DEFAULT_INCOME_CATEGORY = "Ostatní";

export function bucketToStoreCategory(bucket: ImportBucket, type: "income" | "expense"): string {
  if (bucket === "Převod") return "Převod";
  if (bucket === "Předplatné") return "Předplatné";
  if (type === "income") return DEFAULT_INCOME_CATEGORY;
  return BUCKET_TO_EXPENSE_CATEGORY[bucket];
}

export interface ParsedImportRow {
  /** YYYY-MM-DD — datum zaúčtování */
  date: string;
  /** YYYY-MM-DD — datum valuty → DB `booking_date` */
  bookingDate?: string | null;
  rawAmount: number;
  description: string;
  type: "income" | "expense";
  amount: number;
  bucket: ImportBucket;
  category: string;
  /** Bankovní ID pohybu (např. RB „Kód transakce“) */
  bankTransactionId?: string;
  /** Číslo protiúčtu (návrh vlastních účtů) */
  counterpartyAccount?: string;
  /** Jméno na protiúčtu */
  counterpartyName?: string;
  /** Kartová vratka (RB) — type income, ale nepočítá se do příjmů */
  isRefund?: boolean;
}

/** Alias for selftests / callers that prefer a bank-prefixed name. */
export type CsobParsedImportRow = ParsedImportRow;

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
  console.log('[CLASSIFY]', JSON.stringify({ desc: desc.slice(0, 80), místo: místo?.slice(0, 40) }));

  // Vlastní převody mezi účty — řeší caller přes isOwnCounterpartyAccount(counterpartyAccount).
  // Žádná hardcodovaná čísla / „jakýkoli účet“ heuristika.

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
      /shell|omv|benzina|benzína|eurooil|mol|čerpac|parkování|parking|parkoviště|parkoviste|dálniční|dálnicni|toll|mytí\s+auta|myti\s+auta|pneu|autoservis|arriva|student\s+agency|flixbus|flix\s*bus|regiojet|\bcd\b|cd\.cz|www\.cd\.cz|české\s+dráhy|ceske\s+drahy|idos|autobus|\bautobusy\b|\bbus\b|\btrain\b|vlak|dp\s+praha|\bdpp\b|\bdpb\b|dpmo|dpmb|\bpmdp\b|\bmhd\b|taxi|\bbolt\b|uber|liftago/i,
    )
  )
    return 'Auto/Benzín';
  if (
    hit(
      /nájem|elektřina|elektrina|plyn|voda|\binternet\b|pojištění|pojisteni|innogy|čez|cez|ikea|baumax|obi|hornbach|datart|alza/i,
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
  // Předplatné (regex v řetězci — v literálu by končící `apple\*/` ukončil vzorec)
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
  console.log('[CLASSIFY-MISS]', JSON.stringify({ desc: desc.slice(0, 60), místo }));
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

import { normalizeAccount, isOwnCounterpartyAccount } from "./normalize-account.ts";

/** Vlastní převod: v textu bloku je číslo účtu shodné s některým z účtů uživatele. */
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

/** Číselné ID transakce těsně před částkou (136, 139, …). */
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
 */
export function csobPlainTextToLines(text: string): string[] {
  const raw = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // Spoj "-" s následující částkou: ["-", "132.10 CZK"] → ["-132.10 CZK"]
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

/** Odstraní technické řetězce a zprávu za jménem protiúčtu (Platba, /ROC/, vyp, …). */
export function cleanCounterpartyName(raw: string): string {
  return raw
    .replace(/\s*\/ROC\/[^\s]+/gi, '')
    .replace(/\s*\/\/\/URI\/.*/gi, '')
    .replace(/\s+(Platba|Příchozí|Odchozí|Jednorázová|VS:|KS:).*/i, '')
    .replace(/\bvyp\b/gi, '')
    .trim();
}

/**
 * Čištění názvu obchodníka (po řezu na část před „;“ z Raiffeisen řádku).
 * @param fullLineForHints celý řádek merchantu (např. pro „Trading“ → „Trading 212“ když je 212 jinde v řádku)
 */
export function cleanMerchantName(raw: string, fullLineForHints?: string): string {
  const hint = (fullLineForHints ?? raw).toLowerCase();

  // Odstraň hvězdičky a čísla karet
  let name = raw.replace(/\*+\d*/g, '').replace(/\*+/g, '').trim();

  // Odstraň .cz, .com/bill atd.
  name = name.replace(/\.com\/\w+/gi, '').replace(/\.cz$/gi, '').trim();

  const BRAND_MAP: Record<string, string> = {
    'kaufland': 'Kaufland',
    'penny': 'Penny',
    'tesco': 'Tesco',
    'albert': 'Albert',
    'lidl': 'Lidl',
    'billa': 'Billa',
    'ikea': 'IKEA',
    'datart': 'Datart',
    'vodafone': 'Vodafone',
    'mcdonald': "McDonald's",
    'sent from revolut': 'Revolut',
    'revolut': 'Revolut',
    'foodora': 'Foodora',
    'gymbeam': 'GymBeam',
    'apple': 'Apple',
    'c & a': 'C&A',
    'trading 212': 'Trading 212',
    'arriva': 'Arriva',
    'autobusy': 'Autobusy',
    'www.cd': 'České dráhy',
    'cd.cz': 'České dráhy',
    'pmdp': 'PMDP',
    'regiojet': 'RegioJet',
    'flixbus': 'FlixBus',
    'coop': 'Coop',
    'aktin': 'Aktin',
    'ceska posta': 'Česká pošta',
    'max fitness': 'Max Fitness',
    'bazen': 'Bazén Slovany',
    'galerie slovany': 'Galerie Slovany',
    'running sushi': 'Running Sushi Sumo',
    'payu': 'PayU',
    'tipsport': 'Tipsport',
    'google *youtube': 'YouTube Premium',
    'youtube premium': 'YouTube Premium',
    'youtubepremium': 'YouTube Premium',
  };

  const brandEntries = Object.entries(BRAND_MAP).sort((a, b) => b[0].length - a[0].length);
  let lower = name.toLowerCase();
  for (const [key, cleanName] of brandEntries) {
    if (lower.includes(key)) return cleanName;
  }

  // „Trading“ → „Trading 212“, pokud je v celém řádku merchantu
  if (hint.includes('trading 212') && /^\s*trading\s*$/i.test(name.trim())) {
    return 'Trading 212';
  }

  // Odstraň číslo pobočky na konci (3–5 číslic)
  name = name.replace(/\s+\d{3,5}$/, '').trim();

  // Odstraň typické „Cz“ za řetězcem (např. Kaufland Cz)
  name = name.replace(/\s+cz$/i, '').trim();

  // Title case
  return name
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Čistá částka na vlastním řádku (české formátování). */
const CSOB_MONEY_LINE = /^(-?\d{1,3}(?:\s\d{3})*,\d{2})$/;

export type CsobStatementMeta = {
  openingBalance: number | null;
  closingBalance: number | null;
  expectedCredits: number | null;
  expectedDebits: number | null;
  expectedTotal: number | null;
};

/** Hlavička výpisu: zůstatky + počty kredit/debet. */
export function extractCsobStatementMeta(lines: string[]): CsobStatementMeta {
  const text = lines.join('\n');
  const moneyAfter = (label: RegExp): number | null => {
    const m = text.match(label);
    if (!m?.[1]) return null;
    const n = parseCsobMoney(m[1]);
    return isFinite(n) ? n : null;
  };
  const openingBalance = moneyAfter(/Počáteční zůstatek:\s*(-?[\d\s]+,\d{2})/i);
  const closingBalance = moneyAfter(/Konečný zůstatek:\s*(-?[\d\s]+,\d{2})/i);
  const credM = text.match(/Počet kreditních položek:\s*(\d+)/i);
  const debM = text.match(/Počet debetních položek:\s*(\d+)/i);
  const expectedCredits = credM ? Number(credM[1]) : null;
  const expectedDebits = debM ? Number(debM[1]) : null;
  const expectedTotal =
    expectedCredits != null && expectedDebits != null
      ? expectedCredits + expectedDebits
      : null;
  return { openingBalance, closingBalance, expectedCredits, expectedDebits, expectedTotal };
}

export type CsobParseValidation = {
  ok: boolean;
  parsed: number;
  expected: number;
  balanceOk: boolean;
  countOk: boolean;
  netDelta: number;
  balanceDelta: number | null;
};

/** Ověření: počet = kredit+debet a příjmy−výdaje = konečný−počáteční zůstatek. */
export function validateCsobParse(
  rows: ParsedImportRow[],
  meta: CsobStatementMeta,
): CsobParseValidation {
  const parsed = rows.length;
  const expected = meta.expectedTotal ?? parsed;
  const income = rows
    .filter((r) => r.type === 'income')
    .reduce((s, r) => s + r.amount, 0);
  const expense = rows
    .filter((r) => r.type === 'expense')
    .reduce((s, r) => s + r.amount, 0);
  const netDelta = income - expense;
  const balanceDelta =
    meta.openingBalance != null && meta.closingBalance != null
      ? meta.closingBalance - meta.openingBalance
      : null;
  const balanceOk =
    balanceDelta == null ? true : Math.abs(netDelta - balanceDelta) < 0.025;
  const countOk = meta.expectedTotal == null || parsed === meta.expectedTotal;
  return {
    ok: countOk && balanceOk,
    parsed,
    expected,
    balanceOk,
    countOk,
    netDelta,
    balanceDelta,
  };
}

function extractCsobTxnId(block: string[]): string | undefined {
  for (let j = 2; j < Math.min(block.length, 8); j++) {
    const l = block[j]!.trim();
    if (CSOB_MONEY_LINE.test(l)) break;
    if (/^\d{1,6}$/.test(l)) return l;
  }
  return undefined;
}

function extractCsobMisto(block: string[]): string {
  for (const l of block) {
    const mm = l.match(/^M[íi]sto:\s*(.+)/i);
    if (mm?.[1]) return mm[1].trim();
  }
  return '';
}

/** Jméno protiúčtu na řádku mezi typem platby a VS/částkou. */
function extractCsobCounterpartyName(block: string[]): string | undefined {
  for (let j = 2; j < Math.min(block.length, 8); j++) {
    const l = block[j]!.trim();
    if (CSOB_MONEY_LINE.test(l)) break;
    if (/^\d{1,6}$/.test(l)) continue;
    if (/\d{2,10}\/\d{4}/.test(l)) continue;
    if (/^M[íi]sto:/i.test(l) || /^Částka:/i.test(l)) continue;
    if (/^(VS|KS|SS|Identifikace)\b/i.test(l)) continue;
    if (/^\d{7,}$/.test(l)) continue;
    if (/^(Odměna za platby|Úrok:|Jistina:)/i.test(l)) continue;
    if (
      /úhrada|transakce|převod|zúčtování|změna úrokové|platební kartou/i.test(l)
    ) {
      continue;
    }
    if (/^[\p{L}][\p{L}\d\s.\-'*&]{1,60}$/u.test(l)) {
      return l.trim();
    }
  }
  return undefined;
}

function isCsobCardPaymentReward(block: string[], txLabel: string): boolean {
  const blob = block.join('\n');
  return (
    /Nezpoplatněný\s+převod/i.test(txLabel) &&
    /Odměna za platby kartou/i.test(blob)
  );
}

function isCsobCardIncomingRefund(txLabel: string): boolean {
  return /Příchozí\s+úhrada\s+kartou/i.test(txLabel);
}

function isCsobNegativeInterest(txLabel: string): boolean {
  return /Zúčtování\s+záporných\s+úroků|^Úrok\b|záporn\w*\s+úrok/i.test(txLabel);
}

function isCsobNonFinancialBlock(txLabel: string): boolean {
  return /Změna\s+úrokové\s+sazby/i.test(txLabel);
}

/**
 * Nový formát ČSOB: datum na samostatném řádku „13.03.“, další řádky = popis / VS / Místo, částka na vlastním řádku.
 * Nesdílí logiku s parseCsobLinesToImportRows ani s Raiffeisen.
 *
 * Důležité: vlastní příchozí převody (ownerAccounts) se NESKÁČOU — kategorie Převod,
 * jinak chybí kreditní položky a nesedí zůstatek výpisu.
 */
export function parseCsobNewFormatLines(
  _lines: string[],
  _ownerName?: string,
  ownerAccounts: string[] = [],
): ParsedImportRow[] {
  void _ownerName;
  const rows: ParsedImportRow[] = [];
  const seen = new Set<string>();
  const year = inferYearFromHeader(_lines);

  const txStarts: number[] = [];
  for (let i = 0; i < _lines.length; i++) {
    if (/^\d{1,2}\.\d{2}\.$/.test(_lines[i]!.trim())) {
      txStarts.push(i);
    }
  }

  for (let s = 0; s < txStarts.length; s++) {
    const start = txStarts[s]!;
    const end = txStarts[s + 1] ?? _lines.length;
    const block = _lines.slice(start, end).map((l) => l.trim()).filter((l) => l.length > 0);

    const dateMatch = block[0]?.match(/^(\d{1,2})\.(\d{2})\.$/);
    if (!dateMatch) continue;
    const day = +dateMatch[1]!;
    const month = +dateMatch[2]!;

    const txLabel = block[1] || 'Bez popisu';
    if (isCsobNonFinancialBlock(txLabel)) continue;

    // Předposlední čistá částka = pohyb, poslední = zůstatek
    const amountLines: number[] = [];
    for (let j = 1; j < block.length; j++) {
      const m = block[j]!.trim().match(CSOB_MONEY_LINE);
      if (m) {
        const v = parseCsobMoney(m[1]!);
        if (isFinite(v)) amountLines.push(v);
      }
    }
    if (amountLines.length === 0) continue;
    const rawAmount =
      amountLines.length >= 2 ? amountLines[amountLines.length - 2]! : amountLines[0]!;
    if (!isFinite(rawAmount) || Math.abs(rawAmount) < 0.005) continue;
    if (Math.abs(rawAmount) > 1_000_000) continue;

    const merchant = extractCsobMisto(block);
    const counterpartyName = extractCsobCounterpartyName(block);
    const counterpartyAccount = extractCsobCounterpartyAccount(block);
    const bankTransactionId = extractCsobTxnId(block);
    const isSelfTransfer = isOwnCounterpartyAccount(counterpartyAccount, ownerAccounts);
    const isReward = isCsobCardPaymentReward(block, txLabel);
    const isRefund = isCsobCardIncomingRefund(txLabel);
    const isNegInterest = isCsobNegativeInterest(txLabel);

    const type: 'income' | 'expense' = rawAmount >= 0 ? 'income' : 'expense';
    const amount = Math.abs(rawAmount);
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const check = new Date(year, month - 1, day);
    if (check.getMonth() !== month - 1) continue;

    let description: string;
    let bucket: ImportBucket;
    let category: string;

    if (isReward) {
      description = 'Odměna za platby kartou';
      bucket = 'Ostatní';
      category = 'Ostatní';
    } else if (isNegInterest) {
      description = 'Záporný úrok';
      bucket = 'Ostatní';
      category = 'Bankovní poplatky';
    } else if (isRefund) {
      description = trimCsobDesc(merchant || counterpartyName || 'Vratka kartou') || 'Vratka kartou';
      bucket = classifyCsob(description, merchant || undefined);
      category = bucketToStoreCategory(bucket, 'expense');
    } else if (isSelfTransfer) {
      description = 'Převod mezi účty';
      bucket = 'Převod';
      category = 'Převod';
    } else {
      const forClass =
        merchant ||
        counterpartyName ||
        cleanMerchantName(txLabel, block[1]) ||
        'Bez popisu';
      description = trimCsobDesc(forClass) || 'Bez popisu';
      bucket = classifyCsob(forClass, merchant || undefined);
      category = bucketToStoreCategory(bucket, type);
    }

    const key = `${day}|${month}|${year}|${rawAmount}|${description.slice(0, 96)}|${s}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      date,
      rawAmount,
      description,
      type,
      amount,
      bucket,
      category,
      ...(bankTransactionId ? { bankTransactionId } : {}),
      ...(counterpartyAccount ? { counterpartyAccount } : {}),
      ...(counterpartyName && !isSelfTransfer && !isReward
        ? { counterpartyName }
        : {}),
      ...(isRefund ? { isRefund: true } : {}),
    });
  }

  return rows.filter((t) => t.amount >= 0.01 || t.amount === 0.01);
}

/** Alias for production new-format / multi-column pdfjs parser. */
export const parseCsobNewFormat = parseCsobNewFormatLines;

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
      const rest = dm[3]!.trim();
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
    if (/Změna\s+úrokové\s+sazby/i.test(rest)) {
      i++;
      continue;
    }

    // Struktura: popis [jméno] [VS] částka zůstatek — VS je 1–6 číslic bez čárky
    const tail = rest.match(
      /^(.*?)\s+(\d{1,6})\s+(-?\d{1,3}(?:\s\d{3})*,\d{2})\s+(\d{1,3}(?:\s\d{3})*,\d{2})$/,
    );
    const tailNoId = !tail
      ? rest.match(/^(.*?)\s+(-?\d{1,3}(?:\s\d{3})*,\d{2})\s+(\d{1,3}(?:\s\d{3})*,\d{2})$/)
      : null;
    if (!tail && !tailNoId) {
      i++;
      continue;
    }

    const before = (tail ? tail[1]! : tailNoId![1]!).trim();
    const amountStr = tail ? tail[3]! : tailNoId![2]!;

    const day = +dm[1];
    const month = +dm[2];

    let descMain = stripTrailingTxnId(before)
      .replace(/\s*okamžitá\s+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    let místoText: string | undefined;
    let nextIdx = i + 1;
    const trailLines: string[] = [];
    for (let j = i + 1; j <= i + 6 && j < lines.length; j++) {
      const L = lines[j].trim();
      if (LINE_START_DATE.test(L)) break;
      trailLines.push(L);
      const mis = L.match(MISTO_LINE);
      if (mis) {
        místoText = mis[1].trim();
        nextIdx = j + 1;
        break;
      }
      nextIdx = j + 1;
    }

    const trailBlob = trailLines.join('\n');
    const isReward =
      /Nezpoplatněný\s+převod/i.test(descMain) &&
      /Odměna za platby kartou/i.test(trailBlob + '\n' + descMain);
    const isRefund = /Příchozí\s+úhrada\s+kartou/i.test(descMain);
    const isNegInterest = /Zúčtování\s+záporných\s+úroků|záporn\w*\s+úrok/i.test(
      descMain,
    );

    let label = pickCsobMerchantLabel(descMain, lines, i);
    if (GENERIC_DESC_MAIN.test(descMain.trim())) {
      const fromBelow = pickCsobMerchantLabel('', lines, i);
      if (fromBelow && !GENERIC_DESC_MAIN.test(fromBelow)) {
        label = fromBelow;
      }
    }

    let desc = trimCsobDesc(label);
    if (!desc) desc = 'Bez popisu';

    const amountNormalized = normalizeCsobMatchedAmount(amountStr);
    const rawAmount = parseCsobMoney(amountNormalized);
    if (!isFinite(rawAmount)) {
      i = nextIdx;
      continue;
    }

    const type: 'income' | 'expense' = rawAmount >= 0 ? 'income' : 'expense';
    const amount = Math.abs(rawAmount);
    const sliceLines = [line, ...trailLines];
    const counterpartyAccount = extractCsobCounterpartyAccount(sliceLines);
    const isSelfTransfer = isOwnCounterpartyAccount(counterpartyAccount, ownerAccounts);

    if (amount > 1_000_000) {
      console.warn('[csob-pdf-parse] Skipping suspicious amount:', amount, 'from line:', line);
      i = nextIdx;
      continue;
    }

    let bucket: ImportBucket;
    let category: string;
    let description: string;
    let isRefundFlag = false;

    if (isReward) {
      description = 'Odměna za platby kartou';
      bucket = 'Ostatní';
      category = 'Ostatní';
    } else if (isNegInterest) {
      description = 'Záporný úrok';
      bucket = 'Ostatní';
      category = 'Bankovní poplatky';
    } else if (isRefund) {
      isRefundFlag = true;
      description = trimCsobDesc(místoText || desc) || 'Vratka kartou';
      bucket = classifyCsob(description, místoText);
      category = bucketToStoreCategory(bucket, 'expense');
    } else if (isSelfTransfer) {
      description = 'Převod mezi účty';
      bucket = 'Převod';
      category = 'Převod';
    } else {
      bucket = classifyCsob(label || descMain, místoText);
      category = bucketToStoreCategory(bucket, type);
      description = desc || 'Bez popisu';
    }

    const check = new Date(year, month - 1, day);
    if (check.getMonth() !== month - 1) {
      i = nextIdx;
      continue;
    }

    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const key = `${day}|${month}|${rawAmount}|${description.slice(0, 96)}`;
    if (seen.has(key)) {
      i = nextIdx;
      continue;
    }
    seen.add(key);

    rows.push({
      date,
      rawAmount,
      description,
      type,
      amount,
      bucket,
      category,
      ...(counterpartyAccount ? { counterpartyAccount } : {}),
      ...(isRefundFlag ? { isRefund: true } : {}),
    });

    i = nextIdx;
  }

  return rows;
}

/** Nový formát: datum zcela na vlastním řádku „13.03.“ (konec tečkou, bez mezery za ním). */
export const NEW_CSOB_LINE_HINT = /^\d{1,2}\.\d{2}\.$/;

export function isCsobNewFormat(lines: string[]): boolean {
  return lines.some((l) => NEW_CSOB_LINE_HINT.test(l.trim()));
}

export function parseCsobPdfPlainText(
  text: string,
  ownerName?: string,
  ownerAccounts: string[] = [],
): ParsedImportRow[] {
  const lines = csobPlainTextToLines(text);
  if (isCsobNewFormat(lines)) {
    return parseCsobNewFormatLines(lines, ownerName, ownerAccounts);
  }
  return parseCsobLinesToImportRows(lines, ownerAccounts);
}
