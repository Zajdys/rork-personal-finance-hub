import { loadServiceEnv } from './env';
import { requireInternalSecret, requireUser } from './auth';
import { createAnonClient, createServiceClient } from './supabase';
import { errorMessage } from './http';
import {
  handleComplete,
  handleDisconnect,
  handleDismissError,
  handleLink,
  handleRevokeAll,
  handleSync,
  makeKontomatik,
} from './routes/handlers';

const env = loadServiceEnv();
const anon = createAnonClient(env);
const service = createServiceClient(env);
const kt = makeKontomatik(env);

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function returnHtml(redirectionId: string, deepLinkBase: string): Response {
  const deep = `${deepLinkBase}?redirectionId=${encodeURIComponent(redirectionId)}`;
  const html = `<!DOCTYPE html>
<html lang="cs"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>MoneyBuddy — návrat z banky</title>
<meta http-equiv="refresh" content="0;url=${deep}"/>
</head><body style="font-family:system-ui;padding:2rem;text-align:center">
<p>Přesměrovávám do aplikace…</p>
<p><a href="${deep}">Otevřít MoneyBuddy</a></p>
<script>location.replace(${JSON.stringify(deep)});</script>
</body></html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function dispatch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/health') {
    return Response.json({ ok: true, service: 'kontomatik-bank' });
  }

  if (req.method === 'GET' && (path === '/return' || path === '/bank/return')) {
    const redirectionId = url.searchParams.get('redirectionId') || '';
    if (!redirectionId) {
      return new Response('Missing redirectionId', { status: 400 });
    }
    return returnHtml(redirectionId, env.appDeepLink);
  }

  if (req.method === 'POST' && path === '/internal/revoke-all') {
    const gate = requireInternalSecret(req, env.internalServiceSecret);
    if (gate !== true) return gate;
    const body = await readJson(req);
    return handleRevokeAll({
      env,
      service,
      kt,
      body: { userId: String(body.userId ?? '') },
    });
  }

  const auth = await requireUser(anon, req);
  if (auth instanceof Response) return auth;
  const { user } = auth;

  if (req.method === 'POST' && path === '/bank/link') {
    return handleLink({ env, service, user, kt });
  }
  if (req.method === 'POST' && path === '/bank/complete') {
    const body = await readJson(req);
    return handleComplete({
      env,
      service,
      user,
      kt,
      body: { redirectionId: String(body.redirectionId ?? '') },
    });
  }
  if (req.method === 'POST' && path === '/bank/sync') {
    const body = await readJson(req);
    return handleSync({
      env,
      service,
      user,
      kt,
      body: { connectionId: String(body.connectionId ?? '') },
    });
  }
  if (req.method === 'POST' && path === '/bank/disconnect') {
    const body = await readJson(req);
    return handleDisconnect({
      env,
      service,
      user,
      kt,
      body: { connectionId: String(body.connectionId ?? '') },
    });
  }
  if (req.method === 'POST' && path === '/bank/dismiss-error') {
    const body = await readJson(req);
    return handleDismissError({
      service,
      user,
      body: { connectionId: String(body.connectionId ?? '') },
    });
  }

  return Response.json({ error: 'not_found' }, { status: 404 });
}

const server = Bun.serve({
  hostname: env.host,
  port: env.port,
  idleTimeout: 30,
  async fetch(req) {
    const url = new URL(req.url);
    const t0 = performance.now();
    let res: Response;
    try {
      res = await dispatch(req);
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      console.error(req.method, url.pathname, 'dispatch', ms, errorMessage(e));
      res = Response.json({ error: 'internal' }, { status: 500 });
    }
    const ms = Math.round(performance.now() - t0);
    console.log(req.method, url.pathname, res.status, `${ms}ms`);
    return res;
  },
});

console.log(`[kontomatik-bank] listening on http://${server.hostname}:${server.port}`);
