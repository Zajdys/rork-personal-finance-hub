import * as crypto from "node:crypto";

type AirtableUserFields = {
  email: string;
  password_hash: string;
  name: string;
  created_at?: string;
  work_status?: string;
  monthly_income_range?: string;
  finance_experience?: string;
  financial_goals?: string[];
  has_loan?: boolean;
  budget_housing?: number;
  budget_food?: number;
  budget_transport?: number;
  budget_fun?: number;
  budget_savings?: number;
  onboarding_completed?: boolean;
};

type AirtableUserRecord = {
  id: string;
  fields: Partial<AirtableUserFields>;
};

type AirtableLoanFields = {
  user: string[];
  loan_type: string;
  loan_amount: number;
  interest_rate: number;
  monthly_payment: number;
  remaining_months: number;
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

  console.log("[getAirtableConfig] check", {
    hasApiKey: Boolean(apiKey),
    apiKeyLength: apiKey.length,
    apiKeyPreview: apiKey ? `${apiKey.slice(0, 3)}...${apiKey.slice(-3)}` : null,
    hasBaseId: Boolean(baseId),
    baseIdLength: baseId.length,
    baseIdValue: baseId,
  });

  if (!apiKey) {
    console.error("[getAirtableConfig] Missing AIRTABLE_API_KEY");
    throw new Error("Missing AIRTABLE_API_KEY");
  }
  if (!baseId) {
    console.error("[getAirtableConfig] Missing AIRTABLE_BASE_ID");
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

export async function getUserByEmail(email: string): Promise<AirtableUserRecord | null> {
  const { apiKey, baseId } = getAirtableConfig();

  const formula = `{email} = "${email.replace(/"/g, "\\\"")}"`;
  const url = `https://api.airtable.com/v0/${baseId}/Users?maxRecords=1&filterByFormula=${encodeURIComponent(formula)}`;

  console.log("[getUserByEmail] fetching", { email, url: url.replace(apiKey, "***") });

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

  const fields: Pick<AirtableUserFields, "email" | "password_hash" | "name"> & Record<string, unknown> = {
    email: normalizedEmail,
    password_hash,
    name: cleanName,
  };

  if ("created_at" in fields) {
    delete fields.created_at;
  }

  const body: AirtableCreateRecordBody<Record<string, unknown>> = {
    records: [
      {
        fields,
      },
    ],
  };

  const url = `https://api.airtable.com/v0/${baseId}/Users`;
  
  console.log("[registerUser] creating record", {
    email: normalizedEmail,
    name: cleanName,
    url,
    fieldsKeys: Object.keys(fields),
  });
  
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

export type OnboardingSubmitInput = {
  workStatus: string;
  monthlyIncomeRange: string;
  financeExperience: string;
  financialGoals: string[];
  hasLoan: boolean;
  budgetHousing?: number;
  budgetFood?: number;
  budgetTransport?: number;
  budgetFun?: number;
  budgetSavings?: number;
  loans: {
    loanType: string;
    loanAmount: number;
    interestRate: number;
    monthlyPayment: number;
    remainingMonths: number;
  }[];
};

export async function submitOnboardingByEmail(email: string, input: OnboardingSubmitInput): Promise<{ success: true }> {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Missing email");
  }

  const record = await getUserByEmail(normalizedEmail);
  if (!record) {
    throw new Error("User not found");
  }

  const { apiKey, baseId } = getAirtableConfig();

  const budgetHousing = Number(input.budgetHousing ?? NaN);
  const budgetFood = Number(input.budgetFood ?? NaN);
  const budgetTransport = Number(input.budgetTransport ?? NaN);
  const budgetFun = Number(input.budgetFun ?? NaN);
  const budgetSavings = Number(input.budgetSavings ?? NaN);

  const userPatchFields: Record<string, unknown> = {
    work_status: String(input.workStatus ?? "").trim(),
    monthly_income_range: String(input.monthlyIncomeRange ?? "").trim(),
    finance_experience: String(input.financeExperience ?? "").trim(),
    financial_goals: Array.isArray(input.financialGoals)
      ? input.financialGoals.map((g) => String(g).trim()).filter(Boolean)
      : [],
    has_loan: Boolean(input.hasLoan),
    onboarding_completed: true,
  };

  if (Number.isFinite(budgetHousing) && budgetHousing > 0) {
    userPatchFields.budget_housing = budgetHousing;
  }
  if (Number.isFinite(budgetFood) && budgetFood > 0) {
    userPatchFields.budget_food = budgetFood;
  }
  if (Number.isFinite(budgetTransport) && budgetTransport > 0) {
    userPatchFields.budget_transport = budgetTransport;
  }
  if (Number.isFinite(budgetFun) && budgetFun > 0) {
    userPatchFields.budget_fun = budgetFun;
  }
  if (Number.isFinite(budgetSavings) && budgetSavings > 0) {
    userPatchFields.budget_savings = budgetSavings;
  }

  console.log("[submitOnboarding] userPatchFields to send:", JSON.stringify(userPatchFields, null, 2));

  const userPatchUrl = `https://api.airtable.com/v0/${baseId}/Users/${record.id}`;
  console.log("[submitOnboarding] patch user", {
    email: normalizedEmail,
    userRecordId: record.id,
    url: userPatchUrl,
    fieldsKeys: Object.keys(userPatchFields),
    fieldsPreview: JSON.stringify(userPatchFields).slice(0, 500),
  });

  const patchRes = await airtableFetch<{ id: string }>(userPatchUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: userPatchFields }),
  });

  if (!patchRes.ok) {
    console.error("[submitOnboarding] PATCH failed", {
      status: patchRes.status,
      errorText: patchRes.errorText,
      userRecordId: record.id,
      fieldsKeys: Object.keys(userPatchFields),
    });
    throw new Error(`Airtable user update failed (${patchRes.status}): ${patchRes.errorText}`);
  }

  console.log("[submitOnboarding] PATCH success", { userRecordId: record.id });

  const hasLoan = Boolean(input.hasLoan);
  const loans = Array.isArray(input.loans) ? input.loans : [];

  if (hasLoan) {
    const validLoans = loans
      .map((l) => ({
        loanType: String(l?.loanType ?? "").trim(),
        loanAmount: Number(l?.loanAmount ?? 0),
        interestRate: Number(l?.interestRate ?? 0),
        monthlyPayment: Number(l?.monthlyPayment ?? 0),
        remainingMonths: Number(l?.remainingMonths ?? 0),
      }))
      .filter((l) => Boolean(l.loanType) && Number.isFinite(l.loanAmount));

    if (validLoans.length > 0) {
      const loanCreateUrl = `https://api.airtable.com/v0/${baseId}/Loans`;

      const body: AirtableCreateRecordBody<AirtableLoanFields> = {
        records: validLoans.map((l) => ({
          fields: {
            user: [record.id],
            loan_type: l.loanType,
            loan_amount: l.loanAmount,
            interest_rate: l.interestRate,
            monthly_payment: l.monthlyPayment,
            remaining_months: l.remainingMonths,
          },
        })),
      };

      console.log("[submitOnboarding] create loans", {
        email: normalizedEmail,
        userRecordId: record.id,
        count: validLoans.length,
        url: loanCreateUrl,
      });

      const createRes = await airtableFetch<{ records: { id: string }[] }>(loanCreateUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!createRes.ok) {
        throw new Error(`Airtable loans insert failed (${createRes.status}): ${createRes.errorText}`);
      }
    } else {
      console.log("[submitOnboarding] hasLoan=true but no valid loans provided", {
        email: normalizedEmail,
        loansCount: loans.length,
      });
    }
  }

  return { success: true };
}
