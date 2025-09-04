import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { getDB } from "../../../utils/db";
import { loadPositions } from "../db";
import { calcAllocations, calcTWRXIRR } from "../common";

export default publicProcedure
  .input(
    z.object({
      userId: z.string().default("demo-user"),
      baseCurrency: z.enum(["CZK", "EUR", "USD", "GBP"]).default("CZK"),
    })
  )
  .query(async ({ input }) => {
    const db = getDB();
    const positions = await loadPositions(db, input.userId, input.baseCurrency);
    const equityBase = positions.reduce((s, p) => s + p.marketValueBase, 0);
    const allocations = calcAllocations(positions);
    const { twr, xirr } = calcTWRXIRR();
    return { equity: equityBase, baseCurrency: input.baseCurrency, twr, xirr, allocations, asOf: new Date() };
  });
