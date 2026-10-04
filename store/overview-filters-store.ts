import { create } from 'zustand';
import { yyyyMmLocalToday } from '@/lib/transaction-date';

interface OverviewFiltersState {
  /** Prázdné pole = všechny banky. Hodnoty = DB `source` (revolut, kb, …). */
  selectedSourceFilters: string[];
  selectedMonth: string;
  setSelectedSourceFilters: (sources: string[]) => void;
  setSelectedMonth: (ym: string) => void;
}

export const useOverviewFiltersStore = create<OverviewFiltersState>((set) => ({
  selectedSourceFilters: [],
  selectedMonth: yyyyMmLocalToday(),
  setSelectedSourceFilters: (sources) => {
    const unique = [...new Set(sources.map((s) => s.trim()).filter(Boolean))];
    set({ selectedSourceFilters: unique });
  },
  setSelectedMonth: (ym) => {
    const s = (ym ?? '').trim();
    if (!/^\d{4}-\d{2}$/.test(s)) return;
    set({ selectedMonth: s });
  },
}));
