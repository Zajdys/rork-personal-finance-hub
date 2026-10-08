import { XMLParser } from 'fast-xml-parser';
import type { AisMoneyTx } from './fingerprint';
import type { AisAccount } from '../map/transactions';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  isArray: (name) =>
    name === 'account' ||
    name === 'moneyTransaction' ||
    name === 'creditCard' ||
    name === 'owner',
});

function asObj(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function asArr(v: unknown): unknown[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    const s = String(v).trim();
    return s || null;
  }
  const o = asObj(v);
  if (o && '#text' in o) return text(o['#text']);
  return null;
}

function num(v: unknown): number | null {
  const t = text(v);
  if (t == null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseMoneyTx(raw: unknown): AisMoneyTx {
  const o = asObj(raw) ?? {};
  return {
    transactionOn: text(o.transactionOn),
    bookedOn: text(o.bookedOn),
    currencyAmount: num(o.currencyAmount) ?? 0,
    currencyBalance: num(o.currencyBalance),
    partyIban: text(o.partyIban),
    party: text(o.party),
    title: text(o.title),
    kind: text(o.kind),
    status: text(o.status),
    variableSymbol: text(o.variableSymbol),
    constantSymbol: text(o.constantSymbol),
  };
}

function collectAccounts(node: unknown, out: AisAccount[]): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const n of node) collectAccounts(n, out);
    return;
  }
  const o = asObj(node);
  if (!o) return;

  for (const acc of asArr(o.account)) {
    const a = asObj(acc);
    if (!a) continue;
    const iban = text(a.iban);
    if (!iban) continue;
    const moneyRoot = asObj(a.moneyTransactions) ?? a;
    const txs = asArr(
      moneyRoot && 'moneyTransaction' in moneyRoot
        ? moneyRoot.moneyTransaction
        : a.moneyTransaction,
    ).map(parseMoneyTx);
    out.push({
      iban,
      name: text(a.name) ?? text(a.friendlyName),
      currencyName: text(a.currencyName),
      moneyTransactions: txs,
    });
  }

  // Descend common wrappers
  for (const key of ['data', 'owner', 'accounts', 'command', 'reply', 'result']) {
    if (key in o) collectAccounts(o[key], out);
  }
}

export type ParsedImportResult = {
  /** HTTP-ish reply/@status (např. "200 OK") — NENÍ finální stav importu. */
  commandStatus: string;
  /** command/@state: setup | in_progress | successful | error | fatal */
  commandState: string | null;
  commandId: string | null;
  accounts: AisAccount[];
  target: string | null;
  officialName: string | null;
  raw: string;
};

/** Parse Default Import / Get Import Result XML. */
export function parseImportResultXml(xml: string): ParsedImportResult {
  const root = parser.parse(xml) as Record<string, unknown>;
  const reply = asObj(root.reply) ?? root;
  const commandStatus =
    text(reply['@_status']) || text(reply.status) || 'unknown';

  const command = asObj(reply.command);
  const commandId =
    text(command?.['@_id']) || text(reply.id) || text(command?.id) || null;
  const commandState = text(command?.['@_state']) || text(command?.state) || null;
  const commandTarget = text(command?.['@_target']) || null;
  const commandInstitution = text(command?.['@_institution']) || null;

  const accounts: AisAccount[] = [];
  collectAccounts(reply, accounts);
  // Also scan whole tree if nested oddly
  if (accounts.length === 0) collectAccounts(root, accounts);

  let target: string | null = commandTarget;
  let officialName: string | null = null;
  const walkTarget = (node: unknown): void => {
    if (officialName || node == null) return;
    if (Array.isArray(node)) {
      for (const n of node) walkTarget(n);
      return;
    }
    const o = asObj(node);
    if (!o) return;
    if ('@_officialName' in o) {
      officialName = text(o['@_officialName']) ?? officialName;
      if (!target) target = text(o['@_name']) ?? target;
    }
    for (const v of Object.values(o)) walkTarget(v);
  };
  walkTarget(root);
  if (!target) target = text(reply.target) || commandInstitution;
  if (!officialName) officialName = text(reply.officialName);

  return {
    commandStatus,
    commandState,
    commandId,
    accounts,
    target,
    officialName,
    raw: xml,
  };
}

export function parseMockSessionXml(xml: string): {
  sessionId: string;
  sessionIdSignature: string;
  multipleAccessId: string | null;
} {
  const root = parser.parse(xml) as Record<string, unknown>;
  const reply = asObj(root.reply) ?? root;
  const session = asObj(reply.session);
  const sessionId = text(session?.['@_id']) || '';
  const sessionIdSignature = text(session?.['@_signature']) || '';
  const multipleAccessId =
    text(session?.multipleAccessId) || text(reply.multipleAccessId) || null;
  if (!sessionId || !sessionIdSignature) {
    throw new Error(`mock-session parse failed: ${xml.slice(0, 400)}`);
  }
  return { sessionId, sessionIdSignature, multipleAccessId };
}

export function parseReuseXml(xml: string): {
  sessionId: string;
  sessionIdSignature: string;
} {
  const root = parser.parse(xml) as Record<string, unknown>;
  const reply = asObj(root.reply) ?? root;
  const session = asObj(reply.session);
  const sessionId = text(session?.['@_id']) || '';
  const sessionIdSignature = text(session?.['@_signature']) || '';
  if (!sessionId || !sessionIdSignature) {
    throw new Error(`reuse-multiple-access parse failed: ${xml.slice(0, 400)}`);
  }
  return { sessionId, sessionIdSignature };
}

export function parseCommandAcceptedXml(xml: string): string {
  const root = parser.parse(xml) as Record<string, unknown>;
  const reply = asObj(root.reply) ?? root;
  const command = asObj(reply.command);
  const id = text(command?.['@_id']) || text(command?.id);
  if (!id) throw new Error(`default-import: missing command id: ${xml.slice(0, 400)}`);
  return id;
}

/** Finální úspěch = command/@state successful (ne reply status 200 OK). */
export function isCommandSuccessful(parsed: {
  commandState: string | null;
  commandStatus: string;
}): boolean {
  const state = (parsed.commandState || '').toLowerCase();
  if (state === 'successful' || state === 'success') return true;
  // Legacy fallback only when state missing
  if (!parsed.commandState) {
    const s = parsed.commandStatus.toLowerCase();
    return s.includes('successful');
  }
  return false;
}

export function isCommandInProgress(parsed: {
  commandState: string | null;
  commandStatus: string;
}): boolean {
  const state = (parsed.commandState || '').toLowerCase();
  if (state === 'setup' || state === 'in_progress' || state === 'progress') {
    return true;
  }
  if (!parsed.commandState) {
    const s = parsed.commandStatus.toLowerCase();
    return s.includes('202') || s.includes('setup') || s.includes('progress');
  }
  return false;
}

export function isCommandFailed(parsed: {
  commandState: string | null;
  commandStatus: string;
}): boolean {
  const state = (parsed.commandState || '').toLowerCase();
  if (state === 'error' || state === 'fatal') return true;
  if (!parsed.commandState) {
    const s = parsed.commandStatus.toLowerCase();
    return s.includes('error') || s.includes('fatal');
  }
  return false;
}
