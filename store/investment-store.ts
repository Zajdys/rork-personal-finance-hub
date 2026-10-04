import { create } from 'zustand';
import type { EtoroPosition } from '@/lib/etoro-parser';
import { fetchPrimaryHouseholdId } from '@/lib/household-id';
import {
  createInvestmentPortfolioRemote,
  deleteInvestmentPortfolioRemote,
  updateInvestmentPortfolioRemote,
  etoroPositionsToInserts,
  fetchInvestmentPortfoliosRemote,
  fetchInvestmentPositionsRemote,
  insertInvestmentPositionsRemote,
  type InvestmentBroker,
  type InvestmentPortfolio,
  type InvestmentPortfolioVisibility,
  type InvestmentPosition,
  type PositionInsert,
} from '@/lib/investment-portfolios';
import { importEtoroTransactionsFromXlsx, importTrading212TransactionsFromCsv, importAnycoinTransactionsFromCsv, importRevolutInvestTransactionsFromCsv, importXtbTransactionsFromXlsx } from '@/lib/investment-transactions';
import { useHouseholdActiveStore } from '@/store/household-active-store';
import { useInvestmentPortfolioViewStore } from '@/store/investment-portfolio-view-store';
import { supabaseUrl } from '@/lib/supabase';

interface InvestmentStore {
  portfolios: InvestmentPortfolio[];
  selectedPortfolioIds: string[];
  positions: InvestmentPosition[];
  householdId: string | null;
  lastUserId: string | null;
  isLoading: boolean;
  error: string | null;

  fetchPortfolios: (userId: string) => Promise<void>;
  fetchPositions: (portfolioIds?: string[]) => Promise<void>;
  deletePortfolio: (id: string) => Promise<{ error: string | null }>;
  updatePortfolio: (
    id: string,
    patch: { name?: string; currency?: string },
  ) => Promise<{ error: string | null }>;
  setSelectedPortfolios: (ids: string[]) => void;
  importEtoroPositions: (
    userId: string,
    positions: EtoroPosition[],
    portfolioName: string,
    options?: ImportPortfolioOptions,
  ) => Promise<{ error: string | null }>;
  importPositions: (
    userId: string,
    params: ImportPortfolioParams,
  ) => Promise<{ error: string | null }>;
  importEtoroTransactions: (
    userId: string,
    params: ImportEtoroTransactionsParams,
  ) => Promise<{
    error: string | null;
    upserted: number;
    portfolioId: string | null;
    summary: {
      fileCount: number;
      upserted: number;
      newCount: number;
      openPositions: number;
      hasOrphanSells: boolean;
      hasCompleteData: boolean;
    } | null;
  }>;
  importTrading212Transactions: (
    userId: string,
    params: ImportTrading212TransactionsParams,
  ) => Promise<{
    error: string | null;
    upserted: number;
    portfolioId: string | null;
    hasOrphanSells: boolean;
    summary: {
      fileCount: number;
      upserted: number;
      newCount: number;
      openPositions: number;
      hasOrphanSells: boolean;
      hasCompleteData: boolean;
    } | null;
  }>;
  importAnycoinTransactions: (
    userId: string,
    params: ImportAnycoinTransactionsParams,
  ) => Promise<{
    error: string | null;
    upserted: number;
    portfolioId: string | null;
    summary: {
      fileCount: number;
      upserted: number;
      newCount: number;
      openPositions: number;
      hasOrphanSells: boolean;
      hasCompleteData: boolean;
    } | null;
  }>;
  importRevolutInvestTransactions: (
    userId: string,
    params: ImportRevolutInvestTransactionsParams,
  ) => Promise<{
    error: string | null;
    upserted: number;
    portfolioId: string | null;
    summary: {
      fileCount: number;
      upserted: number;
      newCount: number;
      openPositions: number;
      hasOrphanSells: boolean;
      hasCompleteData: boolean;
    } | null;
  }>;
  importXtbTransactions: (
    userId: string,
    params: ImportXtbTransactionsParams,
  ) => Promise<{
    error: string | null;
    upserted: number;
    portfolioId: string | null;
    summary: {
      fileCount: number;
      upserted: number;
      newCount: number;
      openPositions: number;
      hasOrphanSells: boolean;
      hasCompleteData: boolean;
    } | null;
  }>;
}

export type ImportPortfolioOptions = {
  visibility?: InvestmentPortfolioVisibility;
  householdId?: string | null;
};

export type ImportPortfolioParams = ImportPortfolioOptions & {
  portfolioName: string;
  broker: InvestmentBroker;
  currency: string;
  positions: PositionInsert[];
  cashBalance?: number | null;
};

export type ImportEtoroTransactionsParams = ImportPortfolioOptions & {
  fileContents: Array<string | ArrayBuffer>;
  portfolioName?: string;
};

export type ImportTrading212TransactionsParams = ImportPortfolioOptions & {
  csvTexts: string[];
  portfolioName?: string;
};

export type ImportAnycoinTransactionsParams = ImportPortfolioOptions & {
  csvTexts: string[];
  portfolioName?: string;
};

export type ImportRevolutInvestTransactionsParams = ImportPortfolioOptions & {
  csvText: string;
  portfolioName?: string;
};

export type ImportXtbTransactionsParams = ImportPortfolioOptions & {
  fileContent: string | ArrayBuffer;
  portfolioName?: string;
};

export const useInvestmentStore = create<InvestmentStore>((set, get) => ({
  portfolios: [],
  selectedPortfolioIds: [],
  positions: [],
  householdId: null,
  lastUserId: null,
  isLoading: false,
  error: null,

  fetchPortfolios: async (userId: string) => {
    set({ isLoading: true, error: null, lastUserId: userId });
    try {
      const activeFromStore = useHouseholdActiveStore.getState().activeHouseholdId;
      const householdId =
        activeFromStore ?? (await fetchPrimaryHouseholdId(userId));

      const { portfolios, error } = await fetchInvestmentPortfoliosRemote({
        userId,
        activeHouseholdId: householdId,
      });
      if (error) {
        set({ error: error.message, isLoading: false });
        return;
      }
      set({ portfolios, householdId, isLoading: false });
    } catch (e) {
      console.error(
        '[Investice store fetchPortfolios] selhalo',
        `${supabaseUrl}/rest/v1/investment_portfolios`,
        e,
      );
      set({
        error: e instanceof Error ? e.message : 'Nepodařilo se načíst portfolia',
        isLoading: false,
      });
    }
  },

  fetchPositions: async (portfolioIds?: string[]) => {
    const ids =
      portfolioIds ??
      (get().selectedPortfolioIds.length > 0 ? get().selectedPortfolioIds : undefined);
    set({ isLoading: true, error: null });
    try {
      const { positions, error } = await fetchInvestmentPositionsRemote(ids);
      if (error) {
        set({ error: error.message, isLoading: false });
        return;
      }
      set({ positions, isLoading: false });
    } catch (e) {
      console.error(
        '[Investice store fetchPositions] selhalo',
        `${supabaseUrl}/rest/v1/investment_positions`,
        e,
      );
      set({
        error: e instanceof Error ? e.message : 'Nepodařilo se načíst pozice',
        isLoading: false,
      });
    }
  },

  deletePortfolio: async (id: string) => {
    const { error } = await deleteInvestmentPortfolioRemote(id);
    if (error) return { error: error.message };

    const selected = get().selectedPortfolioIds.filter((x) => x !== id);
    set({ selectedPortfolioIds: selected });

    useInvestmentPortfolioViewStore.getState().clearEntry();

    const userId = get().lastUserId;
    if (userId) {
      await get().fetchPortfolios(userId);
    }
    await get().fetchPositions(selected.length > 0 ? selected : undefined);

    return { error: null };
  },

  updatePortfolio: async (id, patch) => {
    const { portfolio, error } = await updateInvestmentPortfolioRemote(id, patch);
    if (error) return { error: error.message };

    set((state) => ({
      portfolios: state.portfolios.map((p) =>
        p.id === id
          ? {
              ...p,
              ...(portfolio ?? {}),
              ...(patch.name != null ? { name: patch.name.trim() } : {}),
              ...(patch.currency != null ? { currency: patch.currency } : {}),
            }
          : p,
      ),
    }));

    const userId = get().lastUserId;
    if (userId) {
      await get().fetchPortfolios(userId);
    }
    return { error: null };
  },

  setSelectedPortfolios: (ids: string[]) => {
    set({ selectedPortfolioIds: ids });
  },

  importEtoroPositions: async (userId, positions, portfolioName, options) => {
    return get().importPositions(userId, {
      portfolioName,
      broker: 'etoro',
      currency: 'EUR',
      positions: etoroPositionsToInserts(positions),
      visibility: options?.visibility ?? 'personal',
      householdId: options?.householdId ?? null,
    });
  },

  importPositions: async (userId, params) => {
    set({ isLoading: true, error: null });
    try {
      const visibility = params.visibility ?? 'personal';
      let householdId = params.householdId ?? null;

      if (visibility === 'shared') {
        if (!householdId) {
          householdId =
            useHouseholdActiveStore.getState().activeHouseholdId ??
            get().householdId ??
            (await fetchPrimaryHouseholdId(userId));
        }
        if (!householdId) {
          set({ isLoading: false });
          return { error: 'Společné portfolio vyžaduje domácnost.' };
        }
      }

      const { portfolio, error: createErr } = await createInvestmentPortfolioRemote({
        ownerUserId: userId,
        visibility,
        householdId: visibility === 'shared' ? householdId : null,
        name: params.portfolioName,
        broker: params.broker,
        currency: params.currency,
        cashBalance: params.cashBalance ?? null,
      });
      if (createErr || !portfolio) {
        set({ isLoading: false });
        return { error: createErr?.message ?? 'Nepodařilo se vytvořit portfolio' };
      }

      const { error: insertErr } = await insertInvestmentPositionsRemote(
        portfolio.id,
        params.positions,
      );
      if (insertErr) {
        set({ isLoading: false });
        return { error: insertErr.message };
      }

      await get().fetchPortfolios(userId);
      await get().fetchPositions();
      set({ isLoading: false });
      return { error: null };
    } catch (e) {
      console.error(
        '[Investice store importPositions] selhalo',
        `${supabaseUrl}/rest/v1/investment_portfolios`,
        e,
      );
      set({ isLoading: false });
      return { error: e instanceof Error ? e.message : 'Import se nezdařil' };
    }
  },

  importEtoroTransactions: async (userId, params) => {
    set({ isLoading: true, error: null });
    try {
      const visibility = params.visibility ?? 'personal';
      let householdId = params.householdId ?? null;

      if (visibility === 'shared') {
        if (!householdId) {
          householdId =
            useHouseholdActiveStore.getState().activeHouseholdId ??
            get().householdId ??
            (await fetchPrimaryHouseholdId(userId));
        }
        if (!householdId) {
          set({ isLoading: false });
          return {
            error: 'Společné portfolio vyžaduje domácnost.',
            upserted: 0,
            portfolioId: null,
            summary: null,
          };
        }
      }

      const { portfolioId, upserted, error, summary } = await importEtoroTransactionsFromXlsx({
        ownerUserId: userId,
        visibility,
        householdId: visibility === 'shared' ? householdId : null,
        fileContents: params.fileContents,
        portfolioName: params.portfolioName ?? 'eToro',
      });

      if (error) {
        set({ isLoading: false, error: error.message });
        return { error: error.message, upserted: 0, portfolioId: null, summary };
      }

      await get().fetchPortfolios(userId);
      set({ isLoading: false });
      return { error: null, upserted, portfolioId, summary };
    } catch (e) {
      console.error('[Investice store importEtoroTransactions] selhalo', e);
      set({ isLoading: false });
      return {
        error: e instanceof Error ? e.message : 'Import transakcí se nezdařil',
        upserted: 0,
        portfolioId: null,
        summary: null,
      };
    }
  },

  importTrading212Transactions: async (userId, params) => {
    set({ isLoading: true, error: null });
    try {
      const visibility = params.visibility ?? 'personal';
      let householdId = params.householdId ?? null;

      if (visibility === 'shared') {
        if (!householdId) {
          householdId =
            useHouseholdActiveStore.getState().activeHouseholdId ??
            get().householdId ??
            (await fetchPrimaryHouseholdId(userId));
        }
        if (!householdId) {
          set({ isLoading: false });
          return {
            error: 'Společné portfolio vyžaduje domácnost.',
            upserted: 0,
            portfolioId: null,
            hasOrphanSells: false,
            summary: null,
          };
        }
      }

      const { portfolioId, upserted, error, parseResult, summary } =
        await importTrading212TransactionsFromCsv({
          ownerUserId: userId,
          visibility,
          householdId: visibility === 'shared' ? householdId : null,
          csvTexts: params.csvTexts,
          portfolioName: params.portfolioName ?? 'Trading 212',
        });

      if (error) {
        set({ isLoading: false, error: error.message });
        return {
          error: error.message,
          upserted: 0,
          portfolioId: null,
          hasOrphanSells: parseResult.hasOrphanSells,
          summary,
        };
      }

      await get().fetchPortfolios(userId);
      set({ isLoading: false });
      return {
        error: null,
        upserted,
        portfolioId,
        hasOrphanSells: parseResult.hasOrphanSells,
        summary,
      };
    } catch (e) {
      console.error('[Investice store importTrading212Transactions] selhalo', e);
      set({ isLoading: false });
      return {
        error: e instanceof Error ? e.message : 'Import transakcí se nezdařil',
        upserted: 0,
        portfolioId: null,
        hasOrphanSells: false,
        summary: null,
      };
    }
  },

  importAnycoinTransactions: async (userId, params) => {
    set({ isLoading: true, error: null });
    try {
      const visibility = params.visibility ?? 'personal';
      let householdId = params.householdId ?? null;

      if (visibility === 'shared') {
        if (!householdId) {
          householdId =
            useHouseholdActiveStore.getState().activeHouseholdId ??
            get().householdId ??
            (await fetchPrimaryHouseholdId(userId));
        }
        if (!householdId) {
          set({ isLoading: false });
          return {
            error: 'Společné portfolio vyžaduje domácnost.',
            upserted: 0,
            portfolioId: null,
            summary: null,
          };
        }
      }

      const { portfolioId, upserted, error, summary } = await importAnycoinTransactionsFromCsv({
        ownerUserId: userId,
        visibility,
        householdId: visibility === 'shared' ? householdId : null,
        csvTexts: params.csvTexts,
        portfolioName: params.portfolioName ?? 'Anycoin',
      });

      if (error) {
        set({ isLoading: false, error: error.message });
        return {
          error: error.message,
          upserted: 0,
          portfolioId: null,
          summary,
        };
      }

      await get().fetchPortfolios(userId);
      set({ isLoading: false });
      return { error: null, upserted, portfolioId, summary };
    } catch (e) {
      console.error('[Investice store importAnycoinTransactions] selhalo', e);
      set({ isLoading: false });
      return {
        error: e instanceof Error ? e.message : 'Import transakcí se nezdařil',
        upserted: 0,
        portfolioId: null,
        summary: null,
      };
    }
  },

  importRevolutInvestTransactions: async (userId, params) => {
    set({ isLoading: true, error: null });
    try {
      const visibility = params.visibility ?? 'personal';
      let householdId = params.householdId ?? null;

      if (visibility === 'shared') {
        if (!householdId) {
          householdId =
            useHouseholdActiveStore.getState().activeHouseholdId ??
            get().householdId ??
            (await fetchPrimaryHouseholdId(userId));
        }
        if (!householdId) {
          set({ isLoading: false });
          return {
            error: 'Společné portfolio vyžaduje domácnost.',
            upserted: 0,
            portfolioId: null,
            summary: null,
          };
        }
      }

      const { portfolioId, upserted, error, summary } = await importRevolutInvestTransactionsFromCsv({
        ownerUserId: userId,
        visibility,
        householdId: visibility === 'shared' ? householdId : null,
        csvText: params.csvText,
        portfolioName: params.portfolioName ?? 'Revolut Invest',
      });

      if (error) {
        set({ isLoading: false, error: error.message });
        return { error: error.message, upserted: 0, portfolioId: null, summary };
      }

      await get().fetchPortfolios(userId);
      set({ isLoading: false });
      return { error: null, upserted, portfolioId, summary };
    } catch (e) {
      console.error('[Investice store importRevolutInvestTransactions] selhalo', e);
      set({ isLoading: false });
      return {
        error: e instanceof Error ? e.message : 'Import transakcí se nezdařil',
        upserted: 0,
        portfolioId: null,
        summary: null,
      };
    }
  },

  importXtbTransactions: async (userId, params) => {
    set({ isLoading: true, error: null });
    try {
      const visibility = params.visibility ?? 'personal';
      let householdId = params.householdId ?? null;

      if (visibility === 'shared') {
        if (!householdId) {
          householdId =
            useHouseholdActiveStore.getState().activeHouseholdId ??
            get().householdId ??
            (await fetchPrimaryHouseholdId(userId));
        }
        if (!householdId) {
          set({ isLoading: false });
          return {
            error: 'Společné portfolio vyžaduje domácnost.',
            upserted: 0,
            portfolioId: null,
            summary: null,
          };
        }
      }

      const { portfolioId, upserted, error, summary } = await importXtbTransactionsFromXlsx({
        ownerUserId: userId,
        visibility,
        householdId: visibility === 'shared' ? householdId : null,
        fileContent: params.fileContent,
        portfolioName: params.portfolioName ?? 'XTB',
      });

      if (error) {
        set({ isLoading: false, error: error.message });
        return { error: error.message, upserted: 0, portfolioId: null, summary };
      }

      await get().fetchPortfolios(userId);
      set({ isLoading: false });
      return { error: null, upserted, portfolioId, summary };
    } catch (e) {
      console.error('[Investice store importXtbTransactions] selhalo', e);
      set({ isLoading: false });
      return {
        error: e instanceof Error ? e.message : 'Import transakcí se nezdařil',
        upserted: 0,
        portfolioId: null,
        summary: null,
      };
    }
  },
}));
