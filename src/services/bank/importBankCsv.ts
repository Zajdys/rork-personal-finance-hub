import { toNum } from "../../lib/num";
import { Platform } from "react-native";
import { parseXlsxArrayBuffer, ParsedTable } from "@/src/utils/fileParser";
import { generateObject } from "@rork-ai/toolkit-sdk";
import { z } from "zod";

export type BankCsvRecord = Record<string, string | undefined>;

const DATE_KEYS = [
  "Date", "Datum", "Posted Date", "Booking Date", "Transaction Date", "Transaction date",
  "Datum transakce", "Datum provedení", "Datum zaúčtování", "Datum zauctovani",
  "Valuation date", "Datum valuty", "Datum odepsání", "Datum odepsani"
] as const;

const DESC_KEYS = [
  "Description", "Popis", "Merchant", "Narrative", "Details", "Transaction description",
  "Popis transakce", "Název transakce", "Nazev transakce", "Účel platby", "Ucel platby",
  "Název položky", "Nazev polozky", "Typ transakce", "Merchant name", "Obchodník", "Obchodnik",
  "Poznámka", "Poznamka", "Message", "Zpráva", "Zprava", "VS", "Variabilní symbol", "Variabilni symbol",
  "Protiúčet - název", "Protiucet - nazev", "Název protiúčtu", "Nazev protiuctu", "Recipient", "Příjemce", "Prijemce"
] as const;

const AMOUNT_KEYS = [
  "Amount", "Částka", "Castka", "Amount (CZK)", "Transaction Amount", "Transaction amount",
  "Suma", "Hodnota", "Volume", "Objem", "Price", "Cena", "Total", "Celkem",
  "Částka transakce", "Castka transakce", "Kredit", "Debit", "Value",
  "Amount in account currency", "Částka v měně účtu", "Castka v mene uctu"
] as const;

const CURRENCY_KEYS = [
  "Currency", "Měna", "Mena", "Account currency", "Měna účtu", "Mena uctu",
  "Transaction currency", "Měna transakce", "Mena transakce"
] as const;

const CATEGORY_KEYS = [
  "Category", "Kategorie", "Type", "Typ", "Transaction type", "Typ transakce",
  "Payment type", "Typ platby"
] as const;

const EXPENSE_KEYWORDS: Array<[string, string]> = [
  ["lidl|kaufland|tesco|billa|penny|albert|iglou|rohlik|globus|makro|spar|coop|jednota|potraviny|food|market|супермаркет|grocery|supermarket|potravin|fresh|market", "Jídlo a nápoje"],
  ["ubereats|boltfood|wolt|pizza|kfc|mcdonald|burger|starbucks|coffee|cafe|kavárna|kavarna|restaurace|restaurant|hospoda|bistro|delivery|food\\s?panda|bageterie|paul|costa|subway", "Jídlo a nápoje"],
  ["nájem|najem|pronajem|rent|hypoteka|mortgage|energie|electric|plyn|gas|water|voda|vodne|stocne|teplo|heating|internet|o2|vodafone|tmobile|sazba|poplatek|inkaso|čez|innogy|pražská|plynárenská|rwe", "Nájem a bydlení"],
  ["zara|hm|h&m|aboutyou|zalando|footshop|nike|adidas|ccc|answear|reserved|c&a|newyorker|mango|orsay|deichmann|boty|oblečení|obleceni|fashion|textile|clothing|obuv", "Oblečení"],
  ["doprava|transport|mhd|ids|pid|lítačka|litacka|metro|tram|tramvaj|autobus|bus|benzin|benzina|shell|omv|molu|mol|tank|tankování|tankoven|pohonné|palivo|nafta|diesel|uber|bolt|taxi|liftago|parkování|parking|ticket|jízdenka|jizdenka|cd|regiojet|flixbus|leo\\s?express", "Doprava"],
  ["netflix|spotify|hbomax|hbo|disney|apple\\s?tv|amazon\\s?prime|steam|xbox|playstation|ps\\s?plus|cinema|kino|aero|village|multiplayer|game|hra|zábava|zabava|entertainment|divadlo|theatre|koncert|concert|vstupné|vstupenka", "Zábava"],
  ["lékárna|lekarna|léky|leky|drmax|benu|hospital|nemocnice|klinika|clinic|poliklinika|dent|zub|zubní|zubni|stomatolog|lékař|lekar|doktor|doctor|gym|fitness|cvičení|cviceni|wellness|spa|decathlon|sportisimo|sport|medical|zdraví|zdravi|health|ordinace", "Zdraví"],
  ["škola|skola|školné|skolne|kurz|course|udemy|coursera|kniha|knih|book|kníhkupectví|knihkupectvi|bookstore|school|univerzita|univerz|vysoká|vysoka|střední|stredni|vzdělání|vzdelani|education|učebnice|ucebnice|školka|skolka|isic|student|studium", "Vzdělání"],
  ["alza|mall|czc|datart|electro|electroworld|euronics|mediamarkt|media\\s?markt|okay|amazon|ebay|asos|shein|notino|zásilkovna|zasilkovna|packeta|eshop|e-shop|e\\s?shop|online|nákup|nakup|shopping|obchod|retail|ikea|jysk|bauhaus|obi|hornbach", "Nákupy"],
  ["služba|sluzba|service|údržba|udrzba|oprava|repair|cleaning|úklid|uklid|subscription|předplatné|predplatne|subscr|členství|clenstvi|membership|pojištění|pojisteni|insurance|čpzp|vzp|kooperativa|allianz|generali|servis|maintenance|advokát|advokat|právník|pravnik|lawyer|účetní|ucetni|accountant|notář|notar", "Služby"],
];

const INCOME_KEYWORDS: Array<[string, string]> = [
  ["výplata|vyplata|mzda|plat|salary|wage|payroll|hr|zaměstnavatel|zamestnavatel|employer|income|příjem|prijem", "Mzda"],
  ["freelance|živnost|zivnost|invoice|faktura|fakturace|contract|contractor|honorář|honorar|dohoda|service\\s?fee|consulting|konzultace|smluvní|smluvni|podnikání|podnikani|business|ičo|ico", "Freelance"],
  ["dividend|dividenda|úrok|urok|interest|coupon|kupon|staking|investice|investment|výnos|vynos|return|broker|trading|akcie|stock|dluhopis|fond|fund|profit|zisk", "Investice"],
  ["dar|dárek|darek|gift|present|donation|darování|darovani|sponzor|sponsor|příspěvek|prispevek|contribution|collection|sbírka|sbirka", "Dary"],
];

function normalizeHeader(h: string): string {
  return h.replace(/\uFEFF/g, "").trim();
}

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const len = text.length;
  let field = "";
  let current: string[] = [];
  let inQuotes = false;

  function pushField() {
    current.push(field);
    field = "";
  }
  function pushRow() {
    rows.push([...current]);
  }

  while (i < len) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') { inQuotes = true; i++; continue; }

    if (ch === ";" || ch === ",") {
      pushField();
      i++;
      continue;
    }

    if (ch === "\n") {
      pushField();
      pushRow();
      current = [];
      i++;
      continue;
    }

    if (ch === "\r") { i++; continue; }

    field += ch;
    i++;
  }
  if (field.length || current.length) {
    pushField();
    pushRow();
  }

  return rows.filter(r => r.some(c => c && c.trim().length));
}

function toRecords(rows: string[][]): BankCsvRecord[] {
  if (!rows.length) return [];
  const headers = rows[0].map(normalizeHeader);
  const out: BankCsvRecord[] = [];
  for (let ri = 1; ri < rows.length; ri++) {
    const row = rows[ri];
    const rec: BankCsvRecord = {};
    for (let ci = 0; ci < headers.length; ci++) {
      rec[headers[ci]] = (row[ci] ?? "").trim();
    }
    out.push(rec);
  }
  return out;
}

function pick(r: BankCsvRecord, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    if (r[k] != null && String(r[k]).trim() !== "") return r[k];
    // also try case-insensitive header match
    const hit = Object.keys(r).find(h => h.toLowerCase() === k.toLowerCase());
    if (hit && r[hit] && String(r[hit]).trim() !== '') return r[hit];
  }
  return undefined;
}

function parseDateFlexible(raw: string | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return new Date(iso);

  const m = s.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const y = parseInt(m[3].length === 2 ? (Number(m[3]) + 2000).toString() : m[3], 10);
    const dt = new Date(y, mo, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

export type ParsedTxn = {
  type: 'income' | 'expense';
  amount: number;
  title: string;
  category: string;
  date: Date;
};

function cleanTextForMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function guessCategory(title: string, type: 'income' | 'expense'): string {
  const titleLower = cleanTextForMatching(title);
  const list = type === 'expense' ? EXPENSE_KEYWORDS : INCOME_KEYWORDS;
  
  const scores: Array<{ category: string; score: number }> = [];
  
  for (const [re, cat] of list) {
    const patterns = re.split('|');
    let bestScore = 0;
    
    for (const pattern of patterns) {
      const cleanPattern = pattern.replace(/\\s\?/g, ' ').replace(/\\s/g, ' ');
      const regex = new RegExp(cleanPattern, 'i');
      
      if (regex.test(titleLower)) {
        const matchLength = cleanPattern.length;
        const score = matchLength / titleLower.length;
        if (score > bestScore) bestScore = score;
      }
    }
    
    if (bestScore > 0) {
      scores.push({ category: cat, score: bestScore });
    }
  }
  
  if (scores.length > 0) {
    scores.sort((a, b) => b.score - a.score);
    return scores[0].category;
  }
  
  return type === 'expense' ? 'Ostatní' : 'Ostatní';
}

export function mapBankRecord(r: BankCsvRecord): ParsedTxn | null {
  const dateRaw = pick(r, DATE_KEYS);
  let desc = pick(r, DESC_KEYS) ?? "";
  const amtRaw = pick(r, AMOUNT_KEYS);
  const ccy = pick(r, CURRENCY_KEYS);
  const catRaw = pick(r, CATEGORY_KEYS);

  desc = desc.replace(/\s+/g, ' ').trim();
  
  const amount0 = toNum(amtRaw);
  if (amount0 == null || amount0 === 0) return null;
  
  const type: 'income' | 'expense' = amount0 < 0 ? 'expense' : 'income';
  const amount = Math.abs(amount0);
  const date = parseDateFlexible(dateRaw) ?? new Date();
  
  let title = desc || (ccy ? `Transakce (${ccy})` : 'Transakce');
  
  title = title.replace(/^(platba kartou|výběr z bankomatu|vklad|převod|poplatek|úrok)/i, (match) => {
    const rest = title.substring(match.length).trim();
    return rest || match;
  }).trim();
  
  if (title.length > 100) {
    title = title.substring(0, 97) + '...';
  }
  
  const category = (catRaw && catRaw.trim()) || guessCategory(title, type);

  return { type, amount, title, category, date };
}

export function parseBankCsvToTransactions(text: string): ParsedTxn[] {
  try {
    const rows = parseCSV(text);
    const recs = toRecords(rows);
    const txns = recs.map(mapBankRecord).filter((x): x is ParsedTxn => !!x);
    
    const uniqueTxns = new Map<string, ParsedTxn>();
    for (const txn of txns) {
      const key = `${txn.date.toISOString()}-${txn.amount}-${txn.title}-${txn.type}`;
      if (!uniqueTxns.has(key)) {
        uniqueTxns.set(key, txn);
      }
    }
    
    return Array.from(uniqueTxns.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  } catch (e) {
    console.error('parseBankCsvToTransactions error', e);
    return [];
  }
}

export async function parseBankXlsxToTransactions(buf: ArrayBuffer): Promise<ParsedTxn[]> {
  try {
    const table: ParsedTable = await parseXlsxArrayBuffer(buf);
    const records: BankCsvRecord[] = table.map((row) => {
      const rec: BankCsvRecord = {};
      for (const [k, v] of Object.entries(row)) {
        if (typeof k === 'string') {
          const value = typeof v === 'number' ? v.toString() : (v ?? '');
          rec[normalizeHeader(k)] = String(value).trim();
        }
      }
      return rec;
    });
    const txns = records.map(mapBankRecord).filter((x): x is ParsedTxn => !!x);
    
    const uniqueTxns = new Map<string, ParsedTxn>();
    for (const txn of txns) {
      const key = `${txn.date.toISOString()}-${txn.amount}-${txn.title}-${txn.type}`;
      if (!uniqueTxns.has(key)) {
        uniqueTxns.set(key, txn);
      }
    }
    
    return Array.from(uniqueTxns.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  } catch (e) {
    console.error('parseBankXlsxToTransactions error', e);
    return [];
  }
}

export async function readUriText(uri: string): Promise<string> {
  try {
    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      const txt = await res.text();
      return txt;
    } else {
      const FS = await import('expo-file-system');
      const txt = await FS.readAsStringAsync(uri, { encoding: 'utf8' as any });
      return txt;
    }
  } catch (e) {
    console.error('readUriText error', e);
    throw e;
  }
}

function unescapePdfString(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\") {
      const next = s[i + 1];
      if (next === "n") { out += "\n"; i++; continue; }
      if (next === "r") { out += "\r"; i++; continue; }
      if (next === "t") { out += "\t"; i++; continue; }
      if (next === "b") { out += "\b"; i++; continue; }
      if (next === "f") { out += "\f"; i++; continue; }
      if (next === "\\" || next === "(" || next === ")") { out += next; i++; continue; }
      out += next; i++; continue;
    }
    out += ch;
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '').toLowerCase();
  const len = Math.floor(clean.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16) & 0xff;
  return out;
}

function bytesToText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let s = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      s += String.fromCharCode(code);
    }
    return s;
  }
  try {
    const TD: any = (globalThis as any).TextDecoder ? new TextDecoder('utf-8') : null;
    if (TD) return TD.decode(bytes);
  } catch {}
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function extractTextFromPdfRaw(raw: string): string {
  try {
    if (!raw || raw.length < 100) {
      console.log('PDF raw content too short or empty');
      return '';
    }

    if (!raw.includes('%PDF')) {
      console.log('Not a valid PDF format (missing %PDF header)');
      return '';
    }

    let normalized: string;
    try {
      normalized = raw.replace(/\)\s*T\*/gm, ')\n').replace(/\)\s*T[dD]\b/gm, ')\n');
    } catch (replaceError) {
      console.error('Error normalizing PDF content:', replaceError);
      return '';
    }
    
    const parts: string[] = [];
    
    try {
      const simpleTextRe = /\(([^()]+)\)\s*Tj/gmi;
      const matches = normalized.match(simpleTextRe);
      if (matches && matches.length > 0) {
        for (const match of matches) {
          try {
            const content = match.match(/\(([^()]+)\)/);
            if (content && content[1]) {
              parts.push(unescapePdfString(content[1]));
            }
          } catch (innerError) {
            continue;
          }
        }
      }
      
      if (parts.length === 0) {
        const hexRe = /<([\da-fA-F\s]+)>\s*Tj/gmi;
        const hexMatches = normalized.match(hexRe);
        if (hexMatches && hexMatches.length > 0) {
          for (const match of hexMatches) {
            try {
              const content = match.match(/<([\da-fA-F\s]+)>/);
              if (content && content[1]) {
                parts.push(bytesToText(hexToBytes(content[1])));
              }
            } catch (innerError) {
              continue;
            }
          }
        }
      }
    } catch (matchError) {
      console.error('Error matching PDF patterns:', matchError);
      return '';
    }
    
    console.log('PDF extracted', parts.length, 'text parts');
    return parts.join('\n');
  } catch (e) {
    console.error('extractTextFromPdfRaw error', e);
    return '';
  }
}

async function readPdfImageAsBase64(uri: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      if (!res.ok) return null;
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } else {
      const FS = await import('expo-file-system');
      const b64 = await FS.readAsStringAsync(uri, { encoding: 'base64' as any });
      return b64;
    }
  } catch (e) {
    console.error('readPdfImageAsBase64 error', e);
    return null;
  }
}

export async function readPdfText(uri: string): Promise<string> {
  try {
    console.log('Reading PDF from URI:', uri);
    
    let raw: string;
    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      if (!res.ok) {
        throw new Error(`Failed to fetch PDF: ${res.status} ${res.statusText}`);
      }
      const buf = await res.arrayBuffer();
      console.log('PDF buffer size:', buf.byteLength);
      
      try {
        raw = new TextDecoder('latin1').decode(new Uint8Array(buf));
      } catch (decodeError) {
        console.error('TextDecoder error:', decodeError);
        throw new Error('Nepodařilo se dekódovat PDF soubor');
      }
    } else {
      const FS = await import('expo-file-system');
      const b64 = await FS.readAsStringAsync(uri, { encoding: 'base64' as any });
      console.log('PDF base64 length:', b64.length);
      
      try {
        raw = decodeBase64Latin1(b64);
      } catch (decodeError) {
        console.error('Base64 decode error:', decodeError);
        throw new Error('Nepodařilo se dekódovat PDF soubor');
      }
    }
    
    console.log('PDF raw content length:', raw.length);
    console.log('PDF header check:', raw.substring(0, 20));
    
    const text = extractTextFromPdfRaw(raw);
    console.log('Extracted text length:', text.length);
    
    if (!text || text.trim().length === 0) {
      throw new Error('PDF neobsahuje žádný čitelný text. Zkuste prosím CSV nebo XLSX formát.');
    }
    
    return text;
  } catch (e) {
    console.error('readPdfText error', e);
    const errorMessage = e instanceof Error ? e.message : 'Nepodařilo se přečíst PDF soubor';
    throw new Error(errorMessage);
  }
}

export async function readUriArrayBuffer(uri: string): Promise<ArrayBuffer> {
  try {
    if (Platform.OS === 'web') {
      const res = await fetch(uri);
      return await res.arrayBuffer();
    } else {
      const FS = await import('expo-file-system');
      const b64 = await FS.readAsStringAsync(uri, { encoding: 'base64' as any });
      const binary = decodeBase64Latin1(b64);
      const buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i) & 0xff;
      return buf.buffer;
    }
  } catch (e) {
    console.error('readUriArrayBuffer error', e);
    throw e;
  }
}

function decodeBase64Latin1(b64: string): string {
  try {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < b64.length; i++) {
      const c = chars.indexOf(b64[i]);
      if (c < 0) continue;
      buffer = (buffer << 6) | c;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        const byte = (buffer >> bits) & 0xff;
        output += String.fromCharCode(byte);
      }
    }
    return output;
  } catch (e) {
    console.error('decodeBase64Latin1 error', e);
    return '';
  }
}

async function parseBankPdfWithAI(base64Image: string): Promise<ParsedTxn[]> {
  try {
    console.log('Parsing bank statement with AI...');
    
    const schema = z.object({
      transactions: z.array(
        z.object({
          date: z.string().describe('Datum transakce ve formátu DD.MM.YYYY nebo YYYY-MM-DD'),
          description: z.string().describe('Popis transakce - co bylo koupeno/zaplaceno'),
          amount: z.number().describe('Částka v číselném formátu. Záporná pro výdaje, kladná pro příjmy'),
          category: z.string().optional().describe('Kategorie transakce - jedna z: Jídlo a nápoje, Nájem a bydlení, Oblečení, Doprava, Zábava, Zdraví, Vzdělání, Nákupy, Služby, Ostatní'),
        })
      ),
    });

    const result = await generateObject({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyzuj tento bankovní výpis a vrať všechny transakce. DŮLEŽITÉ PRAVIDLA:\n\n1. Přečti VŠECHNY transakce z výpisu, i když jich je hodně (20+, 50+, 100+)\n2. Pro každou transakci zjisti: datum, popis, částku\n3. Částka: Pokud je to výdaj/platba/debet, musí být ZÁPORNÉ číslo. Pokud je to příjem/kredit, musí být KLADNÉ číslo.\n4. Popis: Zahrň důležité informace (název obchodu, účel platby, protiúčet)\n5. Pokud vidíš měnu, převeď na CZK pokud je to možné, jinak použij původní částku\n6. Ignoruj mezisoučty typu "Celkem za měsíc" - zajímají nás jen jednotlivé transakce\n7. Kategorizuj transakce podle popisu do správné kategorie\n\nKategorie:\n- Jídlo a nápoje: supermarkety, restaurace, kavárny\n- Nájem a bydlení: nájem, energie, internet, telefon\n- Oblečení: oděvy, boty, módní značky\n- Doprava: benzín, MHD, taxi, jízdenky\n- Zábava: Netflix, hry, kino, sport\n- Zdraví: lékárna, lékaři, fitness\n- Vzdělání: škola, kurzy, knihy\n- Nákupy: elektronika, nábytek, online nákupy\n- Služby: pojištění, předplatné, opravy\n- Ostatní: vše ostatní',
            },
            {
              type: 'image',
              image: base64Image,
            },
          ],
        },
      ],
      schema,
    });

    console.log('AI parsed', result.transactions.length, 'transactions from bank statement');

    const parsedTransactions: ParsedTxn[] = result.transactions.map((txn) => {
      const date = parseDateFlexible(txn.date) || new Date();
      const amount = Math.abs(txn.amount);
      const type: 'income' | 'expense' = txn.amount < 0 ? 'expense' : 'income';
      const category = txn.category || guessCategory(txn.description, type);
      
      return {
        type,
        amount,
        title: txn.description,
        category,
        date,
      };
    });

    return parsedTransactions;
  } catch (e) {
    console.error('parseBankPdfWithAI error', e);
    return [];
  }
}

export function parseBankPdfTextToTransactions(text: string): ParsedTxn[] {
  try {
    const lines = text.split(/\r?\n+/).map(l => l.replace(/[\u202F\u00A0]/g, ' ').trim()).filter(l => l.length > 0);
    const out: ParsedTxn[] = [];
    const dateRe = /(\d{1,2}[\.\/-]\d{1,2}[\.\/-]\d{2,4}|\d{4}[\.\/-]\d{1,2}[\.\/-]\d{1,2})/;
    const amtRe = /([+\-−–]?\s?\d{1,3}(?:[\s\u00A0]?\d{3})*(?:[\.,]\d{1,2})?)\s?(Kč|CZK|EUR|USD|€|\$)?/i;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!dateRe.test(line)) continue;
      const dateStr = (line.match(dateRe)?.[1]) ?? '';
      const date = parseDateFlexible(dateStr) ?? null;
      let amtMatch: RegExpMatchArray | null = line.match(amtRe);
      if (!amtMatch && i + 1 < lines.length) amtMatch = lines[i + 1].match(amtRe);
      if (!amtMatch && i > 0) amtMatch = lines[i - 1].match(amtRe);
      const rawAmt = amtMatch?.[1] ?? '';
      let amtNum = toNum(rawAmt);
      if (amtMatch && /^[−–]/.test(amtMatch[1] ?? '')) amtNum = amtNum != null ? -Math.abs(amtNum) : amtNum;
      if (!date || amtNum == null || amtNum === 0) continue;
      const titleParts: string[] = [];
      const cleanedLine = line.replace(dateRe, '').replace(amtRe, '').replace(/\s{2,}/g, ' ').trim();
      if (cleanedLine) titleParts.push(cleanedLine);
      if (amtMatch && i + 1 < lines.length) {
        const nextClean = lines[i + 1].replace(dateRe, '').replace(amtRe, '').replace(/\s{2,}/g, ' ').trim();
        if (nextClean && nextClean !== cleanedLine) titleParts.push(nextClean);
      }
      let title = (titleParts.join(' • ').trim() || 'Transakce');
      if (title.length > 100) title = title.substring(0, 97) + '...';
      
      const type: 'income' | 'expense' = (amtNum ?? 0) < 0 ? 'expense' : 'income';
      const amount = Math.abs(amtNum ?? 0);
      const category = guessCategory(title, type);
      out.push({ type, amount, title, category, date });
    }
    if (out.length === 0 && lines.length > 3) {
      for (let i = 0; i < lines.length - 2; i++) {
        const blob = [lines[i], lines[i + 1], lines[i + 2]].join(' ');
        const d = blob.match(dateRe)?.[1] ?? '';
        const date = parseDateFlexible(d);
        const a = blob.match(amtRe)?.[1] ?? '';
        const n = toNum(a);
        if (date && n != null && n !== 0) {
          let title = blob.replace(dateRe, '').replace(amtRe, '').replace(/\s{2,}/g, ' ').trim() || 'Transakce';
          if (title.length > 100) title = title.substring(0, 97) + '...';
          const type: 'income' | 'expense' = n < 0 ? 'expense' : 'income';
          const amount = Math.abs(n);
          const category = guessCategory(title, type);
          out.push({ type, amount, title, category, date });
          i += 2;
        }
      }
    }
    const uniqueTxns = new Map<string, ParsedTxn>();
    for (const txn of out) {
      const key = `${txn.date.toISOString()}-${txn.amount}-${txn.title}-${txn.type}`;
      if (!uniqueTxns.has(key)) {
        uniqueTxns.set(key, txn);
      }
    }
    
    return Array.from(uniqueTxns.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  } catch (e) {
    console.error('parseBankPdfTextToTransactions error', e);
    return [];
  }
}
