import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Rekurzivně vypíše cesty souborů pod `folder` (např. userId). */
async function listAllObjectPaths(
  admin: SupabaseClient,
  bucket: string,
  folder: string,
): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await admin.storage.from(bucket).list(folder, {
    limit: 1000,
    offset: 0,
  });
  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    // Prázdný prefix / neexistující složka — OK
    if (msg.includes("not found") || msg.includes("does not exist")) return out;
    throw new Error(`${bucket}/${folder}: ${error.message}`);
  }
  for (const item of data ?? []) {
    if (!item?.name) continue;
    const path = `${folder}/${item.name}`;
    // Složka: id === null (Supabase Storage)
    if (item.id == null) {
      const nested = await listAllObjectPaths(admin, bucket, path);
      out.push(...nested);
    } else {
      out.push(path);
    }
  }
  return out;
}

/**
 * Smaže jen objekty pod `{userId}/…`.
 * U receipts NEmaže `householdId/…` (sdílené účtenky domácnosti).
 */
async function removeUserStoragePrefix(
  admin: SupabaseClient,
  bucket: string,
  userId: string,
): Promise<void> {
  const paths = await listAllObjectPaths(admin, bucket, userId);
  if (paths.length === 0) return;
  const chunkSize = 100;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const chunk = paths.slice(i, i + chunkSize);
    const { error } = await admin.storage.from(bucket).remove(chunk);
    if (error) {
      throw new Error(`${bucket} remove: ${error.message}`);
    }
  }
}

async function cleanupUserStorage(admin: SupabaseClient, userId: string): Promise<void> {
  const buckets = ["receipts", "avatars", "split-receipts"] as const;
  for (const bucket of buckets) {
    await removeUserStoragePrefix(admin, bucket, userId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "Server misconfigured" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Invalid user" }, 401);
    }

    const userId = userData.user.id;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 1) Storage — jen prefix userId/ (ne householdId/ v receipts).
    //    Před prepare: když úklid selže, DB ještě není přepsaná a účet zůstává použitelný.
    try {
      await cleanupUserStorage(adminClient, userId);
    } catch (storageErr) {
      const msg = storageErr instanceof Error ? storageErr.message : String(storageErr);
      return json({ error: `Storage cleanup failed: ${msg}` }, 500);
    }

    // 2) Připrava DB (předání domácností, payment_mode, …)
    const { error: prepError } = await adminClient.rpc("prepare_user_account_deletion", {
      target_user: userId,
    });
    if (prepError) {
      return json(
        { error: `prepare_user_account_deletion failed: ${prepError.message}` },
        500,
      );
    }

    // 3) Auth uživatel (CASCADE na public.users a dál)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      return json({ error: deleteError.message }, 500);
    }

    return json({ success: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
