/**
 * Sken účtenky / faktury přes Claude (Anthropic) — náhrada za @rork-ai/toolkit-sdk.
 *
 * POST { image_base64: string, media_type?: 'image/jpeg'|'image/png'|'image/webp', kind: 'receipt'|'invoice' }
 * Authorization: Bearer <user JWT>  (verify_jwt = true)
 * → { items: [{ title, amount, category, subcategory|null }], currency: 'CZK'|'EUR'|…, date: 'YYYY-MM-DD'|null }
 *
 * Secrets: ANTHROPIC_API_KEY (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)
 * Limit: zdarma 3 / Premium 10 skenů denně (RPC ai_scan_try_consume, tabulka ai_scan_usage).
 * Fotka se nikam neukládá — jde jen do Anthropic API a výsledek se vrátí.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const MODEL = 'claude-haiku-4-5';
const MAX_BASE64_CHARS = 7_000_000; // ~5 MB obrázek

const CATEGORIES = [
  'Jídlo', 'Bydlení', 'Úvěry', 'Auto a doprava', 'Nákupy', 'Volný čas', 'Cestování', 'Zdraví',
  'Předplatné', 'Vzdělání', 'Děti', 'Zvířata', 'Poplatky a hotovost', 'Platby lidem', 'Ostatní',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const PROMPTS: Record<'receipt' | 'invoice', string> = {
  receipt:
    'Analyzuj tuto účtenku a vrať VŠECHNY položky přes nástroj save_items.\n' +
    'Pravidla:\n' +
    '1. amount = CELKOVÁ cena položky v měně účtenky (4 ks à 50 → 200).\n' +
    '2. title = název produktu/služby (+ množství). NIKDY nedávej obchodníka do category.\n' +
    '3. Ignoruj mezisoučty, DPH, „Celkem“, zaokrouhlení a slevové řádky započítej do položky, ke které patří.\n' +
    '4. Pokud obrázek není účtenka nebo je nečitelný, vrať prázdný seznam.\n' +
    '5. Účtenka může být v jakémkoli jazyce. title napiš česky (přelož), category urči podle VÝZNAMU položky (hračky → Děti, léky → Zdraví, alkohol a jídlo → Jídlo).\n' +
    '6. currency = ISO kód měny účtenky (Kč → CZK, € → EUR, zł → PLN…); date = datum nákupu YYYY-MM-DD, pokud je čitelné, jinak null.\n' +
    'Příklady: Mléko → title „Mléko 2 ks“, category „Jídlo“, subcategory „Potraviny“; ' +
    'Benzín → „Benzín Natural 95“, „Auto a doprava“, „Benzín a nafta“.',
  invoice:
    'Analyzuj tuto fakturu a vrať VŠECHNY fakturované položky přes nástroj save_items.\n' +
    'Pravidla:\n' +
    '1. amount = CELKOVÁ cena položky v měně faktury včetně DPH (ne jednotková cena).\n' +
    '2. title = název služby/produktu; category NIKDY není dodavatel ani popis faktury.\n' +
    '3. Ignoruj mezisoučty a rekapitulaci DPH.\n' +
    '4. Pokud obrázek není faktura nebo je nečitelný, vrať prázdný seznam.\n' +
    '5. Faktura může být v jakémkoli jazyce. title napiš česky, category urči podle významu položky.\n' +
    '6. currency = ISO kód měny faktury; date = datum vystavení / zdanitelného plnění YYYY-MM-DD, nebo null.\n' +
    'Příklady: ČEZ elektřina → title „ČEZ elektřina“, category „Bydlení“, subcategory „Energie“; ' +
    'Hosting → „Webový hosting 12 měsíců“, „Nákupy“.',
};

const TOOL = {
  name: 'save_items',
  description: 'Uloží položky rozpoznané z dokladu.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Název položky včetně množství' },
            amount: { type: 'number', description: 'Celková částka položky v měně dokladu' },
            category: { type: 'string', enum: CATEGORIES },
            subcategory: {
              type: ['string', 'null'],
              description: 'Volitelná podkategorie (např. Potraviny, Benzín a nafta, Energie) nebo null',
            },
          },
          required: ['title', 'amount', 'category'],
        },
      },
      currency: { type: 'string', description: 'ISO 4217 kód měny dokladu, např. CZK, EUR, USD, PLN' },
      date: { type: ['string', 'null'], description: 'Datum nákupu YYYY-MM-DD nebo null' },
    },
    required: ['items', 'currency'],
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method' });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
  if (!apiKey) return json(503, { error: 'not configured' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const uid = userData?.user?.id;
  if (userErr || !uid) return json(401, { error: 'unauthorized' });

  let body: { image_base64?: string; media_type?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad json' });
  }
  const kind = body.kind === 'invoice' ? 'invoice' : 'receipt';
  const data = String(body.image_base64 ?? '').replace(/^data:[^,]+,/, '');
  const mediaType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(String(body.media_type))
    ? String(body.media_type)
    : 'image/jpeg';
  if (data.length < 100) return json(400, { error: 'image too small' });
  if (data.length > MAX_BASE64_CHARS) return json(413, { error: 'image too large' });

  const { data: used, error: limitErr } = await admin.rpc('ai_scan_try_consume', { p_user: uid });
  if (limitErr) return json(500, { error: 'limit check failed' });
  if (typeof used === 'number' && used < 0) return json(429, { error: 'daily limit', limit: -used });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55_000);
  let resp: Response;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'save_items' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
              { type: 'text', text: PROMPTS[kind] },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    return json(504, { error: (e as Error)?.name === 'AbortError' ? 'timeout' : 'upstream fetch failed' });
  }
  clearTimeout(timer);

  if (!resp.ok) {
    const txt = await resp.text();
    console.error('[scan-receipt] anthropic', resp.status, txt.slice(0, 500));
    return json(502, { error: 'ai failed', status: resp.status });
  }
  const out = await resp.json();
  const toolUse = (out?.content ?? []).find((c: { type?: string }) => c?.type === 'tool_use');
  const rawItems = Array.isArray(toolUse?.input?.items) ? toolUse.input.items : [];
  const items = rawItems
    .map((it: Record<string, unknown>) => ({
      title: String(it.title ?? '').trim().slice(0, 120),
      amount: Math.round(Math.abs(Number(it.amount) || 0) * 100) / 100,
      category: CATEGORIES.includes(String(it.category)) ? String(it.category) : 'Ostatní',
      subcategory: typeof it.subcategory === 'string' && it.subcategory.trim() ? it.subcategory.trim().slice(0, 60) : null,
    }))
    .filter((it: { amount: number; title: string }) => it.amount > 0 && it.title);

  const rawCcy = String(toolUse?.input?.currency ?? 'CZK').trim().toUpperCase();
  const currency = /^[A-Z]{3}$/.test(rawCcy) ? rawCcy : 'CZK';
  const rawDate = String(toolUse?.input?.date ?? '');
  let date: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    const d = new Date(rawDate + 'T12:00:00Z');
    const now = Date.now();
    // jen rozumné datum: ne v budoucnu, max. rok zpátky
    if (!isNaN(d.getTime()) && d.getTime() <= now + 86_400_000 && d.getTime() >= now - 366 * 86_400_000) date = rawDate;
  }

  return json(200, { items, currency, date });
});
