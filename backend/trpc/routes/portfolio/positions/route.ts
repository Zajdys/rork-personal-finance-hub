import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { getDB } from "../../../utils/db";
import { loadPositions } from "../db";

export default publicProcedure
  .input(
    z.object({
      userId: z.string().default("demo-user"),
    })
  )
  .query(async ({ input }) => {
    const db = getDB();
    const rows = await loadPositions(db, input.userId);
    return { positions: rows, asOf: new Date() };
  });
