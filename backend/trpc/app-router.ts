import { createTRPCRouter } from "./create-context";
import hiRoute from "./routes/example/hi/route";
import portfolioImport from "./routes/portfolio/import/route";
import portfolioPositions from "./routes/portfolio/positions/route";
import portfolioOverview from "./routes/portfolio/overview/route";
import { searchUsersProcedure } from "./routes/friends/search/route";
import { sendFriendRequestProcedure } from "./routes/friends/send-request/route";
import { acceptFriendRequestProcedure } from "./routes/friends/accept-request/route";
import { rejectFriendRequestProcedure } from "./routes/friends/reject-request/route";
import { removeFriendProcedure } from "./routes/friends/remove/route";
import { listFriendsProcedure } from "./routes/friends/list/route";
import { listPendingRequestsProcedure } from "./routes/friends/pending/route";
import { sendSupportNotificationProcedure } from "./routes/support/send-notification/route";
import { dailyLoginProcedure } from "./routes/gaming/daily-login/route";
import { connectBankProcedure } from "./routes/banking/connect/route";
import { syncBankAccountProcedure } from "./routes/banking/sync/route";
import { disconnectBankProcedure } from "./routes/banking/disconnect/route";
import { getLifeEventProcedure } from "./routes/life-event/get/route";
import { updateLifeEventProcedure } from "./routes/life-event/update/route";

export const appRouter = createTRPCRouter({
  example: createTRPCRouter({
    hi: hiRoute,
  }),
  portfolio: createTRPCRouter({
    import: portfolioImport,
    positions: portfolioPositions,
    overview: portfolioOverview,
  }),
  friends: createTRPCRouter({
    search: searchUsersProcedure,
    sendRequest: sendFriendRequestProcedure,
    acceptRequest: acceptFriendRequestProcedure,
    rejectRequest: rejectFriendRequestProcedure,
    remove: removeFriendProcedure,
    list: listFriendsProcedure,
    pending: listPendingRequestsProcedure,
  }),
  support: createTRPCRouter({
    sendNotification: sendSupportNotificationProcedure,
  }),
  gaming: createTRPCRouter({
    dailyLogin: dailyLoginProcedure,
  }),
  banking: createTRPCRouter({
    connect: connectBankProcedure,
    sync: syncBankAccountProcedure,
    disconnect: disconnectBankProcedure,
  }),
  lifeEvent: createTRPCRouter({
    get: getLifeEventProcedure,
    update: updateLifeEventProcedure,
  }),
});

export type AppRouter = typeof appRouter;