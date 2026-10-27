import { create } from 'zustand';

/**
 * Jednorázový banner „Premium aktivní“ na Přehledu po nákupu.
 * In-memory (ne AsyncStorage) — žije jen do zobrazení / timeoutu.
 */
type PremiumBannerState = {
  visible: boolean;
  show: () => void;
  hide: () => void;
};

export const usePremiumBannerStore = create<PremiumBannerState>((set) => ({
  visible: false,
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
}));
