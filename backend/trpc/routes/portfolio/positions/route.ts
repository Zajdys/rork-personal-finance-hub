import { z } from "zod";
import { publicProcedure } from "../../../create-context";
import { StaticFxProvider, StaticPriceProvider, buildPositionsFIFO, enrichWithMarket, TradeSchema } from "../common";

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
    return { positions: enriched, asOf: new Date() };
  });
