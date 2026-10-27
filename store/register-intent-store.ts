import { create } from 'zustand';

export type RegisterIntent = 'premium' | null;

type RegisterIntentState = {
  /** Jednorázový intent z registrace (in-memory, ne AsyncStorage). */
  intent: RegisterIntent;
  /**
   * Intent premium: paywall už proběhl před welcome-tour —
   * tour ho nesmí nabídnout podruhé.
   */
  skipWelcomePaywall: boolean;
  setIntent: (intent: RegisterIntent) => void;
  markPremiumPaywallSeen: () => void;
  clear: () => void;
};

export const useRegisterIntentStore = create<RegisterIntentState>((set) => ({
  intent: null,
  skipWelcomePaywall: false,
  setIntent: (intent) =>
    set(
      intent === 'premium'
        ? { intent, skipWelcomePaywall: false }
        : { intent },
    ),
  markPremiumPaywallSeen: () => set({ intent: null, skipWelcomePaywall: true }),
  clear: () => set({ intent: null, skipWelcomePaywall: false }),
}));
