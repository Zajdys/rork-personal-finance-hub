import { create } from 'zustand';

type QuickAddSheetState = {
  visible: boolean;
  type: 'income' | 'expense';
  open: (type?: 'income' | 'expense') => void;
  close: () => void;
  setType: (type: 'income' | 'expense') => void;
};

export const useQuickAddSheetStore = create<QuickAddSheetState>((set) => ({
  visible: false,
  type: 'expense',
  open: (type = 'expense') => set({ visible: true, type }),
  close: () => set({ visible: false }),
  setType: (type) => set({ type }),
}));
