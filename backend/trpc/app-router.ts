import { createTRPCRouter, publicProcedure } from "./create-context";
import { z } from "zod";
import crypto from "crypto";

// ================= EXISTUJÍCÍ ROUTES =================
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
import { createHouseholdProcedure } from "./routes/household/create/route";
import { getHouseholdProcedure } from "./routes/household/get/route";
import { listHouseholdsProcedure } from "./routes/household/list/route";
import { inviteToHouseholdProcedure } from "./routes/household/invite/route";
import { acceptInvitationProcedure } from "./routes/household/accept-invitation/route";
import { createPolicyProcedure } from "./routes/household/policies/create/route";
import { listPoliciesProcedure } from "./routes/household/policies/list/route";
import { setDefaultSplitProcedure } from "./routes/household/splits/set/route";
import { shareTransactionProcedure } from "./routes/household/transactions/share/route";
import { createSettlementProcedure } from "./routes/household/settlements/create/route";
import { listSettlementsProcedure } from "./routes/household/settlements/list/route";
import { getHouseholdDashboardProcedure } from "./routes/household/dashboard/route";

// ================= APP ROUTER =================
export const appRouter = createTRPCRouter({
  // ================= AUTH =================
  auth: createTRPCRouter({
    register: publicProcedure
      .input(
        z.object({
          email: z.string().email(),
          password: z.string().min(6),
          name: z.string().optional(),
        })
      )
      .mutation(({ input }) => {
        const { email, password, name } = input;

        const passwordHash = crypto
          .createHash("sha256")
          .update(password)
          .digest("hex");

        // ✅ zatím in-memory (jen aby to fungovalo)
        return {
          user: {
            id: crypto.randomUUID(),
            email,
            name: name ?? null,
          },
          token: crypto.randomUUID(),
          passwordHash, // debug – klidně pak smažeme
        };
      }),
  }),

  // ================= EXISTING =================
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
  household: createTRPCRouter({
    create: createHouseholdProcedure,
    get: getHouseholdProcedure,
    list: listHouseholdsProcedure,
    invite: inviteToHouseholdProcedure,
    acceptInvitation: acceptInvitationProcedure,
    dashboard: getHouseholdDashboardProcedure,
    policies: createTRPCRouter({
      create: createPolicyProcedure,
      list: listPoliciesProcedure,
    }),
    splits: createTRPCRouter({
      set: setDefaultSplitProcedure,
    }),
    transactions: createTRPCRouter({
      share: shareTransactionProcedure,
    }),
    settlements: createTRPCRouter({
      create: createSettlementProcedure,
      list: listSettlementsProcedure,
    }),
  }),
});

export type AppRouter = typeof appRouter;
