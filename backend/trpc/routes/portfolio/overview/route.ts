import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { StaticFxProvider, StaticPriceProvider, buildPositionsFIFO, enrichWithMarket, TradeSchema, calcAllocations, calcTWRXIRR } from "../common";

export default publicProcedure
  .input(
    z.object({
      trades: z.array(TradeSchema).default([]),
    })
  )
  .query(async ({ input }) => {
    const positions = buildPositionsFIFO(input.trades);
    const priceProvider = new StaticPriceProvider();
    const fx = new StaticFxProvider();
    const enriched = await enrichWithMarket(positions, priceProvider, fx);
    const equityCZK = enriched.reduce((s, p) => s + p.marketValueCZK, 0);
    const allocations = calcAllocations(enriched);
    const { twr, xirr } = calcTWRXIRR();
    return { equityCZK, twr, xirr, allocations, asOf: new Date() };
  });
