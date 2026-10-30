/**
 * Brevo sync — volá DB trigger na public.users (pg_net):
 *  - event "insert": pošle uvítací e-mail (jednou, hlídá welcome_email_sent_at)
 *  - event "consent": přidá / odebere kontakt v Brevo seznamu podle users.marketing_consent
 *
 * Deploy: supabase functions deploy brevo-sync --no-verify-jwt
 * Secrets: BREVO_API_KEY, BREVO_LIST_ID (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)
 * Auth: hlavička x-sync-secret = Vault secret 'brevo_sync_secret' (RPC public.brevo_sync_secret)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const BREVO = 'https://api.brevo.com/v3';
const SENDER = { name: 'MoneyBuddy', email: 'info@moneybuddy.cz' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function welcomeHtml(name: string | null): string {
  const hi = name ? `Ahoj ${escapeHtml(name.split(' ')[0])},` : 'Ahoj,';
  return `<!doctype html><html lang="cs"><body style="margin:0;background:#f4f2fb;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f1b2e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:linear-gradient(135deg,#1a0533,#0d1b4b);padding:28px 28px 24px;color:#fff">
<div style="font-size:22px;font-weight:800">MoneyBuddy</div>
<div style="font-size:15px;opacity:.75;margin-top:4px">Tvoje peníze, konečně v klidu.</div></td></tr>
<tr><td style="padding:28px;font-size:16px;line-height:1.55">
<p style="margin:0 0 14px">${hi}</p>
<p style="margin:0 0 14px">díky, že sis založil účet v MoneyBuddy. Tady jsou 3 věci, se kterými za pár minut uvidíš, kam ti mizí peníze:</p>
<ol style="margin:0 0 18px;padding-left:20px">
<li style="margin-bottom:8px"><b>Nahraj výpis z banky</b> (PDF nebo CSV) – výdaje se roztřídí samy.</li>
<li style="margin-bottom:8px"><b>Nastav si rozpočty</b> v záložce Plán – třeba na jídlo nebo zábavu.</li>
<li style="margin-bottom:8px"><b>Pozvi partnera do Domácnosti</b> – společné výdaje a kdo komu kolik dluží.</li>
</ol>
<p style="margin:0 0 14px">Kdyby cokoli nefungovalo nebo tě napadlo, co přidat, stačí odpovědět na tenhle e-mail. Čteme všechno.</p>
<p style="margin:0">Honza z MoneyBuddy</p></td></tr>
<tr><td style="padding:16px 28px 24px;font-size:12px;color:#8a85a0;border-top:1px solid #eee">
Tento e-mail ti přišel, protože sis vytvořil účet v aplikaci MoneyBuddy (moneybuddy.cz).</td></tr>
</table></td></tr></table></body></html>`;
}

function welcomeText(name: string | null): string {
  const hi = name ? `Ahoj ${name.split(' ')[0]},` : 'Ahoj,';
  return `${hi}

díky, že sis založil účet v MoneyBuddy. Tady jsou 3 věci, se kterými za pár minut uvidíš, kam ti mizí peníze:

1. Nahraj výpis z banky (PDF nebo CSV) – výdaje se roztřídí samy.
2. Nastav si rozpočty v záložce Plán – třeba na jídlo nebo zábavu.
3. Pozvi partnera do Domácnosti – společné výdaje a kdo komu kolik dluží.

Kdyby cokoli nefungovalo nebo tě napadlo, co přidat, stačí odpovědět na tenhle e-mail. Čteme všechno.

Honza z MoneyBuddy

Tento e-mail ti přišel, protože sis vytvořil účet v aplikaci MoneyBuddy (moneybuddy.cz).`;
}

async function brevo(path: string, apiKey: string, body: unknown): Promise<Response> {
  return await fetch(`${BREVO}${path}`, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  // Tajný klíč je jen ve Vaultu (čte ho DB trigger i tahle funkce přes service_role RPC).
  const { data: secretData } = await admin.rpc('brevo_sync_secret');
  const secret = typeof secretData === 'string' ? secretData : '';
  const got = req.headers.get('x-sync-secret') ?? '';
  if (!secret || !safeEqual(got, secret)) return json(401, { error: 'unauthorized' });

  const apiKey = Deno.env.get('BREVO_API_KEY') ?? '';
  const listId = Number(Deno.env.get('BREVO_LIST_ID') ?? '0');
  if (!apiKey) return json(500, { error: 'missing BREVO_API_KEY' });

  let payload: { event?: string; user_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'bad json' });
  }
  const uid = payload.user_id ?? '';
  if (!UUID_RE.test(uid)) return json(400, { error: 'bad user_id' });

  const { data: u, error } = await admin
    .from('users')
    .select('id, email, display_name, marketing_consent, welcome_email_sent_at')
    .eq('id', uid)
    .maybeSingle();
  if (error || !u) return json(404, { error: 'user not found' });
  const email = String(u.email ?? '').trim().toLowerCase();
  if (!email.includes('@')) return json(200, { skipped: 'no email' });
  const name = ((u.display_name as string | null) ?? '').trim() || null;

  if (payload.event === 'insert') {
    if (u.welcome_email_sent_at) return json(200, { skipped: 'already sent' });
    // Nejdřív „zamkneme“, ať při opakovaném volání neodejdou dva e-maily.
    const { data: locked } = await admin
      .from('users')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('id', uid)
      .is('welcome_email_sent_at', null)
      .select('id');
    if (!locked || locked.length === 0) return json(200, { skipped: 'race' });
    const r = await brevo('/smtp/email', apiKey, {
      sender: SENDER,
      replyTo: SENDER,
      to: [{ email, ...(name ? { name } : {}) }],
      subject: 'Tvůj účet v MoneyBuddy je připravený',
      htmlContent: welcomeHtml(name),
      textContent: welcomeText(name),
      tags: ['welcome'],
    });
    if (!r.ok) {
      await admin.from('users').update({ welcome_email_sent_at: null }).eq('id', uid);
      return json(502, { error: 'brevo send failed', status: r.status, body: await r.text() });
    }
    return json(200, { ok: true, sent: 'welcome' });
  }

  if (payload.event === 'consent') {
    if (!listId) return json(500, { error: 'missing BREVO_LIST_ID' });
    if (u.marketing_consent) {
      const r = await brevo('/contacts', apiKey, {
        email,
        attributes: name ? { FIRSTNAME: name.split(' ')[0] } : {},
        listIds: [listId],
        updateEnabled: true,
        emailBlacklisted: false,
      });
      if (!r.ok && r.status !== 204) return json(502, { error: 'brevo contact failed', body: await r.text() });
      return json(200, { ok: true, subscribed: true });
    }
    const r = await brevo(`/contacts/lists/${listId}/contacts/remove`, apiKey, { emails: [email] });
    // 400 = kontakt v seznamu není → nevadí
    if (!r.ok && r.status !== 400 && r.status !== 404) {
      return json(502, { error: 'brevo remove failed', body: await r.text() });
    }
    return json(200, { ok: true, subscribed: false });
  }

  return json(400, { error: 'unknown event' });
});
