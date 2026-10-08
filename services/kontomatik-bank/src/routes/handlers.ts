import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { ServiceEnv } from '../env';
import { KontomatikClient, sinceDaysAgo } from '../kontomatik/client';
import { encryptMultipleAccessId, decryptMultipleAccessId } from '../crypto/token';
import { persistAisImport } from '../import-pipeline';
import { canSyncNow } from '../sync-quota';

const CONSENT_DAYS = 180;

export function makeKontomatik(env: ServiceEnv): KontomatikClient {
  return new KontomatikClient({
    apiKey: env.kontomatikApiKey,
    baseUrl: env.kontomatikBaseUrl,
  });
}

export async function handleLink(params: {
  env: ServiceEnv;
  service: SupabaseClient;
  user: User;
  kt: KontomatikClient;
}): Promise<Response> {
  const { redirectionId, redirectionLink } = await params.kt.createRedirection({
    redirectUri: params.env.redirectUri,
    ownerExternalId: params.user.id,
    country: 'cz',
    locale: 'cz',
    accessMode: 'MULTIPLE',
  });

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { error } = await params.service.from('bank_link_sessions').upsert({
    redirection_id: redirectionId,
    user_id: params.user.id,
    status: 'created',
    expires_at: expiresAt,
  });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ redirectionId, url: redirectionLink });
}

export async function handleComplete(params: {
  env: ServiceEnv;
  service: SupabaseClient;
  user: User;
  kt: KontomatikClient;
  body: { redirectionId?: string };
}): Promise<Response> {
  const redirectionId = String(params.body.redirectionId ?? '').trim();
  if (!redirectionId) {
    return Response.json({ error: 'redirectionId_required' }, { status: 400 });
  }

  const { data: link, error: linkErr } = await params.service
    .from('bank_link_sessions')
    .select('*')
    .eq('redirection_id', redirectionId)
    .maybeSingle();
  if (linkErr) return Response.json({ error: linkErr.message }, { status: 500 });
  if (!link || link.user_id !== params.user.id) {
    return Response.json({ error: 'unknown_redirection' }, { status: 404 });
  }
  if (link.status === 'completed') {
    return Response.json({ error: 'redirection_already_completed' }, { status: 409 });
  }
  if (new Date(link.expires_at).getTime() < Date.now()) {
    await params.service
      .from('bank_link_sessions')
      .update({ status: 'expired' })
      .eq('redirection_id', redirectionId);
    return Response.json({ error: 'redirection_expired' }, { status: 410 });
  }

  const statusRes = await params.kt.redirectionStatus(redirectionId);
  const st = String(statusRes.status || '').toLowerCase();
  if (st !== 'success' && st !== 'successful') {
    console.error('[bank/complete] signin_not_success', {
      redirectionId,
      status: statusRes.status,
      // params (sessionId / multipleAccessId) jen do server logu
      params: statusRes.params,
    });
    await params.service
      .from('bank_link_sessions')
      .update({ status: st === 'expired' ? 'expired' : 'error' })
      .eq('redirection_id', redirectionId);
    return Response.json(
      { error: 'signin_not_success', status: statusRes.status },
      { status: 409 },
    );
  }

  const sessionId = statusRes.params?.sessionId;
  const sessionIdSignature = statusRes.params?.sessionIdSignature;
  const multipleAccessId = statusRes.params?.multipleAccessId ?? null;
  const target = statusRes.params?.target ?? null;
  const officialName = statusRes.params?.officialName ?? null;

  if (!sessionId || !sessionIdSignature) {
    return Response.json({ error: 'missing_session' }, { status: 502 });
  }
  if (!multipleAccessId) {
    return Response.json(
      { error: 'missing_multiple_access_id', hint: 'accessMode must be MULTIPLE' },
      { status: 502 },
    );
  }

  const commandId = await params.kt.defaultImport({
    sessionId,
    sessionIdSignature,
    since: sinceDaysAgo(90),
  });
  const imported = await params.kt.pollImportResult(commandId);
  const result = await persistAisImport({
    service: params.service,
    userId: params.user.id,
    target: imported.target ?? target,
    officialName: imported.officialName ?? officialName,
    accounts: imported.accounts,
  });

  const consentExpires = new Date();
  consentExpires.setUTCDate(consentExpires.getUTCDate() + CONSENT_DAYS);

  const { data: conn, error: connErr } = await params.service
    .from('bank_connections')
    .upsert(
      {
        user_id: params.user.id,
        provider: 'kontomatik',
        bank: result.bank,
        kontomatik_target: target,
        official_name: officialName,
        account_ibans: result.ibans,
        status: 'active',
        consent_expires_at: consentExpires.toISOString(),
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'ok',
        last_error_message: null,
        sync_window_start: new Date().toISOString(),
        sync_count_in_window: 1,
      },
      { onConflict: 'user_id,bank,kontomatik_target' },
    )
    .select('id')
    .single();
  if (connErr || !conn) {
    return Response.json({ error: connErr?.message ?? 'connection_upsert_failed' }, { status: 500 });
  }

  const { encHex, nonceHex } = encryptMultipleAccessId(
    multipleAccessId,
    params.env.tokenEncKey,
  );
  const { error: secErr } = await params.service.from('bank_connection_secrets').upsert({
    connection_id: conn.id,
    user_id: params.user.id,
    multiple_access_id_enc: encHex,
    multiple_access_id_nonce: nonceHex,
  });
  if (secErr) {
    return Response.json({ error: secErr.message }, { status: 500 });
  }

  await params.service
    .from('bank_link_sessions')
    .update({ status: 'completed' })
    .eq('redirection_id', redirectionId);

  return Response.json({
    connectionId: conn.id,
    bank: result.bank,
    inserted: result.inserted,
    enriched: result.enriched,
    review: result.review,
    consentExpiresAt: consentExpires.toISOString(),
  });
}

export async function handleSync(params: {
  env: ServiceEnv;
  service: SupabaseClient;
  user: User;
  kt: KontomatikClient;
  body: { connectionId?: string };
}): Promise<Response> {
  const connectionId = String(params.body.connectionId ?? '').trim();
  if (!connectionId) {
    return Response.json({ error: 'connectionId_required' }, { status: 400 });
  }

  const { data: conn, error } = await params.service
    .from('bank_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('user_id', params.user.id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!conn || conn.status !== 'active') {
    return Response.json({ error: 'connection_not_active' }, { status: 404 });
  }

  const quota = canSyncNow({
    sync_window_start: conn.sync_window_start,
    sync_count_in_window: conn.sync_count_in_window,
  });
  if (!quota.ok) {
    return Response.json(
      { error: 'sync_quota_exceeded', retryAfterMs: quota.retryAfterMs },
      { status: 429 },
    );
  }

  const { data: secret, error: secErr } = await params.service
    .from('bank_connection_secrets')
    .select('multiple_access_id_enc, multiple_access_id_nonce')
    .eq('connection_id', connectionId)
    .maybeSingle();
  if (secErr || !secret) {
    return Response.json({ error: secErr?.message ?? 'missing_secret' }, { status: 500 });
  }

  let multipleAccessId: string;
  try {
    multipleAccessId = decryptMultipleAccessId(
      secret.multiple_access_id_enc,
      secret.multiple_access_id_nonce,
      params.env.tokenEncKey,
    );
  } catch (e) {
    return Response.json(
      { error: 'decrypt_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  try {
    const session = await params.kt.reuseMultipleAccess(multipleAccessId);
    const commandId = await params.kt.defaultImport({
      sessionId: session.sessionId,
      sessionIdSignature: session.sessionIdSignature,
      since: sinceDaysAgo(90),
    });
    const imported = await params.kt.pollImportResult(commandId);
    const result = await persistAisImport({
      service: params.service,
      userId: params.user.id,
      target: imported.target ?? conn.kontomatik_target,
      officialName: imported.officialName ?? conn.official_name,
      accounts: imported.accounts,
    });

    await params.service
      .from('bank_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'ok',
        last_error_message: null,
        account_ibans: result.ibans.length ? result.ibans : conn.account_ibans,
        sync_window_start: quota.next.sync_window_start,
        sync_count_in_window: quota.next.sync_count_in_window,
      })
      .eq('id', connectionId);

    return Response.json({
      connectionId,
      inserted: result.inserted,
      enriched: result.enriched,
      review: result.review,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const expired = /InvalidMultipleAccessId/i.test(msg);
    await params.service
      .from('bank_connections')
      .update({
        last_sync_status: expired ? 'expired' : 'error',
        last_error_message: msg.slice(0, 500),
        status: expired ? 'expired' : conn.status,
        sync_window_start: quota.next.sync_window_start,
        sync_count_in_window: quota.next.sync_count_in_window,
      })
      .eq('id', connectionId);
    return Response.json({ error: 'sync_failed', detail: msg }, { status: 502 });
  }
}

export async function handleDisconnect(params: {
  env: ServiceEnv;
  service: SupabaseClient;
  user: User;
  kt: KontomatikClient;
  body: { connectionId?: string };
}): Promise<Response> {
  const connectionId = String(params.body.connectionId ?? '').trim();
  if (!connectionId) {
    return Response.json({ error: 'connectionId_required' }, { status: 400 });
  }

  const { data: conn } = await params.service
    .from('bank_connections')
    .select('id, user_id, status')
    .eq('id', connectionId)
    .eq('user_id', params.user.id)
    .maybeSingle();
  if (!conn) return Response.json({ error: 'not_found' }, { status: 404 });

  const { data: secret } = await params.service
    .from('bank_connection_secrets')
    .select('multiple_access_id_enc, multiple_access_id_nonce')
    .eq('connection_id', connectionId)
    .maybeSingle();

  if (secret) {
    try {
      const id = decryptMultipleAccessId(
        secret.multiple_access_id_enc,
        secret.multiple_access_id_nonce,
        params.env.tokenEncKey,
      );
      await params.kt.revokeMultipleAccess(id);
    } catch (e) {
      console.error('[disconnect] revoke failed', e);
      // continue — still revoke locally
    }
  }

  await params.service.from('bank_connection_secrets').delete().eq('connection_id', connectionId);
  await params.service
    .from('bank_connections')
    .update({
      status: 'revoked',
      last_sync_status: 'revoked',
      last_error_message: null,
    })
    .eq('id', connectionId);

  return Response.json({ ok: true, connectionId });
}

export async function handleDismissError(params: {
  service: SupabaseClient;
  user: User;
  body: { connectionId?: string };
}): Promise<Response> {
  const connectionId = String(params.body.connectionId ?? '').trim();
  if (!connectionId) {
    return Response.json({ error: 'connectionId_required' }, { status: 400 });
  }
  const { error } = await params.service
    .from('bank_connections')
    .update({ last_error_message: null })
    .eq('id', connectionId)
    .eq('user_id', params.user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function handleRevokeAll(params: {
  env: ServiceEnv;
  service: SupabaseClient;
  kt: KontomatikClient;
  body: { userId?: string };
}): Promise<Response> {
  const userId = String(params.body.userId ?? '').trim();
  if (!userId) return Response.json({ error: 'userId_required' }, { status: 400 });

  const { data: conns } = await params.service
    .from('bank_connections')
    .select('id')
    .eq('user_id', userId)
    .neq('status', 'revoked');

  let revoked = 0;
  for (const c of conns ?? []) {
    const { data: secret } = await params.service
      .from('bank_connection_secrets')
      .select('multiple_access_id_enc, multiple_access_id_nonce')
      .eq('connection_id', c.id)
      .maybeSingle();
    if (secret) {
      try {
        const id = decryptMultipleAccessId(
          secret.multiple_access_id_enc,
          secret.multiple_access_id_nonce,
          params.env.tokenEncKey,
        );
        await params.kt.revokeMultipleAccess(id);
      } catch (e) {
        console.error('[revoke-all] failed', c.id, e);
      }
    }
    await params.service.from('bank_connection_secrets').delete().eq('connection_id', c.id);
    await params.service
      .from('bank_connections')
      .update({ status: 'revoked', last_sync_status: 'revoked' })
      .eq('id', c.id);
    revoked += 1;
  }

  return Response.json({ ok: true, revoked });
}
