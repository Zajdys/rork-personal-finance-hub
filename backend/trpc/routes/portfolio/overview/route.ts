import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { getDB } from "../../../utils/db";
import { loadPositions } from "../db";
import { calcAllocations, calcTWRXIRR } from "../common";

export default publicProcedure
  .input(
    z.object({
      userId: z.string().default("demo-user"),
    })
  )
  .query(async ({ input }) => {
    const db = getDB();
    const positions = await loadPositions(db, input.userId);
    const equityCZK = positions.reduce((s, p) => s + p.marketValueCZK, 0);
    const allocations = calcAllocations(positions);
    const { twr, xirr } = calcTWRXIRR();
    return { equityCZK, twr, xirr, allocations, asOf: new Date() };
  });
