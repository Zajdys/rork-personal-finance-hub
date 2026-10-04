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
 * 10 — 2026-10-03: digitální předplatné ve slovníku (Cursor/Anthropic/ChatGPT/
 *     Canva/Adobe/Notion/Figma/M365/PREHRAJ.TO…) → Předplatné; category_source
 *     'user' se nepřepisuje.
 * 9 — 2026-09-24: Revolut slovník — nástroje (Framer/Figma/…/OpenAI) → Služby;
 *     Ticketmaster/SMSTicket → Zábava; ZČU/školné/Skillshare → Vzdělání;
 *     Kotelna → Jídlo; Adobe/Cursor/GitHub/OpenAI přesun z Předplatné/Elektronika.
 * 8 — 2026-09-24: výdajová kategorie Investice (mimo součty); brokeri ve slovníku
 *     (ETORO, TRADING 212, XTB, PORTU, ANYCOIN, …) → Investice; Trading 212
 *     normalizace (nestripovat „212“).
 * 7 — 2026-03-24: platební brány (GOPAY/NYX/PAYPAL/PAYU/COMGATE) zachovají
 *     obchodníka za *; neslučovat na holé „GOPAY“.
 * 6 — 2026-03-24: stripTrailingTxnId (6+ číslic) + collapseKnownBrands
 *     (BOLT/UBER/WOLT/PMDP/KLEPIERRE → jeden klíč).
 * 5 — 2026-03-24: stripCzechAddressTail v normalizeMerchantKey (Air Bank Detaily
 *     s ulicí/číslem → stejný klíč jako ČSOB/KB; RADKA STEFLOVA pravidla sedí).
 * 4 — 2026-03-23: normalizeMerchantKey multi-word + strip s.r.o./pobočka/datum;
 *     transactions.merchant_key; user rules se aplikují rovností klíče.
 * 3 — 2026-03-23: false Převod (účet-only) zrušen; ATM vklad vs výběr;
 *     Původní částka z RB hlavičky; nové kategorie + slovník (Telefon, Splátky, …).
 */
export const CATEGORIZATION_VERSION = 10;

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

let inFlight: Promise<{ ran: boolean; updated: number; categoryChanged: number }> | null = null;

/**
 * Po načtení transakcí: pokud je profiles.categories_version < CATEGORIZATION_VERSION,
 * spusť přepočet a po úspěchu ulož verzi. Při chybě verzi nezvyšuj.
 * Neblokuje UI (volej bez await / void).
 */
export async function ensureCategorizationUpToDate(
  userId: string,
): Promise<{ ran: boolean; updated: number; categoryChanged: number }> {
  if (!userId) return { ran: false, updated: 0, categoryChanged: 0 };
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
        return { ran: false, updated: 0, categoryChanged: 0 };
      }

      const current =
        typeof profile?.categories_version === 'number' ? profile.categories_version : 0;

      if (current >= CATEGORIZATION_VERSION) {
        return { ran: false, updated: 0, categoryChanged: 0 };
      }

      console.log('[categorization] upgrade', {
        from: current,
        to: CATEGORIZATION_VERSION,
      });

      const result = await reclassifyExistingImportTransactions(userId);
      console.log('[categorization] reclassify done', {
        scanned: result.scanned,
        updated: result.updated,
        categoryChanged: result.categoryChanged,
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
        return { ran: false, updated: 0, categoryChanged: 0 };
      }

      console.log('[categorization] version saved', CATEGORIZATION_VERSION);
      return {
        ran: true,
        updated: result.updated,
        categoryChanged: result.categoryChanged,
      };
    } catch (e) {
      console.warn('[categorization] ensure failed', e);
      return { ran: false, updated: 0, categoryChanged: 0 };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
