/**
 * Legacy endpoint (dříve Salt Edge sync).
 * Salt Edge je odstraněn — endpoint zůstává kvůli kompatibilitě a vrací prázdný výsledek.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: 0,
        message: "Salt Edge sync removed — use CSV/PDF import or Fio sync",
      }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
