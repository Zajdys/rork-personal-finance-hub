import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { cors } from "hono/cors";
import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import Papa from "papaparse";
import yahooFinance from "yahoo-finance2";


interface TradeRow {
  Action: string;
  Ticker: string;
  Time?: string;
  [key: string]: string | number | undefined;
}

interface FIFOPosition {
  fifo: { shares: number; cost: number }[];
  shares: number;
  invested: number;
}

// app will be mounted at /api
const app = new Hono();

interface User {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  passwordSalt: string;
  level: number;
  points: number;
  profile?: Record<string, unknown>;
  createdAt: string;
}

interface TokenPayload {
  sub: string;
  email: string;
  iat: number;
}

const users = new Map<string, User>();

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signToken(payload: TokenPayload): string {
  const header = { alg: "HS256", typ: "JWT" } as const;
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(data).digest();
  const sigB64 = b64url(sig);
  return `${data}.${sigB64}`;
}

function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sig] = parts;
    const data = `${headerB64}.${payloadB64}`;
    const expected = b64url(crypto.createHmac("sha256", JWT_SECRET).update(data).digest());
    if (sig !== expected) return null;
    const json = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(json) as TokenPayload;
    return payload;
  } catch (e) {
    console.error("verifyToken error", e);
    return null;
  }
}


// Enable CORS for all routes
app.use("*", cors());

// Mount tRPC router at /trpc
app.use(
  "/trpc/*",
  trpcServer({
    endpoint: "/trpc",
    router: appRouter,
    createContext,
  })
);

// Simple health check endpoint
app.get("/", (c) => {
  return c.json({ status: "ok", message: "API is running" });
});

// Auth: /register (Airtable)
app.post("/register", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as Partial<{ email: string; password: string; name: string }>;
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "").trim();
    const name = String(body?.name ?? "").trim();

    console.log("[/register] incoming", {
      hasEmail: Boolean(email),
      hasPassword: Boolean(password),
      hasName: Boolean(name),
      emailPreview: email ? `${email.slice(0, 2)}***${email.slice(-2)}` : null,
      hasAirtableKey: Boolean(process.env.AIRTABLE_API_KEY),
      airtableBaseIdPrefix: (process.env.AIRTABLE_BASE_ID ?? "").slice(0, 5) || null,
    });

    if (!email || !password || !name) {
      return c.json({ error: "Missing email, password or name" }, 400);
    }

    const { registerUser } = await import("./airtable");
    const result = await registerUser(email, password, name);

    console.log("[airtable register] success", { email });

    return c.json(result);
  } catch (e) {
    console.error("/register airtable error", {
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
    const msg = e instanceof Error ? e.message : "Registration failed";
    const lower = msg.toLowerCase();
    const status = lower.includes("exists") ? 409 : lower.includes("missing airtable") ? 500 : 500;
    return c.json({ error: msg }, status);
  }
});

// Auth: /login (Airtable)
app.post("/login", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as Partial<{ email: string; password: string }>;
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "").trim();

    if (!email || !password) {
      return c.json({ error: "Missing email or password" }, 400);
    }

    const { loginUser } = await import("./airtable");
    const res = await loginUser(email, password);
    if (!res.success) {
      return c.json({ error: res.error }, 401);
    }

    const token = signToken({ sub: res.user.id, email: res.user.email, iat: Math.floor(Date.now() / 1000) });

    console.log("[airtable login]", email);

    return c.json({
      success: true,
      user: res.user,
      token,
    });
  } catch (e) {
    console.error("/login airtable error", e);
    const msg = e instanceof Error ? e.message : "Login failed";
    return c.json({ error: msg }, 500);
  }
});

function calculateFIFO(trades: TradeRow[]) {
  const portfolio: Record<string, FIFOPosition> = {};

  const sorted = [...trades].sort((a, b) => {
    const at = new Date(String(a.Time ?? "")).getTime();
    const bt = new Date(String(b.Time ?? "")).getTime();
    return at - bt;
  });

  for (const trade of sorted) {
    const ticker = String(trade.Ticker);
    const shares = parseFloat(String(trade["No. of shares"])) || 0;
    const total = parseFloat(String(trade["Total"])) || 0;
    const action = String(trade.Action ?? "").toLowerCase();

    if (!portfolio[ticker]) {
      portfolio[ticker] = { fifo: [], shares: 0, invested: 0 };
    }

    if (action.includes("buy")) {
      portfolio[ticker].fifo.push({ shares, cost: total });
      portfolio[ticker].shares += shares;
      portfolio[ticker].invested += total;
    } else if (action.includes("sell")) {
      let sharesToSell = shares;
      while (sharesToSell > 0 && portfolio[ticker].fifo.length > 0) {
        const batch = portfolio[ticker].fifo.shift() as { shares: number; cost: number };
        if (batch.shares <= sharesToSell) {
          sharesToSell -= batch.shares;
          portfolio[ticker].shares -= batch.shares;
          portfolio[ticker].invested -= batch.cost;
        } else {
          const originalShares = batch.shares;
          const costPerShare = batch.cost / originalShares;
          const remainingShares = originalShares - sharesToSell;
          const remainingCost = remainingShares * costPerShare;
          portfolio[ticker].fifo.unshift({ shares: remainingShares, cost: remainingCost });
          portfolio[ticker].shares -= sharesToSell;
          portfolio[ticker].invested -= costPerShare * sharesToSell;
          sharesToSell = 0;
        }
      }
    }
  }

  return portfolio;
}

app.get("/portfolio", async (c) => {
  try {
    const csvPath = `${process.cwd()}/trading all.csv`;
    if (!fs.existsSync(csvPath)) {
      return c.json({ error: "CSV file not found. Place 'trading all.csv' in project root." }, 404);
    }

    const csvFile = fs.readFileSync(csvPath, "utf8");
    const parsed = Papa.parse(csvFile, { header: true, skipEmptyLines: true }) as unknown as { data: TradeRow[] };
    const rows: TradeRow[] = parsed.data.filter(Boolean);

    const trades = rows.filter((row) =>
      ["Market buy", "Limit buy", "Market sell", "Limit sell"].includes(String(row.Action))
    );

    const portfolio = calculateFIFO(trades);
    const tickers = Object.keys(portfolio);

    const results = await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const quote = await yahooFinance.quote(ticker as any);
          const currentPrice = Number((quote as any)?.regularMarketPrice ?? 0) || 0;
          const info = portfolio[ticker];
          const currentValue = currentPrice * info.shares;
          const profitLoss = currentValue - info.invested;
          const profitLossPct = info.invested > 0 ? (profitLoss / info.invested) * 100 : 0;

          return {
            Ticker: ticker,
            Shares: Number(info.shares),
            Invested: Number(info.invested.toFixed(2)),
            CurrentPrice: Number(currentPrice.toFixed(2)),
            CurrentValue: Number(currentValue.toFixed(2)),
            ProfitLoss: Number(profitLoss.toFixed(2)),
            ProfitLossPct: Number(profitLossPct.toFixed(2)),
          };
        } catch (err) {
          console.error(`[portfolio] price fetch failed for ${ticker}`, err);
          const info = portfolio[ticker];
          return {
            Ticker: ticker,
            Shares: Number(info.shares),
            Invested: Number(info.invested.toFixed(2)),
            CurrentPrice: 0,
            CurrentValue: 0,
            ProfitLoss: Number((-info.invested).toFixed(2)),
            ProfitLossPct: -100,
          };
        }
      })
    );

    const sorted = results.sort((a, b) => b.CurrentValue - a.CurrentValue);
    return c.json(sorted);
  } catch (e) {
    console.error("/portfolio error", e);
    return c.json({ error: "Failed to build portfolio" }, 500);
  }
});

// Profile update: /update-profile (auth via Bearer token)
app.post("/update-profile", async (c) => {
  try {
    const auth = c.req.header("authorization") ?? c.req.header("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const payload = token ? verifyToken(token) : null;
    if (!payload) return c.json({ error: "Unauthorized" }, 401);

    const body = (await c.req.json().catch(() => ({}))) as Partial<{ name: string; level: number; points: number; profile: Record<string, unknown> }>;

    // find user by email from payload for simplicity
    const user = [...users.values()].find((u) => u.id === payload.sub) ?? null;
    if (!user) return c.json({ error: "User not found" }, 404);

    if (typeof body.name === "string") user.name = body.name.trim() || user.name;
    if (typeof body.level === "number" && Number.isFinite(body.level)) user.level = Math.max(1, Math.floor(body.level));
    if (typeof body.points === "number" && Number.isFinite(body.points)) user.points = Math.max(0, Math.floor(body.points));
    if (body.profile && typeof body.profile === "object") user.profile = { ...(user.profile ?? {}), ...body.profile };

    users.set(user.email, user);

    console.log("[update-profile]", user.email);

    return c.json({ user: { id: user.id, email: user.email, name: user.name, level: user.level, points: user.points, profile: user.profile ?? {} } });
  } catch (e) {
    console.error("/update-profile error", e);
    return c.json({ error: "Update failed" }, 500);
  }
});

// Quotes proxy to avoid client-side Yahoo 401s
app.get("/quotes", async (c) => {
  try {
    const raw = c.req.query("symbols") ?? "";
    const symbols = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (symbols.length === 0) {
      return c.json({ quotes: [] });
    }

    const data = (await yahooFinance.quote(symbols as any)) as any;
    const arr: any[] = Array.isArray(data) ? data : data ? [data] : [];
    const quotes = arr.map((q) => ({
      symbol: q?.symbol ?? null,
      regularMarketPrice: q?.regularMarketPrice ?? null,
      regularMarketTime: q?.regularMarketTime ?? null,
      currency: q?.currency ?? null,
    }));

    return c.json({ quotes });
  } catch (e) {
    console.error("/quotes error", e);
    return c.json({ quotes: [], error: "Failed to fetch quotes" }, 500);
  }
});

// Get sectors for multiple stocks
app.get("/quotes/sectors", async (c) => {
  try {
    const raw = c.req.query("symbols") ?? "";
    const symbols = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (symbols.length === 0) {
      return c.json({ sectors: [] });
    }

    const results = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const resp = (await (yahooFinance as any).quoteSummary(symbol, {
            modules: ["assetProfile"],
          })) as any;
          
          const first = resp?.assetProfile ? resp : resp?.quoteSummary?.result?.[0];
          const sector = first?.assetProfile?.sector ?? "Other";
          const industry = first?.assetProfile?.industry ?? null;
          const country = first?.assetProfile?.country ?? null;
          
          return {
            symbol,
            sector,
            industry,
            country,
          };
        } catch (err) {
          console.error(`[quotes/sectors] Failed to fetch sector for ${symbol}`, err);
          return {
            symbol,
            sector: "Other",
            industry: null,
            country: null,
          };
        }
      })
    );

    return c.json({ sectors: results });
  } catch (e) {
    console.error("/quotes/sectors error", e);
    return c.json({ sectors: [], error: "Failed to fetch sectors" }, 500);
  }
});

// Detailed fundamentals and summary for an instrument
app.get("/finance/summary", async (c) => {
  try {
    const symbol = (c.req.query("symbol") ?? c.req.query("s") ?? "").trim();
    if (!symbol) return c.json({ error: "Missing symbol" }, 400);

    const modules = [
      "price",
      "summaryDetail",
      "assetProfile",
      "defaultKeyStatistics",
    ] as const;

    const resp = (await (yahooFinance as any).quoteSummary(symbol, {
      modules: modules as any,
    })) as any;

    const first = resp?.price || resp?.summaryDetail || resp?.assetProfile ? resp : resp?.quoteSummary?.result?.[0];

    const price = first?.price?.regularMarketPrice ?? null;
    const currency = first?.price?.currency ?? null;
    const dividendYield = first?.summaryDetail?.dividendYield ?? first?.summaryDetail?.trailingAnnualDividendYield ?? null;
    const dividendRate = first?.summaryDetail?.trailingAnnualDividendRate ?? null;
    const marketCap = first?.summaryDetail?.marketCap ?? null;
    const pe = first?.summaryDetail?.trailingPE ?? first?.defaultKeyStatistics?.trailingPE ?? null;
    const forwardPE = first?.summaryDetail?.forwardPE ?? first?.defaultKeyStatistics?.forwardPE ?? null;

    return c.json({
      symbol,
      price: typeof price === "object" ? price?.raw ?? null : price,
      currency,
      dividendYield: typeof dividendYield === "object" ? dividendYield?.raw ?? null : dividendYield,
      dividendRate: typeof dividendRate === "object" ? dividendRate?.raw ?? null : dividendRate,
      marketCap: typeof marketCap === "object" ? marketCap?.raw ?? null : marketCap,
      pe: typeof pe === "object" ? pe?.raw ?? null : pe,
      forwardPE: typeof forwardPE === "object" ? forwardPE?.raw ?? null : forwardPE,
      assetProfile: first?.assetProfile ?? null,
      name: first?.price?.shortName ?? first?.price?.longName ?? symbol,
    });
  } catch (e) {
    console.error("/finance/summary error", e);
    return c.json({ error: "Failed to fetch summary" }, 500);
  }
});

export default app;