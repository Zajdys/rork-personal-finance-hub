import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Buffer } from "node:buffer";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as pdfjs from "npm:pdfjs-dist@4.0.379/legacy/build/pdf.mjs";
import { parseKbPdfPlainText, isKbPdfText } from "./kb-pdf-parse.ts";
import { parseFioPdfPlainText, isFioPdfText } from "./fio-pdf-parse.ts";
import { parseAirBank, airBankTransactionsToImportRows, extractAirBankStatementMeta, validateAirBankParse, isAirBankEmptyStatement } from "./airbank-pdf-parse.ts";
import {
  parseMoneta,
  monetaTransactionsToImportRows,
  extractMonetaStatementMeta,
  validateMonetaParse,
  isMonetaEmptyStatement,
  isMonetaPdfText,
} from "./moneta-pdf-parse.ts";
import {
  parseCsPdfPlainText,
  csTransactionsToImportRows,
  isCsPdfText,
} from "./cs-pdf-parse.ts";
import {
  classifyCsob,
  bucketToStoreCategory,
  csobPlainTextToLines,
  parseCsobNewFormatLines,
  parseCsobLinesToImportRows,
  NEW_CSOB_LINE_HINT,
  extractCsobStatementMeta,
  validateCsobParse,
  type ParsedImportRow,
} from "./csob-pdf-parse.ts";
import { parseRaiffeisenPdfPlainText } from "./raiffeisen-pdf-parse.ts";
import { extractStatementOwnerName } from "./statement-owner-name.ts";
import {
  classifyImportRow,
  buildCounterpartyNameByAccount,
  buildSubscriptionMerchantKeys,
  withBackfilledCounterpartyName,
} from "./classify-import-category.ts";

export { classifyCsob };

async function fetchUserCategoryRules(
  supabaseUrl: string,
  authHeader: string | null,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!authHeader || !supabaseUrl) return map;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/user_category_rules?select=merchant_key,category`,
      {
        headers: {
          apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          authorization: authHeader,
        },
      },
    );
    if (!res.ok) return map;
    const data = (await res.json()) as Array<{ merchant_key: string; category: string }>;
    for (const row of data) {
      if (row.merchant_key && row.category) map.set(row.merchant_key, row.category);
    }
  } catch {
    // ignore
  }
  return map;
}

async function fetchCrowdMerchantCache(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/merchant_categories?select=merchant_key,category&source=eq.crowd&limit=10000`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );
    if (!res.ok) return map;
    const data = (await res.json()) as Array<{ merchant_key: string; category: string }>;
    for (const row of data) {
      if (row.merchant_key && row.category) map.set(row.merchant_key, row.category);
    }
  } catch {
    // ignore
  }
  return map;
}

async function enrichRowsWithLayeredClassification(
  rows: ParsedImportRow[],
  req: Request,
): Promise<ParsedImportRow[]> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization");

  const [userRules, globalCache] = await Promise.all([
    fetchUserCategoryRules(supabaseUrl, authHeader),
    serviceKey ? fetchCrowdMerchantCache(supabaseUrl, serviceKey) : Promise.resolve(new Map()),
  ]);

  const namesByAccount = buildCounterpartyNameByAccount(rows);
  const subscriptionMerchantKeys = buildSubscriptionMerchantKeys(
    rows.map((r) => ({
      type: r.type,
      category: r.category,
      amount: r.amount,
      description: r.description,
      counterpartyName: r.counterpartyName,
    })),
  );

  return rows.map((r) => {
    const input = withBackfilledCounterpartyName(
      {
        type: r.type,
        category: r.category,
        description: r.description,
        title: r.description,
        amount: r.amount,
        counterpartyAccount: r.counterpartyAccount,
        counterpartyName: r.counterpartyName,
        merchantRaw: r.description,
        isRefund: r.isRefund,
      },
      namesByAccount,
    );
    const result = classifyImportRow(input, {
      userRules,
      globalCache,
      subscriptionMerchantKeys,
    });
    return {
      ...r,
      category:
        r.category === 'Bankovní poplatky' || r.category === 'Převod'
          ? r.category
          : result.category,
      description: result.description || r.description,
      ...(r.isRefund ? { isRefund: true } : {}),
      ...(result.counterpartyName
        ? { counterpartyName: result.counterpartyName }
        : input.counterpartyName
          ? { counterpartyName: input.counterpartyName }
          : {}),
    };
  });
}
function normalizeOneAccountNumber(s: string): string | undefined {
  const norm = s.replace(/\s+/g, '').trim();
  return norm.length > 0 ? norm : undefined;
}

/** Z requestu: `ownerAccounts: string[]` nebo pole objektů `{ number }`; volitelně legacy `ownerAccount`. */
function normalizeOwnerAccountsFromBody(body: {
  ownerAccounts?: unknown;
  ownerAccount?: string;
}): string[] {
  const nums = new Set<string>();
  const arr = body.ownerAccounts;
  if (Array.isArray(arr)) {
    for (const item of arr) {
      if (typeof item === 'string') {
        const n = normalizeOneAccountNumber(item);
        if (n) nums.add(n);
      } else if (item && typeof item === 'object') {
        const num = (item as { number?: unknown }).number;
        if (typeof num === 'string') {
          const n = normalizeOneAccountNumber(num);
          if (n) nums.add(n);
        }
      }
    }
  }
  if (typeof body.ownerAccount === 'string') {
    const n = normalizeOneAccountNumber(body.ownerAccount);
    if (n) nums.add(n);
  }
  return [...nums];
}

const corsHeaders: Record<string, string> = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

/** Routování podle extrahovaného textu — přepíše chybný bankType z klienta. */
function detectBankTypeFromExtractedText(
  text: string,
): "fio" | "kb" | "csob" | "raiffeisenbank" | "airbank" | "cs" | "moneta" | null {
  const sample = text.slice(0, 20_000);

  // 1. KB — nejspecifičtější markery
  if (isKbPdfText(sample)) return "kb";

  // 2. Fio banka — před Raiffeisenbank (unikátní BIC FIOBCZPP)
  if (isFioPdfText(sample)) return "fio";

  // 3. Raiffeisenbank — před ČSOB (RB výpis může obsahovat obecné fráze typu „Výpis z běžného účtu“)
  if (
    sample.includes("RZBCCZPP") ||
    /Raiffeisenbank\s+a\.?\s*s\.?/i.test(sample)
  ) {
    return "raiffeisenbank";
  }

  // 4. ČSOB — pouze jednoznačné identifikátory (ne obecný text výpisu)
  if (sample.includes("CEKOCZPP")) return "csob";
  if (/Československá obchodní banka/i.test(sample)) return "csob";
  if (/(?:^|[\s,;(])ČSOB(?:[\s,;.]|$)/i.test(sample)) return "csob";

  // 5. Air Bank
  if (
    sample.includes("Air Bank") ||
    sample.includes("AIRACZPP") ||
    (sample.includes("3030") && sample.includes("Výpis z"))
  ) {
    return "airbank";
  }

  // 6. MONETA Money Bank (AGBACZPP / 0600) — před obecným „Výpis z běžného účtu“
  if (isMonetaPdfText(sample)) return "moneta";

  // 7. Česká spořitelna (GIBACZP[PX] / Standard účet České spořitelny / 0800)
  if (isCsPdfText(sample)) return "cs";

  return null;
}

function normalizePdfBase64(base64: string): string {
  return base64.replace(/^data:application\/pdf;base64,/i, "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ message: "Method not allowed", rows: [], bankLabel: "" }, 405);
  }
  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
    if (!token) {
      return jsonResponse({ message: "Unauthorized", rows: [], bankLabel: "" }, 401);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ message: "Server misconfigured", rows: [], bankLabel: "" }, 500);
    }
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      console.warn("[parse-bank-pdf-v2] getUser failed", userErr?.message ?? "no user");
      return jsonResponse({ message: "Unauthorized", rows: [], bankLabel: "" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as {
      pdfBase64?: string;
      bankType?: string;
      ownerName?: string;
      ownerAccounts?: unknown;
      ownerAccount?: string;
    };
    const { pdfBase64, bankType } = body;
    const ownerName =
      typeof body.ownerName === 'string' && body.ownerName.trim() !== '' ? body.ownerName.trim() : undefined;
    const ownerAccounts = normalizeOwnerAccountsFromBody(body);
    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return jsonResponse({ message: "pdfBase64 required", rows: [], bankLabel: "" }, 400);
    }
    const allowedBankTypes = [
      "raiffeisenbank",
      "csob",
      "kb",
      "fio",
      "airbank",
      "cs",
      "moneta",
      "auto",
    ];
    if (!allowedBankTypes.includes(bankType ?? "")) {
      throw new Error(
        'bankType must be "raiffeisenbank", "csob", "kb", "fio", "airbank", "cs", "moneta", or "auto"',
      );
    }
    const buf = Buffer.from(normalizePdfBase64(pdfBase64), "base64");
    if (buf.length === 0) {
      return jsonResponse({ message: "Empty PDF buffer", rows: [], bankLabel: "" }, 400);
    }
    const uint8 = new Uint8Array(buf);
    const pdf = await pdfjs
      .getDocument({ data: uint8, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true })
      .promise;
    let fullText = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => ("str" in item ? item.str : ""))
        .join("\n");
      fullText += pageText + "\n";
    }
    const text = fullText;
    const detectedFromText = detectBankTypeFromExtractedText(text);
    // Text z pdfjs má přednost. Klientský `auto` / neznámá banka → chyba až tady.
    const hintBankType = bankType === "auto" ? null : bankType;
    const effectiveBankType = detectedFromText ?? hintBankType;
    console.log(
      "[parse-bank-pdf-v2][RAW-TEXT-FIRST-3000]",
      `bankType=${bankType}`,
      `detectedFromText=${detectedFromText}`,
      `effectiveBankType=${effectiveBankType}`,
      text.slice(0, 3000),
    );
    if (
      !effectiveBankType ||
      !["raiffeisenbank", "csob", "kb", "fio", "airbank", "cs", "moneta"].includes(effectiveBankType)
    ) {
      throw new Error(
        'Nepodařilo se rozpoznat banku z PDF. Podporované: raiffeisenbank, csob, kb, fio, airbank, cs, moneta.',
      );
    }
    let rows: ParsedImportRow[];
    let bankLabel: string;
    if (effectiveBankType === "kb") {
      rows = parseKbPdfPlainText(text, ownerAccounts, {
        classifyCsob,
        bucketToStoreCategory,
      });
      bankLabel = "Komerční banka";
    } else if (effectiveBankType === "fio") {
      rows = parseFioPdfPlainText(text, ownerAccounts, {
        classifyCsob,
        bucketToStoreCategory,
      });
      bankLabel = "Fio banka";
    } else if (effectiveBankType === "raiffeisenbank") {
      rows = parseRaiffeisenPdfPlainText(text, ownerName, ownerAccounts);
      bankLabel = "Raiffeisenbank";
    } else if (effectiveBankType === "airbank") {
      const txs = parseAirBank(text);
      rows = airBankTransactionsToImportRows(txs, {
        classifyCsob,
        bucketToStoreCategory,
      }, ownerAccounts);
      bankLabel = "Air Bank";

      if (isAirBankEmptyStatement(text, rows.length)) {
        return jsonResponse({
          rows: [],
          bankLabel,
          message: "Výpis neobsahuje žádné transakce",
          source: "airbank",
          statementOwnerName: extractStatementOwnerName(text, "airbank") ?? null,
          emptyStatement: true,
        });
      }

      const meta = extractAirBankStatementMeta(text);
      const check = validateAirBankParse(rows, meta);
      console.log("[AIRBANK-DEBUG] statement check", { meta, check, parsed: rows.length });
      if (!check.ok) {
        return jsonResponse({
          rows: [],
          bankLabel,
          message: `Výpis se nepodařilo načíst celý (načteno ${check.parsed} transakcí, očekáváno příjmy ${meta.credited ?? "?"} / výdaje ${meta.debited ?? "?"})`,
          source: "airbank",
          statementOwnerName: extractStatementOwnerName(text, "airbank") ?? null,
          statementIncomplete: true,
          expectedCount:
            meta.credited != null && meta.debited != null
              ? // počet neznáme přesně — použij parsed vs. signalizace
                check.parsed
              : check.parsed,
          parsedCount: check.parsed,
        });
      }
    } else if (effectiveBankType === "cs") {
      rows = csTransactionsToImportRows(parseCsPdfPlainText(text), {
        classifyCsob,
        bucketToStoreCategory,
      }, ownerAccounts);
      bankLabel = "Česká spořitelna";
    } else if (effectiveBankType === "moneta") {
      const txs = parseMoneta(text);
      rows = monetaTransactionsToImportRows(txs, {
        classifyCsob,
        bucketToStoreCategory,
      }, ownerAccounts);
      bankLabel = "MONETA Money Bank";

      if (isMonetaEmptyStatement(text, rows.length)) {
        return jsonResponse({
          rows: [],
          bankLabel,
          message: "Výpis neobsahuje žádné transakce",
          source: "moneta",
          statementOwnerName: extractStatementOwnerName(text, "moneta") ?? null,
          emptyStatement: true,
        });
      }

      const meta = extractMonetaStatementMeta(text);
      const check = validateMonetaParse(rows, meta);
      console.log("[MONETA-DEBUG] statement check", { meta, check, parsed: rows.length });
      if (!check.ok) {
        return jsonResponse({
          rows: [],
          bankLabel,
          message: `Výpis se nepodařilo načíst celý (načteno ${check.parsed}${
            check.expected != null ? ` z ${check.expected}` : ""
          } transakcí)`,
          source: "moneta",
          statementOwnerName: extractStatementOwnerName(text, "moneta") ?? null,
          statementIncomplete: true,
          expectedCount: check.expected ?? check.parsed,
          parsedCount: check.parsed,
        });
      }
    } else {
      const lines = csobPlainTextToLines(text);
      console.log(
        "[CSOB-DEBUG] first 30 lines:",
        lines.slice(0, 30).map((l, i) => `[${i}] ${l}`).join("\n"),
      );
      console.log("[CSOB-DEBUG] total lines:", lines.length);
      console.log(
        "[CSOB-DEBUG] lines 30-60:",
        lines.slice(30, 60).map((l, i) => `[${i + 30}] ${l}`).join("\n"),
      );
      const isNewCsobFormat = lines.some((l) => NEW_CSOB_LINE_HINT.test(l.trim()));
      console.log("[CSOB-DEBUG] isNewCsobFormat:", isNewCsobFormat);
      rows = isNewCsobFormat
        ? parseCsobNewFormatLines(lines, ownerName, ownerAccounts)
        : parseCsobLinesToImportRows(lines, ownerAccounts);
      bankLabel = "ČSOB";

      const meta = extractCsobStatementMeta(lines);
      const check = validateCsobParse(rows, meta);
      console.log("[CSOB-DEBUG] statement check", { meta, check });
      if (!check.ok) {
        return jsonResponse({
          rows: [],
          bankLabel,
          message: `Výpis se nepodařilo načíst celý (načteno ${check.parsed} z ${check.expected} transakcí)`,
          source: "csob",
          statementOwnerName: extractStatementOwnerName(text, "csob") ?? null,
          statementIncomplete: true,
          expectedCount: check.expected,
          parsedCount: check.parsed,
        });
      }
    }
    const statementOwnerName = extractStatementOwnerName(text, effectiveBankType ?? bankType ?? "");
    console.log("[parse-bank-pdf-v2] statementOwnerName:", statementOwnerName ?? "(none)");
    rows = await enrichRowsWithLayeredClassification(rows, req);
    return jsonResponse({
      rows,
      bankLabel,
      message: "OK",
      source: effectiveBankType,
      statementOwnerName: statementOwnerName ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[parse-bank-pdf-v2]", msg);
    return jsonResponse({ message: msg, rows: [], bankLabel: "" }, 500);
  }
});

/* Invoke locally (Supabase CLI):
  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/parse-bank-pdf-v2' \
    --header 'Authorization: Bearer <anon-or-service>' \
    --header 'Content-Type: application/json' \
    --data '{"pdfBase64":"<base64>","bankType":"csob"}'
*/
