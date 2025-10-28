import { getDB, DB } from '@/backend/trpc/utils/db';
import type {
  Household,
  HouseholdMember,
  SharedPolicy,
  TransactionShare,
  Settlement,
  PrivacyRule,
  HouseholdInvitation,
  AuditLogEntry,
  SplitRule,
} from '@/types/household';

export async function migrateHouseholdTables(): Promise<void> {
  const db = getDB();
  
  if (db.dialect === 'postgres') {
    await db.run(`
      create table if not exists households (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        owner_user_id text not null,
        default_splits jsonb default '{}'::jsonb,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      );

      create table if not exists household_members (
        household_id uuid not null references households(id) on delete cascade,
        user_id text not null,
        user_name text not null,
        user_email text not null,
        role text not null,
        join_status text not null,
        joined_at timestamptz,
        invited_at timestamptz default now(),
        primary key(household_id, user_id)
      );
      create index if not exists idx_household_members_user_id on household_members(user_id);

      create table if not exists shared_policies (
        id uuid primary key default gen_random_uuid(),
        household_id uuid not null references households(id) on delete cascade,
        scope_type text not null,
        scope_id text not null,
        visibility text not null,
        priority integer not null default 0,
        created_at timestamptz default now()
      );
      create index if not exists idx_shared_policies_household on shared_policies(household_id);

      create table if not exists transaction_shares (
        transaction_id text not null,
        household_id uuid not null references households(id) on delete cascade,
        visibility text not null,
        split jsonb not null,
        masked_merchant boolean default false,
        override_by_user_id text,
        created_at timestamptz default now(),
        updated_at timestamptz default now(),
        primary key(transaction_id, household_id)
      );
      create index if not exists idx_transaction_shares_household on transaction_shares(household_id);

      create table if not exists settlements (
        id uuid primary key default gen_random_uuid(),
        household_id uuid not null references households(id) on delete cascade,
        from_user_id text not null,
        from_user_name text not null,
        to_user_id text not null,
        to_user_name text not null,
        amount numeric not null,
        currency text not null default 'CZK',
        method text not null,
        note text,
        settled_at timestamptz default now(),
        created_at timestamptz default now()
      );
      create index if not exists idx_settlements_household on settlements(household_id);

      create table if not exists privacy_rules (
        id uuid primary key default gen_random_uuid(),
        household_id uuid not null references households(id) on delete cascade,
        auto_private_tags jsonb default '[]'::jsonb,
        mask_merchants boolean default false,
        created_at timestamptz default now(),
        updated_at timestamptz default now()
      );
      create index if not exists idx_privacy_rules_household on privacy_rules(household_id);

      create table if not exists household_invitations (
        id uuid primary key default gen_random_uuid(),
        household_id uuid not null references households(id) on delete cascade,
        household_name text not null,
        inviter_user_id text not null,
        inviter_name text not null,
        invitee_email text not null,
        invitee_user_id text,
        status text not null default 'PENDING',
        expires_at timestamptz not null,
        created_at timestamptz default now()
      );
      create index if not exists idx_household_invitations_email on household_invitations(invitee_email);
      create index if not exists idx_household_invitations_user_id on household_invitations(invitee_user_id);

      create table if not exists household_audit_log (
        id uuid primary key default gen_random_uuid(),
        household_id uuid not null references households(id) on delete cascade,
        user_id text not null,
        user_name text not null,
        action text not null,
        resource_type text not null,
        resource_id text not null,
        changes jsonb default '{}'::jsonb,
        ip_address text,
        timestamp timestamptz default now()
      );
      create index if not exists idx_household_audit_log_household on household_audit_log(household_id);
      create index if not exists idx_household_audit_log_timestamp on household_audit_log(timestamp desc);
    `);
  } else {
    await db.run(`
      create table if not exists households (
        id text primary key,
        name text not null,
        owner_user_id text not null,
        default_splits text default '{}',
        created_at text default (datetime('now')),
        updated_at text default (datetime('now'))
      );
    `);

    await db.run(`
      create table if not exists household_members (
        household_id text not null,
        user_id text not null,
        user_name text not null,
        user_email text not null,
        role text not null,
        join_status text not null,
        joined_at text,
        invited_at text default (datetime('now')),
        primary key(household_id, user_id)
      );
    `);
    await db.run(`create index if not exists idx_household_members_user_id on household_members(user_id);`);

    await db.run(`
      create table if not exists shared_policies (
        id text primary key,
        household_id text not null,
        scope_type text not null,
        scope_id text not null,
        visibility text not null,
        priority integer not null default 0,
        created_at text default (datetime('now'))
      );
    `);
    await db.run(`create index if not exists idx_shared_policies_household on shared_policies(household_id);`);

    await db.run(`
      create table if not exists transaction_shares (
        transaction_id text not null,
        household_id text not null,
        visibility text not null,
        split text not null,
        masked_merchant integer default 0,
        override_by_user_id text,
        created_at text default (datetime('now')),
        updated_at text default (datetime('now')),
        primary key(transaction_id, household_id)
      );
    `);
    await db.run(`create index if not exists idx_transaction_shares_household on transaction_shares(household_id);`);

    await db.run(`
      create table if not exists settlements (
        id text primary key,
        household_id text not null,
        from_user_id text not null,
        from_user_name text not null,
        to_user_id text not null,
        to_user_name text not null,
        amount real not null,
        currency text not null default 'CZK',
        method text not null,
        note text,
        settled_at text default (datetime('now')),
        created_at text default (datetime('now'))
      );
    `);
    await db.run(`create index if not exists idx_settlements_household on settlements(household_id);`);

    await db.run(`
      create table if not exists privacy_rules (
        id text primary key,
        household_id text not null,
        auto_private_tags text default '[]',
        mask_merchants integer default 0,
        created_at text default (datetime('now')),
        updated_at text default (datetime('now'))
      );
    `);
    await db.run(`create index if not exists idx_privacy_rules_household on privacy_rules(household_id);`);

    await db.run(`
      create table if not exists household_invitations (
        id text primary key,
        household_id text not null,
        household_name text not null,
        inviter_user_id text not null,
        inviter_name text not null,
        invitee_email text not null,
        invitee_user_id text,
        status text not null default 'PENDING',
        expires_at text not null,
        created_at text default (datetime('now'))
      );
    `);
    await db.run(`create index if not exists idx_household_invitations_email on household_invitations(invitee_email);`);
    await db.run(`create index if not exists idx_household_invitations_user_id on household_invitations(invitee_user_id);`);

    await db.run(`
      create table if not exists household_audit_log (
        id text primary key,
        household_id text not null,
        user_id text not null,
        user_name text not null,
        action text not null,
        resource_type text not null,
        resource_id text not null,
        changes text default '{}',
        ip_address text,
        timestamp text default (datetime('now'))
      );
    `);
    await db.run(`create index if not exists idx_household_audit_log_household on household_audit_log(household_id);`);
    await db.run(`create index if not exists idx_household_audit_log_timestamp on household_audit_log(timestamp);`);
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function serializeJson(obj: any, db: DB): string | any {
  if (db.dialect === 'postgres') {
    return obj;
  }
  return JSON.stringify(obj);
}

function deserializeJson(value: any, db: DB): any {
  if (db.dialect === 'postgres') {
    return value;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

export async function createHousehold(
  name: string,
  ownerUserId: string,
  ownerName: string,
  ownerEmail: string
): Promise<Household> {
  const db = getDB();
  await migrateHouseholdTables();
  
  const id = generateId();
  const now = new Date().toISOString();
  
  await db.run(
    `INSERT INTO households (id, name, owner_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [id, name, ownerUserId, now, now]
  );
  
  await db.run(
    `INSERT INTO household_members (household_id, user_id, user_name, user_email, role, join_status, joined_at, invited_at)
     VALUES (?, ?, ?, ?, 'OWNER', 'ACTIVE', ?, ?)`,
    [id, ownerUserId, ownerName, ownerEmail, now, now]
  );
  
  await db.run(
    `INSERT INTO privacy_rules (id, household_id, auto_private_tags, mask_merchants, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
    [generateId(), id, serializeJson(['gift', 'dárek', 'present'], db), now, now]
  );
  
  return getHouseholdById(id);
}

export async function getHouseholdById(householdId: string): Promise<Household> {
  const db = getDB();
  await migrateHouseholdTables();
  
  const row = await db.get<any>(
    `SELECT * FROM households WHERE id = ?`,
    [householdId]
  );
  
  if (!row) {
    throw new Error('Household not found');
  }
  
  const members = await db.all<any>(
    `SELECT * FROM household_members WHERE household_id = ?`,
    [householdId]
  );
  
  return {
    id: row.id,
    name: row.name,
    ownerUserId: row.owner_user_id,
    members: members.map(m => ({
      userId: m.user_id,
      userName: m.user_name,
      userEmail: m.user_email,
      role: m.role,
      joinStatus: m.join_status,
      joinedAt: m.joined_at ? new Date(m.joined_at) : undefined,
      invitedAt: new Date(m.invited_at),
    })),
    defaultSplits: deserializeJson(row.default_splits, db),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function getUserHouseholds(userId: string): Promise<Household[]> {
  const db = getDB();
  await migrateHouseholdTables();
  
  const memberRows = await db.all<any>(
    `SELECT household_id FROM household_members WHERE user_id = ? AND join_status = 'ACTIVE'`,
    [userId]
  );
  
  const households: Household[] = [];
  for (const row of memberRows) {
    try {
      const household = await getHouseholdById(row.household_id);
      households.push(household);
    } catch (error) {
      console.error('Error loading household:', error);
    }
  }
  
  return households;
}

export async function inviteToHousehold(
  householdId: string,
  inviterUserId: string,
  inviterName: string,
  inviteeEmail: string,
  role: string = 'PARTNER'
): Promise<HouseholdInvitation> {
  const db = getDB();
  await migrateHouseholdTables();
  
  const household = await getHouseholdById(householdId);
  const id = generateId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  await db.run(
    `INSERT INTO household_invitations (id, household_id, household_name, inviter_user_id, inviter_name, invitee_email, status, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    [id, householdId, household.name, inviterUserId, inviterName, inviteeEmail, expiresAt.toISOString(), now.toISOString()]
  );
  
  return {
    id,
    householdId,
    householdName: household.name,
    inviterUserId,
    inviterName,
    inviteeEmail,
    status: 'PENDING',
    expiresAt,
    createdAt: now,
  };
}

export async function acceptInvitation(
  invitationId: string,
  userId: string,
  userName: string
): Promise<void> {
  const db = getDB();
  await migrateHouseholdTables();
  
  const invitation = await db.get<any>(
    `SELECT * FROM household_invitations WHERE id = ?`,
    [invitationId]
  );
  
  if (!invitation || invitation.status !== 'PENDING') {
    throw new Error('Invalid invitation');
  }
  
  if (new Date(invitation.expires_at) < new Date()) {
    throw new Error('Invitation expired');
  }
  
  const now = new Date().toISOString();
  
  await db.run(
    `INSERT OR REPLACE INTO household_members (household_id, user_id, user_name, user_email, role, join_status, joined_at, invited_at)
     VALUES (?, ?, ?, ?, 'PARTNER', 'ACTIVE', ?, ?)`,
    [invitation.household_id, userId, userName, invitation.invitee_email, now, now]
  );
  
  await db.run(
    `UPDATE household_invitations SET status = 'ACCEPTED', invitee_user_id = ? WHERE id = ?`,
    [userId, invitationId]
  );
}

export async function addAuditLog(
  householdId: string,
  userId: string,
  userName: string,
  action: string,
  resourceType: string,
  resourceId: string,
  changes: Record<string, any>
): Promise<void> {
  const db = getDB();
  await migrateHouseholdTables();
  
  const id = generateId();
  const now = new Date().toISOString();
  
  await db.run(
    `INSERT INTO household_audit_log (id, household_id, user_id, user_name, action, resource_type, resource_id, changes, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, householdId, userId, userName, action, resourceType, resourceId, serializeJson(changes, db), now]
  );
}

export async function createSharedPolicy(
  householdId: string,
  scopeType: string,
  scopeId: string,
  visibility: string,
  priority: number = 0
): Promise<SharedPolicy> {
  const db = getDB();
  await migrateHouseholdTables();
  
  const id = generateId();
  const now = new Date().toISOString();
  
  await db.run(
    `INSERT INTO shared_policies (id, household_id, scope_type, scope_id, visibility, priority, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, householdId, scopeType, scopeId, visibility, priority, now]
  );
  
  return {
    id,
    householdId,
    scope: { type: scopeType as any, id: scopeId },
    visibility: visibility as any,
    priority,
  };
}

export async function getSharedPolicies(householdId: string): Promise<SharedPolicy[]> {
  const db = getDB();
  await migrateHouseholdTables();
  
  const rows = await db.all<any>(
    `SELECT * FROM shared_policies WHERE household_id = ? ORDER BY priority DESC`,
    [householdId]
  );
  
  return rows.map(row => ({
    id: row.id,
    householdId: row.household_id,
    scope: { type: row.scope_type, id: row.scope_id },
    visibility: row.visibility,
    priority: row.priority,
  }));
}

export async function setDefaultSplit(
  householdId: string,
  categoryId: string,
  splitRule: SplitRule
): Promise<void> {
  const db = getDB();
  await migrateHouseholdTables();
  
  const household = await getHouseholdById(householdId);
  household.defaultSplits[categoryId] = splitRule;
  
  await db.run(
    `UPDATE households SET default_splits = ?, updated_at = ? WHERE id = ?`,
    [serializeJson(household.defaultSplits, db), new Date().toISOString(), householdId]
  );
}

export async function createTransactionShare(
  transactionId: string,
  householdId: string,
  visibility: string,
  split: Record<string, number>,
  overrideByUserId?: string
): Promise<TransactionShare> {
  const db = getDB();
  await migrateHouseholdTables();
  
  const now = new Date().toISOString();
  
  await db.run(
    `INSERT OR REPLACE INTO transaction_shares (transaction_id, household_id, visibility, split, override_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [transactionId, householdId, visibility, serializeJson(split, db), overrideByUserId, now, now]
  );
  
  return {
    transactionId,
    householdId,
    visibility: visibility as any,
    split,
    overrideByUserId,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

export async function createSettlement(
  householdId: string,
  fromUserId: string,
  fromUserName: string,
  toUserId: string,
  toUserName: string,
  amount: number,
  currency: string,
  method: string,
  note?: string
): Promise<Settlement> {
  const db = getDB();
  await migrateHouseholdTables();
  
  const id = generateId();
  const now = new Date().toISOString();
  
  await db.run(
    `INSERT INTO settlements (id, household_id, from_user_id, from_user_name, to_user_id, to_user_name, amount, currency, method, note, settled_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, householdId, fromUserId, fromUserName, toUserId, toUserName, amount, currency, method, note, now, now]
  );
  
  return {
    id,
    householdId,
    fromUserId,
    fromUserName,
    toUserId,
    toUserName,
    amount: { amount, currency },
    method: method as any,
    note,
    settledAt: new Date(now),
    createdAt: new Date(now),
  };
}

export async function getSettlements(householdId: string): Promise<Settlement[]> {
  const db = getDB();
  await migrateHouseholdTables();
  
  const rows = await db.all<any>(
    `SELECT * FROM settlements WHERE household_id = ? ORDER BY settled_at DESC`,
    [householdId]
  );
  
  return rows.map(row => ({
    id: row.id,
    householdId: row.household_id,
    fromUserId: row.from_user_id,
    fromUserName: row.from_user_name,
    toUserId: row.to_user_id,
    toUserName: row.to_user_name,
    amount: { amount: row.amount, currency: row.currency },
    method: row.method,
    note: row.note,
    settledAt: new Date(row.settled_at),
    createdAt: new Date(row.created_at),
  }));
}
