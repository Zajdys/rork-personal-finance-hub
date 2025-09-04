import initSqlJs, { Database } from 'sql.js';
import { Client as PGClient } from 'pg';

let sqlPromise: Promise<typeof import('sql.js')> | null = null;
let sqlDb: Database | null = null;
let pgClient: PGClient | null = null;
let initialized = false;

export type DB = {
  dialect: 'sqljs' | 'postgres';
  run: (sql: string, params?: any[]) => Promise<void>;
  all: <T = any>(sql: string, params?: any[]) => Promise<T[]>;
  get: <T = any>(sql: string, params?: any[]) => Promise<T | undefined>;
};

export function getDB(): DB {
  if (!initialized) {
    const url = process.env.DATABASE_URL;
    if (url) {
      pgClient = new PGClient({ connectionString: url, ssl: getSSL() });
    } else {
      if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: (f: string) => `https://sql.js.org/dist/${f}` });
    }
    initialized = true;
  }

  const run = async (sql: string, params: any[] = []) => {
    if (pgClient) {
      await ensurePg();
      await pgClient!.query(sqlToPg(sql), params);
    } else {
      await ensureSqlJs();
      sqlDb!.run(sql, params);
    }
  };

  const all = async <T = any>(sql: string, params: any[] = []) => {
    if (pgClient) {
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
    dialect: pgClient ? 'postgres' : 'sqljs',
    run,
    all,
    get,
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
  const SQL = await (sqlPromise as Promise<typeof import('sql.js')>);
  sqlDb = new SQL.Database();
  migrateSqlJs(sqlDb);
}

async function migratePg(client: PGClient) {
  await client.query(`
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
      updated_at timestamptz default now(),
      primary key(user_id, symbol)
    );
  `);
}

function migrateSqlJs(db: Database) {
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
      updated_at text default (datetime('now')),
      primary key(user_id, symbol)
    );
  `);
}

function sqlToPg(sql: string) {
  return sql.replace(/datetime\('now'\)/g, 'now()');
}
