import { z } from "zod";
import { publicProcedure } from "../../../create-context";

const RowSchema = z.object({
  raw: z.string(),
  cols: z.array(z.string()),
});

export default publicProcedure
  .input(
    z.object({
      broker: z.enum(["XTB", "Trading212", "Anycoin", "Degiro"]).or(z.string()),
      rows: z.array(RowSchema),
      baseCurrency: z.enum(["CZK", "EUR", "USD", "GBP"]).default("EUR"),
      userId: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const unique = new Set<string>();
    let added = 0;

    for (const row of input.rows) {
      const hash = await sha256(row.raw);
      if (unique.has(hash)) continue;
      unique.add(hash);
      added += 1;
    }

    return {
      broker: input.broker,
      received: input.rows.length,
      added,
      deduped: input.rows.length - added,
      baseCurrency: input.baseCurrency,
    };
  });

async function sha256(message: string) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}
