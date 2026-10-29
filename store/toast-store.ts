import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type ToastPayload = {
  message: string;
  type?: ToastType;
  /** Lucide / emoji override; jinak ikona podle type */
  icon?: string;
  /** ms; default 2500 */
  durationMs?: number;
};

type ToastState = {
  visible: boolean;
  message: string;
  type: ToastType;
  icon?: string;
  durationMs: number;
  /** Monotónní id — restart animace při dalším show */
  token: number;
  showToast: (payload: ToastPayload) => void;
  hideToast: () => void;
};

export const useToastStore = create<ToastState>((set) => ({
  visible: false,
  message: '',
  type: 'success',
  icon: undefined,
  durationMs: 2500,
  token: 0,
  showToast: ({ message, type = 'success', icon, durationMs = 2500 }) => {
    const trimmed = String(message ?? '').trim();
    if (!trimmed) return;
    set((s) => ({
      visible: true,
      message: trimmed,
      type,
      icon,
      durationMs: Math.max(800, durationMs),
      token: s.token + 1,
    }));
  },
  hideToast: () => set({ visible: false }),
}));

/** Imperativní API mimo React (hooks / store actions). */
export function showToast(payload: ToastPayload): void {
  useToastStore.getState().showToast(payload);
}
