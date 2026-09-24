/**
 * Verzování automatické kategorizace.
 *
 * Při změně slovníku / keywords / pravidel zvedni CATEGORIZATION_VERSION
 * a doplň komentář (datum + co se změnilo). Po přihlášení appka porovná
 * s user_profiles.categories_version a případně přepočítá na pozadí.
 */
import { reclassifyExistingImportTransactions } from '@/lib/reclassify-import-categories';
import { supabase } from '@/lib/supabase';
import type { ClassifyImportResult } from '@/lib/classify-import-category';

/**
 * 6 — 2026-03-24: stripTrailingTxnId (6+ číslic) + collapseKnownBrands
 *     (BOLT/UBER/WOLT/PAYPAL/GOPAY/NYX/PMDP/KLEPIERRE → jeden klíč).
 * 5 — 2026-03-24: stripCzechAddressTail v normalizeMerchantKey (Air Bank Detaily
 *     s ulicí/číslem → stejný klíč jako ČSOB/KB; RADKA STEFLOVA pravidla sedí).
 * 4 — 2026-03-23: normalizeMerchantKey multi-word + strip s.r.o./pobočka/datum;
 *     transactions.merchant_key; user rules se aplikují rovností klíče.
 * 3 — 2026-03-23: false Převod (účet-only) zrušen; ATM vklad vs výběr;
 *     Původní částka z RB hlavičky; nové kategorie + slovník (Telefon, Splátky, …).
 */
export const CATEGORIZATION_VERSION = 6;

export type CategorySource =
  | 'user'
  | 'crowd'
  | 'dictionary'
  | 'keyword'
  | 'transfer'
  | 'import';

export function mapClassifySourceToCategorySource(
  source: ClassifyImportResult['source'],
): CategorySource {
  switch (source) {
    case 'user_rule':
      return 'user';
    case 'crowd':
      return 'crowd';
    case 'dictionary':
      return 'dictionary';
    case 'keywords':
      return 'keyword';
    case 'transfer':
      return 'transfer';
    case 'special':
    case 'subscription':
    case 'unknown_hook':
    case 'fallback':
    default:
      return 'import';
  }
}

let inFlight: Promise<{ ran: boolean; updated: number }> | null = null;

/**
 * Po načtení transakcí: pokud je profiles.categories_version < CATEGORIZATION_VERSION,
 * spusť přepočet a po úspěchu ulož verzi. Při chybě verzi nezvyšuj.
 * Neblokuje UI (volej bez await / void).
 */
export async function ensureCategorizationUpToDate(
  userId: string,
): Promise<{ ran: boolean; updated: number }> {
  if (!userId) return { ran: false, updated: 0 };
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { data: profile, error: fetchErr } = await supabase
        .from('user_profiles')
        .select('categories_version')
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchErr) {
        console.warn('[categorization] fetch version failed', fetchErr.message);
        return { ran: false, updated: 0 };
      }

      const current =
        typeof profile?.categories_version === 'number' ? profile.categories_version : 0;

      if (current >= CATEGORIZATION_VERSION) {
        return { ran: false, updated: 0 };
      }

      console.log('[categorization] upgrade', {
        from: current,
        to: CATEGORIZATION_VERSION,
      });

      const result = await reclassifyExistingImportTransactions(userId);
      console.log('[categorization] reclassify done', {
        scanned: result.scanned,
        updated: result.updated,
      });

      const { error: upsertErr } = await supabase.from('user_profiles').upsert(
        {
          id: userId,
          user_id: userId,
          categories_version: CATEGORIZATION_VERSION,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

      if (upsertErr) {
        console.warn('[categorization] save version failed', upsertErr.message);
        return { ran: false, updated: 0 };
      }

      console.log('[categorization] version saved', CATEGORIZATION_VERSION);
      return { ran: true, updated: result.updated };
    } catch (e) {
      console.warn('[categorization] ensure failed', e);
      return { ran: false, updated: 0 };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
