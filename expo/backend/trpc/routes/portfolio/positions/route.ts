import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { getDB } from "../../../utils/db";
import { loadPositions } from "../db";

export default publicProcedure
  .input(
    z.object({
      userId: z.string().default("demo-user"),
      baseCurrency: z.enum(["CZK", "EUR", "USD", "GBP"]).default("CZK"),
    })
  )
  .query(async ({ input }) => {
    const db = getDB();
    const rows = await loadPositions(db, input.userId, input.baseCurrency);
    return { positions: rows, baseCurrency: input.baseCurrency, asOf: new Date() };
  });
