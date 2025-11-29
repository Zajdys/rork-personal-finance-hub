import initSqlJs, { Database } from 'sql.js';
import type { SqlJsStatic } from 'sql.js';
import { Client as PGClient } from 'pg';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let sqlPromise: Promise<SqlJsStatic> | null = null;
let sqlDb: Database | null = null;
let pgClient: PGClient | null = null;
let supabase: SupabaseClient | null = null;
let initialized = false;

export type DB = {
  dialect: 'sqljs' | 'postgres' | 'supabase';
  run: (sql: string, params?: any[]) => Promise<void>;
  all: <T = any>(sql: string, params?: any[]) => Promise<T[]>;
  get: <T = any>(sql: string, params?: any[]) => Promise<T | undefined>;
  supabase?: SupabaseClient;
};

export async function getDb(): Promise<DB> {
  await initDb();
  return getDB();
}

async function initDb(): Promise<void> {
  if (!initialized) {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const pgUrl = process.env.DATABASE_URL;
    
    if (supabaseUrl && supabaseKey) {
      supabase = createClient(supabaseUrl, supabaseKey);
      console.log('[DB] Using Supabase');
    } else if (pgUrl) {
      pgClient = new PGClient({ connectionString: pgUrl, ssl: getSSL() });
      console.log('[DB] Using PostgreSQL');
    } else {
      if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: (f: string) => `https://sql.js.org/dist/${f}` });
      console.log('[DB] Using SQL.js');
    }
    initialized = true;
  }
  
  if (supabase) {
    await ensureSupabase();
  } else if (pgClient) {
    await ensurePg();
  } else {
    await ensureSqlJs();
  }
}

export function getDB(): DB {
  if (!initialized) {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const pgUrl = process.env.DATABASE_URL;
    
    if (supabaseUrl && supabaseKey) {
      supabase = createClient(supabaseUrl, supabaseKey);
      console.log('[DB] Using Supabase');
    } else if (pgUrl) {
      pgClient = new PGClient({ connectionString: pgUrl, ssl: getSSL() });
      console.log('[DB] Using PostgreSQL');
    } else {
      if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: (f: string) => `https://sql.js.org/dist/${f}` });
      console.log('[DB] Using SQL.js');
    }
    initialized = true;
  }

  const run = async (sql: string, params: any[] = []) => {
    if (supabase) {
      await ensureSupabase();
      const query = replacePlaceholders(sqlToPg(sql), params);
      const { error } = await (supabase as any).rpc('exec_sql', { sql: query });
      if (error) {
        console.error('[DB] Supabase run error:', error);
        throw error;
      }
    } else if (pgClient) {
      await ensurePg();
      await pgClient!.query(sqlToPg(sql), params);
    } else {
      await ensureSqlJs();
      sqlDb!.run(sql, params);
    }
  };

  const all = async <T = any>(sql: string, params: any[] = []) => {
    if (supabase) {
      await ensureSupabase();
      const query = replacePlaceholders(sqlToPg(sql), params);
      const { data, error } = await (supabase as any).rpc('exec_sql', { sql: query });
      if (error) {
        console.error('[DB] Supabase all error:', error);
        throw error;
      }
      return (data || []) as T[];
    } else if (pgClient) {
      await ensurePg();
      const res = await pgClient!.query(sqlToPg(sql), params);
      return res.rows as T[];
    } else {
      await ensureSqlJs();
      const stmt = sqlDb!.prepare(sql);
      stmt.bind(params);
      const rows: any[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows as T[];
    }
  };

  const get = async <T = any>(sql: string, params: any[] = []) => {
    const rows = await all<T>(sql, params);
    return rows[0];
  };

  return {
    dialect: supabase ? 'supabase' : pgClient ? 'postgres' : 'sqljs',
    run,
    all,
    get,
    supabase: supabase || undefined,
  } as DB;
}

function getSSL() {
  return process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false };
}

async function ensurePg() {
  if (!pgClient) return;
  if ((pgClient as any)._connecting || (pgClient as any)._connected) return;
  await pgClient.connect();
  await migratePg(pgClient);
}

async function ensureSqlJs() {
  if (sqlDb) return;
  const SQL = await (sqlPromise as Promise<SqlJsStatic>);
  sqlDb = new SQL.Database();
  migrateSqlJs(sqlDb!);
}

async function ensureSupabase() {
  if (!supabase) return;
  await migrateSupabase(supabase);
}

async function migratePg(client: PGClient) {
  await client.query(`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      email text unique not null,
      password_hash text not null,
      username text unique,
      display_name text,
      created_at timestamptz default now()
    );
    create table if not exists sessions (
      token text primary key,
      user_id uuid not null references users(id) on delete cascade,
      created_at timestamptz default now(),
      expires_at timestamptz
    );
    create table if not exists subscriptions (
      user_id uuid primary key references users(id) on delete cascade,
      active boolean default false,
      expires_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create table if not exists transactions (
      id serial primary key,
      user_id text not null,
      broker text,
      raw_hash text not null,
      raw text not null,
      isin text,
      ticker text,
      symbol text,
      name text,
      type text not null,
      qty numeric not null,
      price numeric default 0,
      fee numeric default 0,
      currency text default 'EUR',
      date timestamptz not null,
      created_at timestamptz default now(),
      unique(user_id, raw_hash)
    );
    create table if not exists positions (
      user_id text not null,
      symbol text not null,
      name text not null,
      isin text,
      qty numeric not null,
      avg_cost numeric not null,
      currency text not null,
      market_price numeric,
      market_value_czk numeric not null,
      unrealized_pnl_czk numeric not null,
      base_currency text default 'CZK',
      market_value_base numeric,
      unrealized_pnl_base numeric,
      updated_at timestamptz default now(),
      primary key(user_id, symbol)
    );
    create table if not exists fx_rates (
      id serial primary key,
      date date not null,
      base text not null,
      quote text not null,
      rate numeric not null,
      unique(date, base, quote)
    );
    create table if not exists friendships (
      id serial primary key,
      user_id text not null,
      friend_id text not null,
      status text not null default 'pending',
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique(user_id, friend_id)
    );
    create index if not exists idx_friendships_user_id on friendships(user_id);
    create index if not exists idx_friendships_friend_id on friendships(friend_id);
    create index if not exists idx_friendships_status on friendships(status);
    create table if not exists daily_login (
      userId text primary key,
      lastLoginDate text not null,
      loginStreak integer not null default 0,
      totalXp integer not null default 0,
      level integer not null default 1,
      createdAt timestamptz default now(),
      updatedAt timestamptz default now()
    );
  `);
}

function migrateSqlJs(db: Database) {
  db.run(`
    create table if not exists users (
      id text primary key,
      email text unique not null,
      password_hash text not null,
      username text unique,
      display_name text,
      created_at text default (datetime('now'))
    );
  `);
  db.run(`
    create table if not exists sessions (
      token text primary key,
      user_id text not null,
      created_at text default (datetime('now')),
      expires_at text
    );
  `);
  db.run(`
    create table if not exists subscriptions (
      user_id text primary key,
      active integer default 0,
      expires_at text,
      created_at text default (datetime('now')),
      updated_at text default (datetime('now'))
    );
  `);
  db.run(`
    create table if not exists transactions (
      id integer primary key autoincrement,
      user_id text not null,
      broker text,
      raw_hash text not null,
      raw text not null,
      isin text,
      ticker text,
      symbol text,
      name text,
      type text not null,
      qty real not null,
      price real default 0,
      fee real default 0,
      currency text default 'EUR',
      date text not null,
      created_at text default (datetime('now')),
      unique(user_id, raw_hash)
    );
  `);
  db.run(`
    create table if not exists positions (
      user_id text not null,
      symbol text not null,
      name text not null,
      isin text,
      qty real not null,
      avg_cost real not null,
      currency text not null,
      market_price real,
      market_value_czk real not null,
      unrealized_pnl_czk real not null,
      base_currency text default 'CZK',
      market_value_base real,
      unrealized_pnl_base real,
      updated_at text default (datetime('now')),
      primary key(user_id, symbol)
    );
  `);
  db.run(`
    create table if not exists fx_rates (
      id integer primary key autoincrement,
      date text not null,
      base text not null,
      quote text not null,
      rate real not null,
      unique(date, base, quote)
    );
  `);
  db.run(`
    create table if not exists friendships (
      id integer primary key autoincrement,
      user_id text not null,
      friend_id text not null,
      status text not null default 'pending',
      created_at text default (datetime('now')),
      updated_at text default (datetime('now')),
      unique(user_id, friend_id)
    );
  `);
  db.run(`create index if not exists idx_friendships_user_id on friendships(user_id);`);
  db.run(`create index if not exists idx_friendships_friend_id on friendships(friend_id);`);
  db.run(`create index if not exists idx_friendships_status on friendships(status);`);
  db.run(`
    create table if not exists daily_login (
      userId text primary key,
      lastLoginDate text not null,
      loginStreak integer not null default 0,
      totalXp integer not null default 0,
      level integer not null default 1,
      createdAt text default (datetime('now')),
      updatedAt text default (datetime('now'))
    );
  `);
}

function sqlToPg(sql: string) {
  return sql.replace(/datetime\('now'\)/g, 'now()');
}

function replacePlaceholders(sql: string, params: any[]): string {
  let result = sql;
  params.forEach((param, index) => {
    const placeholder = `${index + 1}`;
    const value = typeof param === 'string' ? `'${param.replace(/'/g, "''")}'` : param;
    result = result.replace(placeholder, String(value));
  });
  return result;
}

async function migrateSupabase(client: SupabaseClient) {
  console.log('[DB] Supabase tables should be created via Supabase Dashboard SQL Editor');
  console.log('[DB] Run the following SQL in your Supabase SQL Editor:');
  console.log(`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      email text unique not null,
      password_hash text not null,
      username text unique,
      display_name text,
      created_at timestamptz default now()
    );
    
    create table if not exists sessions (
      token text primary key,
      user_id uuid not null references users(id) on delete cascade,
      created_at timestamptz default now(),
      expires_at timestamptz
    );
    
    create table if not exists subscriptions (
      user_id uuid primary key references users(id) on delete cascade,
      active boolean default false,
      expires_at timestamptz,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    
    create table if not exists transactions (
      id serial primary key,
      user_id text not null,
      broker text,
      raw_hash text not null,
      raw text not null,
      isin text,
      ticker text,
      symbol text,
      name text,
      type text not null,
      qty numeric not null,
      price numeric default 0,
      fee numeric default 0,
      currency text default 'EUR',
      date timestamptz not null,
      created_at timestamptz default now(),
      unique(user_id, raw_hash)
    );
    
    create table if not exists positions (
      user_id text not null,
      symbol text not null,
      name text not null,
      isin text,
      qty numeric not null,
      avg_cost numeric not null,
      currency text not null,
      market_price numeric,
      market_value_czk numeric not null,
      unrealized_pnl_czk numeric not null,
      base_currency text default 'CZK',
      market_value_base numeric,
      unrealized_pnl_base numeric,
      updated_at timestamptz default now(),
      primary key(user_id, symbol)
    );
    
    create table if not exists fx_rates (
      id serial primary key,
      date date not null,
      base text not null,
      quote text not null,
      rate numeric not null,
      unique(date, base, quote)
    );
    
    create table if not exists friendships (
      id serial primary key,
      user_id text not null,
      friend_id text not null,
      status text not null default 'pending',
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      unique(user_id, friend_id)
    );
    
    create index if not exists idx_friendships_user_id on friendships(user_id);
    create index if not exists idx_friendships_friend_id on friendships(friend_id);
    create index if not exists idx_friendships_status on friendships(status);
    
    create table if not exists daily_login (
      userId text primary key,
      lastLoginDate text not null,
      loginStreak integer not null default 0,
      totalXp integer not null default 0,
      level integer not null default 1,
      createdAt timestamptz default now(),
      updatedAt timestamptz default now()
    );
  `);
}
