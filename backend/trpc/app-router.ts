import { createTRPCRouter } from "./create-context";
import hiRoute from "./routes/example/hi/route";
import portfolioImport from "./routes/portfolio/import/route";
import portfolioPositions from "./routes/portfolio/positions/route";
import portfolioOverview from "./routes/portfolio/overview/route";

export const appRouter = createTRPCRouter({
  example: createTRPCRouter({
    hi: hiRoute,
  }),
  portfolio: createTRPCRouter({
    import: portfolioImport,
    positions: portfolioPositions,
    overview: portfolioOverview,
  }),
});

export type AppRouter = typeof appRouter;