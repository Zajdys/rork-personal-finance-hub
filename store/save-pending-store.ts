import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const STORAGE_SAVED_TOTAL = 'save_decision_total';
export const STORAGE_PENDING = 'save_pending_items';

/** Položka „Rozmyslet“ – jen aktivní záznamy (bez stavu saved/bought v úložišti). */
export type SavePendingItem = {
  id: string;
  title: string;
  price: number;
  hoursNeeded: number;
  futureValue: number;
  createdAt: number;
  remindAt: number;
  notificationId?: string;
};

function stripLegacyStatus(raw: Record<string, unknown>): SavePendingItem | null {
  const status = raw.status as string | undefined;
  if (status === 'saved' || status === 'bought') return null;
  const id = String(raw.id ?? '');
  if (!id) return null;
  return {
    id,
    title: String(raw.title ?? ''),
    price: Number(raw.price) || 0,
    hoursNeeded: Number(raw.hoursNeeded) || 0,
    futureValue: Number(raw.futureValue) || 0,
    createdAt: Number(raw.createdAt) || 0,
    remindAt: Number(raw.remindAt) || 0,
    notificationId: typeof raw.notificationId === 'string' ? raw.notificationId : undefined,
  };
}

function normalizePendingList(parsed: unknown): SavePendingItem[] {
  if (!Array.isArray(parsed)) return [];
  const out: SavePendingItem[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const item = stripLegacyStatus(row as Record<string, unknown>);
    if (item) out.push(item);
  }
  return out;
}

async function cancelNotif(id?: string) {
  if (!id || Platform.OS === 'web') return;
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    /* ignore */
  }
}

interface SavePendingState {
  pendingItems: SavePendingItem[];
  savedTotal: number;
  isLoaded: boolean;
  loadFromStorage: () => Promise<void>;
  addPendingItem: (item: SavePendingItem) => void;
  updatePendingItemNotificationId: (id: string, notificationId: string) => void;
  removePendingItem: (id: string) => void;
  incrementSavedTotal: (amount: number) => void;
}

async function persistState(items: SavePendingItem[], savedTotal: number) {
  try {
    await AsyncStorage.multiSet([
      [STORAGE_PENDING, JSON.stringify(items)],
      [STORAGE_SAVED_TOTAL, String(savedTotal)],
    ]);
  } catch (e) {
    console.warn('[save-pending] persist', e);
  }
}

export const useSavePendingStore = create<SavePendingState>((set, get) => ({
  pendingItems: [],
  savedTotal: 0,
  isLoaded: false,

  loadFromStorage: async () => {
    try {
      const [t, p] = await Promise.all([
        AsyncStorage.getItem(STORAGE_SAVED_TOTAL),
        AsyncStorage.getItem(STORAGE_PENDING),
      ]);
      let savedTotal = 0;
      if (t != null) {
        const n = parseFloat(t);
        if (Number.isFinite(n)) savedTotal = n;
      }
      let pendingItems: SavePendingItem[] = [];
      let rawLen = 0;
      if (p) {
        try {
          const raw = JSON.parse(p) as unknown;
          pendingItems = normalizePendingList(raw);
          rawLen = Array.isArray(raw) ? raw.length : 0;
        } catch {
          pendingItems = [];
        }
      }
      set({ pendingItems, savedTotal, isLoaded: true });
      if (p && rawLen > 0 && pendingItems.length !== rawLen) {
        await persistState(pendingItems, savedTotal);
      }
    } catch (e) {
      console.warn('[save-pending] load', e);
      set({ isLoaded: true });
    }
  },

  addPendingItem: (item) => {
    set((s) => ({ pendingItems: [item, ...s.pendingItems] }));
    const { pendingItems, savedTotal } = get();
    void persistState(pendingItems, savedTotal);
  },

  updatePendingItemNotificationId: (id, notificationId) => {
    set((s) => ({
      pendingItems: s.pendingItems.map((e) => (e.id === id ? { ...e, notificationId } : e)),
    }));
    const { pendingItems, savedTotal } = get();
    void persistState(pendingItems, savedTotal);
  },

  removePendingItem: (id) => {
    const item = get().pendingItems.find((i) => i.id === id);
    set((s) => ({ pendingItems: s.pendingItems.filter((i) => i.id !== id) }));
    const { pendingItems, savedTotal } = get();
    void persistState(pendingItems, savedTotal);
    void cancelNotif(item?.notificationId);
  },

  incrementSavedTotal: (amount) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    set((s) => ({ savedTotal: s.savedTotal + amount }));
    const { pendingItems, savedTotal } = get();
    void persistState(pendingItems, savedTotal);
  },
}));

export const SAVE_PENDING_NOTIFICATION_TYPE = 'save_pending_decision';
