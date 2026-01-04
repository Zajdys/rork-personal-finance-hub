import * as crypto from "node:crypto";

type AirtableUserFields = {
  email: string;
  password_hash: string;
  name: string;
  created_at: string;
};

type AirtableUserRecord = {
  id: string;
  fields: Partial<AirtableUserFields>;
};

type AirtableCreateRecordBody<TFields extends Record<string, unknown>> = {
  records: { fields: TFields }[];
};

type AirtableListResponse<TFields extends Record<string, unknown>> = {
  records: { id: string; fields: Partial<TFields> }[];
  offset?: string;
};

function getAirtableConfig(): { apiKey: string; baseId: string } {
  const apiKey = process.env.AIRTABLE_API_KEY ?? "";
  const baseId = process.env.AIRTABLE_BASE_ID ?? "";

  if (!apiKey) {
    throw new Error("Missing AIRTABLE_API_KEY");
  }
  if (!baseId) {
    throw new Error("Missing AIRTABLE_BASE_ID");
  }

  return { apiKey, baseId };
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function formatAirtableErrorText(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { type?: string; message?: string } };
    const type = parsed?.error?.type ? String(parsed.error.type) : "";
    const message = parsed?.error?.message ? String(parsed.error.message) : "";
    const combined = [type, message].filter(Boolean).join(": ");
    return combined || raw;
  } catch {
    return raw;
  }
}

async function airtableFetch<T>(
  url: string,
  init: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; status: number; errorText: string }> {
  const resp = await fetch(url, init);
  const text = await resp.text();

  if (!resp.ok) {
    const errorText = formatAirtableErrorText(text);
    console.error("[airtable] request failed", {
      url,
      status: resp.status,
      errorText: errorText.slice(0, 2000),
    });
    return { ok: false, status: resp.status, errorText };
  }

  try {
    const json = JSON.parse(text) as T;
    return { ok: true, data: json };
  } catch (e) {
    console.error("[airtable] failed to parse response", { url, text: text.slice(0, 2000), e });
    return { ok: false, status: 500, errorText: "Invalid Airtable response" };
  }
}

async function getUserByEmail(email: string): Promise<AirtableUserRecord | null> {
  const { apiKey, baseId } = getAirtableConfig();

  const formula = `{email} = "${email.replace(/"/g, "\\\"")}"`;
  const url = `https://api.airtable.com/v0/${baseId}/Users?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;

  const res = await airtableFetch<AirtableListResponse<AirtableUserFields>>(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Airtable lookup failed (${res.status}): ${res.errorText}`);
  }

  const first = (res.data.records?.[0] ?? null) as AirtableUserRecord | null;
  return first ?? null;
}

export async function registerUser(email: string, password: string, name: string): Promise<{ success: true }> {
  const normalizedEmail = String(email).trim().toLowerCase();
  const cleanPassword = String(password).trim();
  const cleanName = String(name).trim();

  if (!normalizedEmail || !cleanPassword || !cleanName) {
    throw new Error("Missing email, password or name");
  }

  const existing = await getUserByEmail(normalizedEmail);
  if (existing) {
    throw new Error("User already exists");
  }

  const { apiKey, baseId } = getAirtableConfig();
  const password_hash = sha256Hex(cleanPassword);

  const body: AirtableCreateRecordBody<AirtableUserFields> = {
    records: [
      {
        fields: {
          email: normalizedEmail,
          password_hash,
          name: cleanName,
          created_at: new Date().toISOString(),
        },
      },
    ],
  };

  const url = `https://api.airtable.com/v0/${baseId}/Users`;
  const res = await airtableFetch<{ records: { id: string }[] }>(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Airtable insert failed (${res.status}): ${res.errorText}`);
  }

  console.log("[airtable] user created", { email: normalizedEmail, recordId: res.data.records?.[0]?.id ?? null });

  return { success: true };
}

export async function loginUser(email: string, password: string): Promise<
  | { success: true; user: { id: string; email: string; created_at: string | null } }
  | { success: false; error: string }
> {
  const normalizedEmail = String(email).trim().toLowerCase();
  const cleanPassword = String(password).trim();

  if (!normalizedEmail || !cleanPassword) {
    return { success: false, error: "Missing email or password" };
  }

  const record = await getUserByEmail(normalizedEmail);
  if (!record) {
    return { success: false, error: "Invalid credentials" };
  }

  const storedHash = String(record.fields?.password_hash ?? "");
  const incomingHash = sha256Hex(cleanPassword);
  if (!storedHash || storedHash !== incomingHash) {
    return { success: false, error: "Invalid credentials" };
  }

  return {
    success: true,
    user: {
      id: record.id,
      email: normalizedEmail,
      created_at: typeof record.fields?.created_at === "string" ? record.fields.created_at : null,
    },
  };
}
