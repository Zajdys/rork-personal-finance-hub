import { createTRPCReact } from "@trpc/react-query";
import { httpLink } from "@trpc/client";
import type { AppRouter } from "@/backend/trpc/app-router";
import superjson from "superjson";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const trpc = createTRPCReact<AppRouter>();

// ✅ SPRÁVNÁ BASE URL PRO RORK
const getBaseUrl = () => {
  const backendUrl = process.env.EXPO_PUBLIC_API_URL;
  if (backendUrl) {
    return backendUrl;
  }

  // fallback – lokální dev
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3000";
};

export const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
      headers: async () => {
        try {
          const token = await AsyncStorage.getItem("authToken");
          if (token && typeof token === "string" && token.trim().length > 0) {
            return {
              authorization: `Bearer ${token}`,
            } as Record<string, string>;
          }
        } catch (e) {
          console.warn("tRPC auth token error", e);
        }

        return {} as Record<string, string>;
      },
    }),
  ],
});
