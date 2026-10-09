import { fetchWithTimeout } from '../http';
import {
  isCommandFailed,
  isCommandSuccessful,
  parseCommandAcceptedXml,
  parseImportResultXml,
  parseMockSessionXml,
  parseReuseXml,
  type ParsedImportResult,
} from './xml';

export type KontomatikClientOptions = {
  apiKey: string;
  baseUrl: string;
};

function formBody(data: Record<string, string>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) p.set(k, v);
  return p.toString();
}

export class KontomatikClient {
  constructor(private readonly opts: KontomatikClientOptions) {}

  private headers(json = false): HeadersInit {
    const h: Record<string, string> = {
      'X-Api-Key': this.opts.apiKey,
    };
    if (json) h['Content-Type'] = 'application/json';
    else h['Content-Type'] = 'application/x-www-form-urlencoded';
    return h;
  }

  async createRedirection(body: {
    redirectUri: string;
    ownerExternalId: string;
    country?: string;
    locale?: string;
    accessMode?: 'MULTIPLE' | 'MIXED' | 'SINGLE';
  }): Promise<{ redirectionId: string; redirectionLink: string }> {
    const payload = {
      redirectUri: body.redirectUri,
      ownerExternalId: body.ownerExternalId,
      country: body.country ?? 'cz',
      locale: body.locale ?? 'cz',
      psd2: { accessMode: body.accessMode ?? 'MULTIPLE' },
    };
    const res = await fetchWithTimeout(
      'kontomatik.signin.redirection',
      `${this.opts.baseUrl}/v1/signin/redirection`,
      {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify(payload),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`signin/redirection ${res.status}: ${text.slice(0, 500)}`);
    }
    const json = JSON.parse(text) as {
      redirectionId?: string;
      redirectionLink?: string;
    };
    if (!json.redirectionId || !json.redirectionLink) {
      throw new Error(`signin/redirection bad body: ${text.slice(0, 500)}`);
    }
    return {
      redirectionId: json.redirectionId,
      redirectionLink: json.redirectionLink,
    };
  }

  async redirectionStatus(redirectionId: string): Promise<{
    status: string;
    params: {
      sessionId?: string;
      sessionIdSignature?: string;
      multipleAccessId?: string | null;
      target?: string;
      officialName?: string;
      exception?: string;
    };
  }> {
    const url = new URL(`${this.opts.baseUrl}/v1/signin/redirection-status`);
    url.searchParams.set('redirectionId', redirectionId);
    const res = await fetchWithTimeout('kontomatik.signin.redirection-status', url, {
      headers: { 'X-Api-Key': this.opts.apiKey },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`redirection-status ${res.status}: ${text.slice(0, 500)}`);
    }
    return JSON.parse(text) as {
      status: string;
      params: {
        sessionId?: string;
        sessionIdSignature?: string;
        multipleAccessId?: string | null;
        target?: string;
        officialName?: string;
        exception?: string;
      };
    };
  }

  async defaultImport(params: {
    sessionId: string;
    sessionIdSignature: string;
    since: string;
  }): Promise<string> {
    const res = await fetchWithTimeout(
      'kontomatik.default-import',
      `${this.opts.baseUrl}/v1/command/default-import.xml`,
      {
        method: 'POST',
        headers: this.headers(false),
        body: formBody({
          sessionId: params.sessionId,
          sessionIdSignature: params.sessionIdSignature,
          since: params.since,
        }),
      },
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`default-import ${res.status}: ${text.slice(0, 500)}`);
    return parseCommandAcceptedXml(text);
  }

  async getImportResult(commandId: string): Promise<ParsedImportResult> {
    const res = await fetchWithTimeout(
      'kontomatik.command.get',
      `${this.opts.baseUrl}/v1/command/${encodeURIComponent(commandId)}.xml`,
      { headers: { 'X-Api-Key': this.opts.apiKey } },
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`command/${commandId} ${res.status}: ${text.slice(0, 500)}`);
    return parseImportResultXml(text);
  }

  async pollImportResult(
    commandId: string,
    opts?: { intervalMs?: number; maxAttempts?: number },
  ): Promise<ParsedImportResult> {
    const intervalMs = opts?.intervalMs ?? 3000;
    const maxAttempts = opts?.maxAttempts ?? 60;
    let last: ParsedImportResult | null = null;
    for (let i = 0; i < maxAttempts; i++) {
      last = await this.getImportResult(commandId);
      if (isCommandSuccessful(last)) {
        return last;
      }
      if (isCommandFailed(last)) {
        throw new Error(
          `import failed: state=${last.commandState} status=${last.commandStatus} ${last.raw.slice(0, 400)}`,
        );
      }
      await Bun.sleep(intervalMs);
    }
    throw new Error(
      `import poll timeout (${commandId}): state=${last?.commandState ?? 'n/a'} status=${last?.commandStatus ?? 'n/a'}`,
    );
  }

  async reuseMultipleAccess(multipleAccessId: string): Promise<{
    sessionId: string;
    sessionIdSignature: string;
  }> {
    const res = await fetchWithTimeout(
      'kontomatik.reuse-multiple-access',
      `${this.opts.baseUrl}/v1/command/reuse-multiple-access.xml`,
      {
        method: 'POST',
        headers: this.headers(false),
        body: formBody({ multipleAccessId }),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`reuse-multiple-access ${res.status}: ${text.slice(0, 500)}`);
    }
    return parseReuseXml(text);
  }

  async revokeMultipleAccess(multipleAccessId: string): Promise<void> {
    const res = await fetchWithTimeout(
      'kontomatik.delete-multiple-access',
      `${this.opts.baseUrl}/v1/command/delete-multiple-access.xml`,
      {
        method: 'POST',
        headers: this.headers(false),
        body: formBody({ multipleAccessId }),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`delete-multiple-access ${res.status}: ${text.slice(0, 500)}`);
    }
  }

  async createMockSession(params: {
    login: string;
    country: string;
    ownerExternalId: string;
    multipleAccess?: boolean;
    ownerEmail?: string;
  }): Promise<{
    sessionId: string;
    sessionIdSignature: string;
    multipleAccessId: string | null;
  }> {
    const data: Record<string, string> = {
      login: params.login,
      country: params.country,
      ownerExternalId: params.ownerExternalId,
      multipleAccess: params.multipleAccess ? 'true' : 'false',
    };
    if (params.ownerEmail) data.ownerEmail = params.ownerEmail;
    const res = await fetchWithTimeout(
      'kontomatik.mock-session',
      `${this.opts.baseUrl}/v1/mock-session.xml`,
      {
        method: 'POST',
        headers: this.headers(false),
        body: formBody(data),
      },
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`mock-session ${res.status}: ${text.slice(0, 500)}`);
    return parseMockSessionXml(text);
  }
}

/** since = today − 90 days (YYYY-MM-DD). */
export function sinceDaysAgo(days: number, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
