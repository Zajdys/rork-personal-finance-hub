import { createTRPCReact } from "@trpc/react-query";
import { httpLink } from "@trpc/client";
import type { AppRouter } from "@/backend/trpc/app-router";
import superjson from "superjson";
import AsyncStorage from '@react-native-async-storage/async-storage';

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = () => {
  return 'https://baceknd-for-moneybuudy.onrender.com';
};

export const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
      headers: async () => {
        try {
          const token = await AsyncStorage.getItem('authToken');
          if (token) {
            // Validate token is not corrupted JSON
            if (typeof token === 'string' && token.trim().length > 0) {
              return { authorization: `Bearer ${token}` } as Record<string, string>;
            } else {
              console.warn('Invalid auth token found, clearing it');
              await AsyncStorage.removeItem('authToken');
            }
          }
        } catch (e) {
          console.log('trpc headers token read error', e);
          // Clear potentially corrupted token
          try {
            await AsyncStorage.removeItem('authToken');
          } catch (clearError) {
            console.error('Failed to clear corrupted auth token:', clearError);
          }
        }
        return {} as Record<string, string>;
      },
    }),
  ],
});