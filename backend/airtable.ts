import * as crypto from "node:crypto";

type AirtableUserFields = {
  email: string;
  password_hash: string;
  created_at: string;
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

async function airtableFetch<T>(
  url: string,
  init: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; status: number; errorText: string }> {
  const resp = await fetch(url, init);
  const text = await resp.text();

  if (!resp.ok) {
    console.error("[airtable] request failed", {
      url,
      status: resp.status,
      body: text.slice(0, 2000),
    });
    return { ok: false, status: resp.status, errorText: text };
  }

  try {
    const json = JSON.parse(text) as T;
    return { ok: true, data: json };
  } catch (e) {
    console.error("[airtable] failed to parse response", { url, text: text.slice(0, 2000), e });
    return { ok: false, status: 500, errorText: "Invalid Airtable response" };
  }
}

async function userExistsByEmail(email: string): Promise<boolean> {
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
    throw new Error("Airtable lookup failed");
  }

  return (res.data.records?.length ?? 0) > 0;
}

export async function registerUser(email: string, password: string): Promise<{ success: true }> {
  const normalizedEmail = String(email).trim().toLowerCase();
  const cleanPassword = String(password).trim();

  if (!normalizedEmail || !cleanPassword) {
    throw new Error("Missing email or password");
  }

  if (await userExistsByEmail(normalizedEmail)) {
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
    throw new Error("Airtable insert failed");
  }

  console.log("[airtable] user created", { email: normalizedEmail, recordId: res.data.records?.[0]?.id ?? null });

  return { success: true };
}
