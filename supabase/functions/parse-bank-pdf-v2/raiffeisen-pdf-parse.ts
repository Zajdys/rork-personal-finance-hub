/**
 * Raiffeisenbank — Edge Function parser (samostatný Deno-free modul).
 * Block parser is the production path used by parseRaiffeisenPdfPlainText.
 */

import {
  type ImportBucket,
  type ParsedImportRow,
  classifyCsob,
  bucketToStoreCategory,
  csobPlainTextToLines,
  cleanMerchantName,
  cleanCounterpartyName,
} from "./csob-pdf-parse.ts";
import { normalizeAccount, isOwnCounterpartyAccount } from "./normalize-account.ts";

export type { ImportBucket, ParsedImportRow };
export { cleanMerchantName, cleanCounterpartyName };

/** Poslední částka před „CZK“ ve formátu X.XX / X,XX (mezery/nbsp jako tisícové oddělovače). */
const AMOUNT_BEFORE_CZK = /(-?\d{1,3}(?:[\s\u00a0]\d{3})*[.,]\d{2})\s*CZK/gi;

/** Datum Raiffeisen „D. M. YYYY“ na začátku řádku (např. 1. 2. 2026). */
const DATE_LINE_PREFIX = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/;

/** Horní limit jedné transakce (ochrana před sloučením s VS / číslem transakce). */
const MAX_TRANSACTION_CZK = 500_000;

/** Řádek obsahuje český formát číslo účtu/kód banky (např. 2001141349/0800 nebo 19-2235210247/0800). */
function isAccountOrRefLine(line: string): boolean {
  return /\b(\d{1,6}-)?\d{2,10}\/\d{4}\b/.test(line.trim());
}

/** Platba kartou: řádek s maskovanou kartou „PK: 408359XXXXXX3561“ kdekoli v textu. */
function isPkCardLine(line: string): boolean {
  return /PK:\s*\d{6}X+\d+/i.test(line.trim());
}

/** Řádek s částkou „-300.00 CZK“ / „1 500.00 CZK“. */
function isAmountCzkLine(line: string): boolean {
  return /^(-?\d{1,3}(?:[\s\u00a0]\d{3})*[.,]\d{2})\s*CZK$/i.test(line.trim());
}

/**
 * Typ transakce / metadata — nesmí jít do counterpartyName
 * (např. „Odchozí okamžitá úhrada“ po účtu bez jména).
 */
function isTxTypeOrMetaLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (DATE_LINE_PREFIX.test(t)) return true;
  if (isAmountCzkLine(t)) return true;
  if (/^\d{8,12}$/.test(t)) return true;
  if (/^(vs|ks|ss)\s*:/i.test(t)) return true;
  if (isAccountOrRefLine(t)) return true;
  // Hlavičky sloupců výpisu — nikdy jako jméno protistrany
  if (
    /^(datum|kategorie transakce|typ transakce|valuta|číslo protiúčtu|zpráva|kurz|poznámka|poplatek|částka|vs|ks|ss|původní částka|kód transakce|název protiúčtu)$/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /^(odchozí|příchozí|platba|vklad|výběr|jednorázová|trvalý|inkaso|poplatek|bezhotovostní)(?:\s|$)/i.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

/** Pravděpodobné jméno protiúčtu (má písmena, není typ/částka/účet). */
function looksLikePersonNameLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length >= 80) return false;
  if (isTxTypeOrMetaLine(t)) return false;
  return /[A-Za-zÁ-ž]/.test(t);
}

function parseRbAmountToken(tok: string): number {
  let s = tok.replace(/\s/g, '').replace(/[−\u2212]/g, '-');
  if (/,(\d{2})$/.test(s)) {
    s = s.replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return n;
}

export type ParsedRbTxnLine = {
  day: number;
  month: number;
  year: number;
  descRest: string;
  rawAmount: number;
};

/** Escapování pro bezpečné vložení částky do RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** slepené číslo (VS apod.) + desetinná částka před CZK – první krok rozdělení */
const SPLIT_STUCK_ID_BEFORE_AMOUNT_CZK =
  /(\d{3,})(\d{1,3}[.,]\d{2})\s*CZK/gi;

/**
 * Odděl slepené číslo od částky: "4321130.00 CZK" → "4321 130.00 CZK", pak zjednoduš pro match.
 * tryParse musí ořezávat `head` ze stejného řetězce jako tento výstup.
 */
function normalizeRBCzkAmountInputLine(trimmedIn: string): string {
  let trimmed = trimmedIn.trim();
  trimmed = trimmed.replace(SPLIT_STUCK_ID_BEFORE_AMOUNT_CZK, '$1 $2 CZK');
  // Druhý krok: "4321130.00 CZK" → "130.00 CZK" když prefix 2–10 znaků
  trimmed = trimmed.replace(
    /\b(\d+?)(\d{1,3}[.,]\d{2})\s*CZK/gi,
    (full, prefix: string, amount: string) => {
      if (prefix.length >= 2 && prefix.length <= 10) {
        return `${amount} CZK`;
      }
      return `${prefix}${amount} CZK`;
    },
  );
  return trimmed;
}

/**
 * Poslední částka … CZK na řádku. Před hledáním odstraní VS/KS, dlouhá čísla (VS/ref), krátké číslo před částkou
 * (např. „2603779294 558 2 400.00 CZK“ → 2 400 Kč; „4321 130.00 CZK“ → 130 Kč).
 * `line` = už plně `normalizeRBCzkAmountInputLine(…)`.
 */
function matchLastAmountInNormalizedString(line: string): { full: string; amountTok: string } | null {
  const trimmed = line;
  const cleaned = trimmed
    .replace(/\bVS:\d+\s*/gi, '')
    .replace(/\bKS:\d+\s*/gi, '')
    .replace(/\b\d{7,}\b/g, '')
    .replace(/\b(\d{1,4})\s+(?=\d{1,3}[.,]\d{2}\s*CZK)/gi, '');

  const matches = [...cleaned.matchAll(AMOUNT_BEFORE_CZK)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]!;
  const amountTok = last[1]!;

  const endRe = new RegExp(`\\s*${escapeRegExp(amountTok)}\\s*CZK\\s*$`, 'i');
  const mTrim = trimmed.match(endRe);
  if (mTrim) {
    return { full: mTrim[0], amountTok };
  }

  return { full: last[0]!, amountTok };
}

/** Parsuje jeden řádek výpisu RB s částkou v CZK (regex na celý řádek). */
export function tryParseRaiffeisenTxnLine(line: string): ParsedRbTxnLine | null {
  const normalized = normalizeRBCzkAmountInputLine(line);
  const am = matchLastAmountInNormalizedString(normalized);
  if (!am) return null;
  const rawAmount = parseRbAmountToken(am.amountTok);
  if (!isFinite(rawAmount)) return null;

  const head = normalized.slice(0, normalized.length - am.full.length).trimEnd();
  const dm = head.match(DATE_LINE_PREFIX);
  if (!dm) return null;

  const day = +dm[1]!;
  const month = +dm[2]!;
  const year = +dm[3]!;
  const descRest = head.slice(dm[0].length).trim();
  if (!descRest) return null;

  return { day, month, year, descRest, rawAmount };
}

/**
 * descRest může mít více řádků (PK/KS apod.) — normalizuj mezery a použij slova jako celek.
 */
function isPlatbaKartouNeboNaInternetu(descRest: string): boolean {
  const t = descRest.toLowerCase().replace(/\s+/g, ' ').trim();
  return /\bplatba\s+kartou\b/.test(t) || /\bplatba\s+na\s+internetu\b/.test(t);
}

function isCashDepositBlock(descRest: string): boolean {
  const t = descRest.toLowerCase().replace(/\s+/g, ' ').trim();
  // Explicitní vklad — i když blok obsahuje i „Vklad/Výběr z bankomatu“
  if (/v[yý]b[eě]r\s+hotovosti/.test(t)) return false;
  return (
    /vklad\s+hotovosti(?:\s+na\s+bankomatu)?/.test(t) ||
    /vklad\s*;\s*pobo[cč]ka/.test(t)
  );
}

function isAtmOrCashBlock(descRest: string): boolean {
  const t = descRest.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    /vklad\/\s*v[yý]b[eě]r\s+z\s+bankomatu/.test(t) ||
    /v[yý]b[eě]r\s+hotovosti/.test(t) ||
    /vklad\s+hotovosti/.test(t) ||
    /bezkontaktn[ií]\s+v[yý]b[eě]r/.test(t) ||
    /hotovostn[ií]\s+transakce/.test(t)
  );
}

/** Hlavičky / patičky stránky (v6–v8) — nesmí skončit v description. */
export function isRbPageNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/Výpis\s+z\s+běžného\s+účtu/i.test(t)) return true;
  if (/Pořadové\s+č\.\s+výpisu/i.test(t)) return true;
  if (/za\s+období\s*:/i.test(t)) return true;
  if (/^Strana\b/i.test(t)) return true;
  if (/^\/\s*$/.test(t)) return true;
  // v7.0: „2 6“ / „1 6“ mezi Strana a bankou
  if (/^\d{1,2}\s+\d{1,2}$/.test(t)) return true;
  if (/Raiffeisenbank\s+a\.s\.,\s*Hvězdova/i.test(t)) return true;
  if (/K0000810/i.test(t)) return true;
  if (
    /^(Datum|Kategorie transakce|Typ transakce|Valuta|Číslo protiúčtu|Zpráva|Kurz|Poznámka|Poplatek|Částka|VS|KS|SS|Přehled|Výpis pohybů|Původní částka|Kód transakce|Název protiúčtu)$/i.test(
      t,
    )
  ) {
    return true;
  }
  // Období v hlavičce: „1. 12. 2025 - 31. 12. 2025“
  if (/^\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\s*[-–]\s*\d{1,2}\./.test(t)) return true;
  return false;
}

export function stripRbPageNoise(lines: string[]): string[] {
  return lines.filter((l) => !isRbPageNoiseLine(l));
}

/** Kartová vratka: Jednorázová úhrada + PK + kladná částka (ne nákup „Platba kartou“). */
function isCardRefund(blockText: string, rawAmount: number, hasPk: boolean): boolean {
  if (!(rawAmount > 0) || !hasPk) return false;
  if (!/Jednorázová\s+úhrada/i.test(blockText)) return false;
  // Nákupy mají typ „Platba kartou“ / „Platba na internetu“ a zápornou částku.
  if (isPlatbaKartouNeboNaInternetu(blockText)) return false;
  return true;
}

/**
 * Řádek obchodníka „Název; City; CZE“ (po PK) → title.
 */
export function extractRaiffeisenMerchant(line: string): string {
  const beforeSemicolon = line.split(';')[0].trim();
  return cleanMerchantName(beforeSemicolon, line);
}

/** Odstraní číslo transakce zleva a osmici–dvanáctici VS/REF tokeny (slovní hranice). */
function stripTransactionAndVsIds(s: string): string {
  return s
    .replace(/^\d{8,12}\s*/, '')
    .replace(/\b\d{8,12}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** title: PK+merchant u karty/ATM/vratky; jinak protiúčet; jinak vyčištěný popis. */
function rbHumanTitle(
  descRest: string,
  merchantAfterPk?: string,
  counterpartyLine?: string,
  counterpartyAccount?: string,
): string {
  const atm = isAtmOrCashBlock(descRest);
  if (atm) {
    return isCashDepositBlock(descRest) ? 'Vklad hotovosti' : 'Výběr hotovosti';
  }

  // PK + obchodník = karta (nákup, vratka) i bez „Platba kartou“ / „Platba na internetu“.
  if (merchantAfterPk) {
    const rawLine = merchantAfterPk;
    const cleaned = extractRaiffeisenMerchant(rawLine);
    const letters = cleaned.replace(/[^A-Za-zÁ-ž]/g, '');
    if (letters.length < 3) {
      const cityPart = rawLine.split(';')[1]?.trim();
      const city = cityPart
        ? cityPart
            .replace(/[^A-Za-zÁ-ž\s\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        : '';
      if (city && !/^(CZE|CZ|SVK|SK)$/i.test(city)) {
        const pretty = city
          .split(' ')
          .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
          .join(' ');
        return `Neznámý obchodník (${pretty})`;
      }
      return 'Neznámý obchodník';
    }
    return cleaned;
  }

  const kartouNeboNet = isPlatbaKartouNeboNaInternetu(descRest);

  if (!kartouNeboNet && counterpartyLine) {
    if (/revolut/i.test(counterpartyLine)) return 'Revolut';
    const rawCp = counterpartyLine.split(';')[0].trim();
    const cp = cleanCounterpartyName(stripTransactionAndVsIds(rawCp));
    if (cp && looksLikePersonNameLine(cp)) return cp;
  }

  // Odchozí bez jména → číslo protiúčtu (ne „Odchozí okamžitá úhrada“)
  if (counterpartyAccount && /odchozí/i.test(descRest) && !counterpartyLine) {
    return counterpartyAccount;
  }
  if (
    counterpartyAccount &&
    /odchozí/i.test(descRest) &&
    counterpartyLine &&
    !looksLikePersonNameLine(counterpartyLine)
  ) {
    return counterpartyAccount;
  }

  // Bez jména protiúčtu — použij typ transakce jako title (ne celý blok s daty/částkou).
  const txTypeLine = descRest
    .split('\n')
    .map((l) => l.trim())
    .find((l) =>
      /^(odchozí|příchozí|jednorázová|trvalý|inkaso|poplatek|bezhotovostní)\s/i.test(l),
    );
  if (txTypeLine && counterpartyAccount && /odchozí/i.test(txTypeLine)) {
    return counterpartyAccount;
  }
  if (txTypeLine) return txTypeLine;

  const cleaned = stripTransactionAndVsIds(
    descRest
      .replace(/platba kartou apple pay/gi, '')
      .replace(/platba na internetu apple pay/gi, '')
      .replace(/platba kartou/gi, '')
      .replace(/platba na internetu/gi, '')
      .replace(/vklad\/\s*výběr z bankomatu/gi, '')
      .replace(/výběr hotovosti z bankomatu(?:\s+apple pay)?/gi, '')
      .replace(/bezkontaktní výběr hotovosti z bankomatu/gi, '')
      .replace(/vklad hotovosti na bankomatu/gi, '')
      .replace(/vklad hotovosti/gi, '')
      .replace(/hotovostní transakce/gi, '')
      .replace(/jednorázová úhrada/gi, '')
      .replace(/apple pay/gi, '')
      .replace(/KS:\d+/gi, '')
      .replace(/PK:\s*\d{6}X+\d+/gi, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );

  const cpFallback = counterpartyLine?.split(';')[0]?.trim();
  const cpClean =
    cpFallback && looksLikePersonNameLine(cpFallback)
      ? cleanCounterpartyName(stripTransactionAndVsIds(cpFallback))
      : '';

  return cleaned || cpClean || 'Platba kartou';
}

/**
 * Bloky = od data do dalšího data. Částka = poslední řádek v bloku, který je výhradně
 * „(minus)číslo… CZK“ (žádný další text na řádku).
 */
export function parseRaiffeisenLinesToImportRows(
  linesIn: string[],
  ownerName?: string,
  ownerAccounts: string[] = [],
): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
  const seen = new Set<string>();
  const lines = stripRbPageNoise(linesIn);

  // Najdi všechny indexy kde začíná transakce (řádek s datem D. M. YYYY)
  // Zaúčtování = první datum; valuta = druhý řádek s datem — ten NESMÍ být start tx,
  // jinak by date padlo na valutu (bug: YouTube 29.3 zaúčt. / 27.3 valuta → 2026-03-27).
  const txStarts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!.trim();
    if (!DATE_LINE_PREFIX.test(l)) continue;
    // Období v hlavičce už stripnuto; pojistka proti „1. 12. 2025 - 31. …“
    if (/\d{4}\s*[-–]/.test(l)) continue;
    const prev = lines[i - 1]?.trim() ?? '';
    if (DATE_LINE_PREFIX.test(prev)) continue; // valuta — pokračování předchozího bloku
    const next = lines[i + 1]?.trim() ?? '';
    const next2 = lines[i + 2]?.trim() ?? '';
    if (DATE_LINE_PREFIX.test(next) || /^\d{8,12}$/.test(next) || /^\d{8,12}$/.test(next2)) {
      txStarts.push(i);
    }
  }

  for (let s = 0; s < txStarts.length; s++) {
    const start = txStarts[s]!;
    const end = txStarts[s + 1] ?? lines.length;
    const block = lines
      .slice(start, end)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Datum zaúčtování = první řádek bloku (block[0]); valuta = block[1], pokud je datum.
    const dm = block[0]!.match(DATE_LINE_PREFIX);
    if (!dm) continue;
    const day = +dm[1]!;
    const month = +dm[2]!;
    const year = +dm[3]!;

    // Ověř datum
    const check = new Date(year, month - 1, day);
    if (check.getMonth() !== month - 1) continue;

    let bookingDate: string | null = null;
    const valutaMatch = block[1]?.match(DATE_LINE_PREFIX);
    if (valutaMatch) {
      const vd = +valutaMatch[1]!;
      const vm = +valutaMatch[2]!;
      const vy = +valutaMatch[3]!;
      const vCheck = new Date(vy, vm - 1, vd);
      if (vCheck.getMonth() === vm - 1) {
        bookingDate = `${vy}-${String(vm).padStart(2, '0')}-${String(vd).padStart(2, '0')}`;
      }
    }

    // Částka – hledej řádek který matchuje přesně "číslo CZK" nebo "-číslo CZK"
    // Řádek jako "-132.10 CZK" nebo "130.00 CZK" nebo "2 000.00 CZK"
    let rawAmount: number | null = null;
    for (let j = block.length - 1; j >= 0; j--) {
      const l = block[j]!;
      const m = l.match(/^(-?\d{1,3}(?:[\s\u00a0]\d{3})*[.,]\d{2})\s*CZK$/i);
      if (m) {
        const v = parseRbAmountToken(m[1]!);
        if (isFinite(v) && Math.abs(v) <= MAX_TRANSACTION_CZK) {
          rawAmount = v;
          break;
        }
      }
    }
    if (rawAmount === null) continue;
    if (Math.abs(rawAmount) < 0.01) continue;

    // Merchant po PK (raw řádek — short-name / město řeší rbHumanTitle)
    let merchantRaw: string | undefined;
    for (let j = 0; j < block.length - 1; j++) {
      if (isPkCardLine(block[j]!)) {
        merchantRaw = block[j + 1]!;
        break;
      }
    }

    // Protiúčet — jen skutečné číslo účtu (ne karta / bankomat).
    let counterparty: string | undefined;
    let counterpartyAccount: string | undefined;
    const hasPk = block.some(isPkCardLine);
    const isAtm = isAtmOrCashBlock(block.join("\n"));
    if (!hasPk && !isAtm) {
      for (let j = 0; j < block.length - 1; j++) {
        if (isAccountOrRefLine(block[j]!)) {
          const rawAcc = block[j]!.trim().match(/\b(\d{1,6}-)?\d{2,10}\/\d{4}\b/)?.[0];
          const normalized = normalizeAccount(rawAcc);
          if (normalized) counterpartyAccount = normalized;
          const next = block[j + 1]!.trim();
          // Typ transakce / částka (Odchozí okamžitá úhrada, -300.00 CZK) ≠ jméno.
          if (looksLikePersonNameLine(next)) {
            counterparty = next;
            break;
          }
          // Účet máme i bez jména — hledej jméno na dalších řádcích (ne typ/částku).
          if (normalized) {
            for (let k = j + 2; k < Math.min(j + 6, block.length); k++) {
              const cand = block[k]!.trim();
              if (!looksLikePersonNameLine(cand)) continue;
              counterparty = cand;
              break;
            }
            break;
          }
        }
      }
    }

    const descRest = block.slice(1).join('\n');
    const title = rbHumanTitle(descRest, merchantRaw, counterparty, counterpartyAccount);
    const merchantForClassify = merchantRaw
      ? extractRaiffeisenMerchant(merchantRaw)
      : undefined;
    const descForClassify = [block.join('\n'), title, counterparty].filter(Boolean).join('\n');
    const místo = counterparty?.split(';')[0]?.trim() ?? merchantForClassify?.split(';')[0]?.trim();

    const blockText = block.join('\n');
    const isRefund = isCardRefund(blockText, rawAmount, hasPk);
    const isDeposit = isCashDepositBlock(blockText) || (isAtm && rawAmount > 0);

    const type: 'income' | 'expense' = isDeposit
      ? 'income'
      : isAtm && rawAmount < 0
        ? 'expense'
        : rawAmount >= 0
          ? 'income'
          : 'expense';
    const amount = Math.abs(rawAmount);
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const bucket: ImportBucket = isAtm
      ? 'Ostatní'
      : classifyCsob(descForClassify, místo);
    // Vratka: type income, ale kategorie jako u nákupu (výdajová).
    // ATM: vklad = income + Vklad hotovosti; výběr = expense + Výběr hotovosti.
    let category = isDeposit
      ? 'Vklad hotovosti'
      : isAtm
        ? 'Výběr hotovosti'
        : bucketToStoreCategory(bucket, isRefund ? 'expense' : type);

    // Kód transakce (8–12 číslic na samostatném řádku) rozlíší duplicity se stejným zněním
    const txCode = block.find((l) => /^\d{8,12}$/.test(l)) ?? "";
    const key = `${day}|${month}|${year}|${rawAmount}|${txCode}|${title.slice(0, 96)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const cpNameRaw = counterparty
      ? cleanCounterpartyName(counterparty.split(';')[0]?.trim() || counterparty)
      : '';
    // Typ transakce / částka jako „jméno“ neukládej (Odchozí okamžitá → null).
    const cpName =
      cpNameRaw && looksLikePersonNameLine(cpNameRaw) ? cpNameRaw : undefined;
    const meta = {
      ...(txCode ? { bankTransactionId: txCode } : {}),
      ...(counterpartyAccount ? { counterpartyAccount } : {}),
      ...(cpName ? { counterpartyName: cpName } : {}),
      ...(isRefund ? { isRefund: true as const } : {}),
    };

    // Převod = výhradně shoda normalizovaného protiúčtu s vlastním účtem (ne podle jména).
    const isSavingsTransfer = isOwnCounterpartyAccount(counterpartyAccount, ownerAccounts);
    if (isSavingsTransfer) {
      rows.push({
        date,
        bookingDate,
        rawAmount,
        description: 'Převod ze spořáku',
        type,
        amount,
        bucket: 'Převod',
        category: 'Převod',
        ...(txCode ? { bankTransactionId: txCode } : {}),
        ...(counterpartyAccount ? { counterpartyAccount } : {}),
        ...(cpName ? { counterpartyName: cpName } : {}),
      });
      continue;
    }

    rows.push({
      date,
      bookingDate,
      rawAmount,
      description: title || 'Bez popisu',
      type,
      amount,
      bucket,
      category,
      ...meta,
    });
  }

  return rows.filter((t) => t.amount >= 0.01);
}

export function parseRaiffeisenPdfPlainText(
  text: string,
  ownerName?: string,
  ownerAccounts: string[] = [],
): ParsedImportRow[] {
  console.log('[RB-RAW-TEXT]', text.slice(0, 3000));
  const lines = csobPlainTextToLines(text);
  console.log('[RB-LINES-20-60]', lines.slice(20, 60).map((l, i) => `[${i + 20}] ${l}`).join('\n'));
  return parseRaiffeisenLinesToImportRows(lines, ownerName, ownerAccounts);
}
