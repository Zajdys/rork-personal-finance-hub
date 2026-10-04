/**
 * PDF bank import: Supabase Edge `parse-bank-pdf-v2` (text z PDF + parser podle banky).
 */
import type { ParsedImportRow } from '@/lib/bank-statement-parser';
import {
  detectBankType,
  detectPdfBankTypeForImport,
  type ClientPdfBankType,
} from '@/lib/bank-pdf-detect';
import {
  resolvePdfImportSource,
  type PdfImportSource,
} from '@/lib/bank-import-source';
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';
import { logAndGetUserFacingError } from '@/lib/user-facing-error';
import { httpError, withNetworkRetry } from '@/lib/with-network-retry';

/** Appka mapuje na „Přihlas se znovu“. */
export const PDF_PARSE_LOGIN_REQUIRED = 'Přihlas se znovu';

export type ParseBankPdfResult = {
  rows: ParsedImportRow[];
  debugLines?: string[];
  message?: string;
  /** ČSOB, Raiffeisenbank, KB, Fio, Air Bank, ČS, Moneta nebo obecné „PDF výpis“ */
  bankLabel?: string;
  /** Odpovídá tělu požadavku + odpovědi Edge */
  source?: PdfImportSource;
  /** Jméno majitele z hlavičky výpisu (Název účtu / Majitel účtu / …) */
  statementOwnerName?: string | null;
  /** ČSOB / Air Bank / Moneta: výpis neprošel kontrolou zůstatku / počtu transakcí */
  statementIncomplete?: boolean;
  /** Air Bank (a příp. jiné): výpis bez pohybů — 0 transakcí není chyba */
  emptyStatement?: boolean;
  expectedCount?: number;
  parsedCount?: number;
};

const PARSE_BANK_PDF_V2_URL = `${supabaseUrl}/functions/v1/parse-bank-pdf-v2`;
const PARSE_BANK_PDF_TIMEOUT_MS = 120_000;

export { detectPdfBankTypeForImport };

type EdgeSuccess = {
  rows: ParsedImportRow[];
  bankLabel: string;
  message: string;
  source?: string;
  statementOwnerName?: string | null;
  statementIncomplete?: boolean;
  emptyStatement?: boolean;
  expectedCount?: number;
  parsedCount?: number;
};

/**
 * PDF jako base64 → Edge `parse-bank-pdf-v2` (pdfjs + parser) → transakce.
 * Vyžaduje přihlášenou session (user JWT). Název `WithPdfCo` je legacy.
 */
export async function parseBankPdfWithPdfCo(
  pdfBase64: string,
  fileName?: string,
  ownerName?: string,
  ownerAccounts?: string[],
): Promise<ParseBankPdfResult> {
  console.log('[import] krok 3a detectBankType start', {
    fileName,
    base64Len: pdfBase64?.length ?? 0,
    ownerAccounts: ownerAccounts?.length ?? 0,
  });

  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionErr || !accessToken || !sessionData.session?.user?.id) {
    throw new Error(PDF_PARSE_LOGIN_REQUIRED);
  }

  const bankType: ClientPdfBankType = detectBankType(pdfBase64, fileName);
  console.log('[import] krok 3b detectBankType done', { bankType });
  const body = JSON.stringify({
    pdfBase64: pdfBase64,
    bankType: bankType,
    ...(ownerName != null && String(ownerName).trim() !== ''
      ? { ownerName: String(ownerName).trim() }
      : {}),
    ...(Array.isArray(ownerAccounts) && ownerAccounts.length > 0
      ? { ownerAccounts: ownerAccounts.map((s) => String(s).replace(/\s+/g, '').trim()).filter(Boolean) }
      : {}),
  });
  console.log('[import] krok 3c fetch parse-bank-pdf-v2', {
    url: PARSE_BANK_PDF_V2_URL,
    bodyBytes: body.length,
  });

  try {
    return await withNetworkRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PARSE_BANK_PDF_TIMEOUT_MS);
        try {
          const res = await fetch(PARSE_BANK_PDF_V2_URL, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
              apikey: supabaseAnonKey,
            },
            body,
          });

          const data = (await res.json().catch(() => ({}))) as EdgeSuccess & {
            message?: string;
            error?: string;
          };

          console.log('[import] krok 3d edge response', {
            status: res.status,
            rows: Array.isArray(data.rows) ? data.rows.length : 0,
            bankLabel: data.bankLabel,
            source: data.source,
          });

          if (res.status === 401 || res.status === 403) {
            throw new Error(PDF_PARSE_LOGIN_REQUIRED);
          }

          if (!res.ok) {
            const msg =
              (typeof data.message === 'string' && data.message) ||
              (typeof (data as { error?: string }).error === 'string' &&
                (data as { error: string }).error) ||
              `HTTP ${res.status}`;
            throw httpError(msg, res.status);
          }

          const rows = Array.isArray(data.rows) ? data.rows : [];
          const bankLabel =
            typeof data.bankLabel === 'string' && data.bankLabel ? data.bankLabel : undefined;
          const message = typeof data.message === 'string' ? data.message : 'OK';

          // Edge `source` má přednost; neznámá hodnota → chyba (ne tichý fallback na csob).
          // `auto` z klienta se sem nesmí dostat — Edge musí vrátit konkrétní banku.
          const source = resolvePdfImportSource(data.source);

          const statementOwnerName =
            typeof data.statementOwnerName === 'string' && data.statementOwnerName.trim()
              ? data.statementOwnerName.trim()
              : null;

          if (rows.length === 0) {
            return {
              rows: [],
              bankLabel,
              source,
              statementOwnerName,
              statementIncomplete: data.statementIncomplete === true,
              emptyStatement: data.emptyStatement === true,
              expectedCount:
                typeof data.expectedCount === 'number' ? data.expectedCount : undefined,
              parsedCount: typeof data.parsedCount === 'number' ? data.parsedCount : undefined,
              message:
                data.emptyStatement === true
                  ? message && message !== 'OK'
                    ? message
                    : 'Výpis neobsahuje žádné transakce'
                  : message === 'OK'
                    ? 'V PDF nebyly nalezeny transakce (očekávaný formát ČSOB, Raiffeisenbank, Komerční banka, Fio banka, Air Bank, Česká spořitelna nebo MONETA Money Bank).'
                    : message,
            };
          }

          return {
            rows,
            bankLabel,
            message,
            source,
            statementOwnerName,
            debugLines: undefined,
          };
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') {
            throw httpError(
              `Vypršel časový limit (${PARSE_BANK_PDF_TIMEOUT_MS / 1000} s) při zpracování PDF.`,
              504,
            );
          }
          throw e;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      { label: 'parse-bank-pdf-v2', attempts: 3, backoffMs: [400, 1200] },
    );
  } catch (e) {
    console.error('[import] krok 3e parse-bank-pdf-v2 failed', e);
    if (e instanceof Error && e.message === PDF_PARSE_LOGIN_REQUIRED) {
      throw e;
    }
    // Friendly message ven; raw zůstane v console
    throw new Error(logAndGetUserFacingError('parse-bank-pdf-v2', e));
  }
}
