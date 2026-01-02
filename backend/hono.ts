import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { cors } from "hono/cors";
import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import * as crypto from "node:crypto";

// ================= APP =================
const app = new Hono();

// ⚠️ VŠE JE POD /api
const api = new Hono();

// ================= UTILS =================
interface User {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
}

const users = new Map<string, User>();
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

function hashPassword(password: string, salt?: string) {
  const usedSalt = salt ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, usedSalt, 100_000, 32, "sha256").toString("hex");
  return { hash, salt: usedSalt };
}

function signToken(payload: object) {
  return crypto.createHmac("sha256", JWT_SECRET).update(JSON.stringify(payload)).digest("hex");
}

// ================= MIDDLEWARE =================
api.use("*", cors());

// ================= HEALTHCHECK =================
api.get("/", (c) => {
  return c.json({ status: "ok", message: "API is running" });
});

// ================= AUTH =================
api.post("/register", async (c) => {
  try {
    const body = await c.req.json();
    const email = String(body.email ?? "").toLowerCase().trim();
    const password = String(body.password ?? "").trim();
    const name = body.name ? String(body.name).trim() : null;

    if (!email || !password) {
      return c.json({ error: "Missing email or password" }, 400);
    }

    if (users.has(email)) {
      return c.json({ error: "User already exists" }, 409);
    }

    const { hash, salt } = hashPassword(password);

    const user: User = {
      id: crypto.randomUUID(),
      email,
      name,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
    };

    users.set(email, user);

    const token = signToken({ sub: user.id, email });

    return c.json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (e) {
    console.error("REGISTER ERROR", e);
    return c.json({ error: "Registration failed" }, 500);
  }
});

api.post("/login", async (c) => {
  try {
    const body = await c.req.json();
    const email = String(body.email ?? "").toLowerCase().trim();
    const password = String(body.password ?? "").trim();

    const user = users.get(email);
    if (!user) return c.json({ error: "Invalid credentials" }, 401);

    const { hash } = hashPassword(password, user.passwordSalt);
    if (hash !== user.passwordHash) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const token = signToken({ sub: user.id, email });

    return c.json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (e) {
    console.error("LOGIN ERROR", e);
    return c.json({ error: "Login failed" }, 500);
  }
});

// ================= TRPC =================
api.use(
  "/trpc/*",
  trpcServer({
    endpoint: "/trpc",
    router: appRouter,
    createContext,
  })
);

// ================= MOUNT =================
app.route("/api", api);

export default app;
