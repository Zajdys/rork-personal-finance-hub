import { useRef, useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { moveItemInOrder } from '@/lib/list-order';
import { useLanguageStore } from '@/store/language-store';

export function useDraggableList<T extends { id: string }>(items: T[], storageKey: string) {
  const [orderedItems, setOrderedItems] = useState(items);
  const orderedItemsRef = useRef(orderedItems);

  useEffect(() => {
    orderedItemsRef.current = orderedItems;
  }, [orderedItems]);

  useEffect(() => {
    setOrderedItems((prev) => {
      const prevIds = prev.map((i) => i.id);
      const byId = new Map(items.map((i) => [i.id, i]));
      const merged = prevIds.map((id) => byId.get(id)).filter((i): i is T => i != null);
      const missing = items.filter((i) => !prevIds.includes(i.id));
      return [...merged, ...missing];
    });
  }, [items]);

  const persistOrder = useCallback(
    async (ids: string[]) => {
      await AsyncStorage.setItem(storageKey, JSON.stringify(ids));
    },
    [storageKey],
  );

  const loadOrder = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(storageKey);
      if (!saved) return;
      const ids: string[] = JSON.parse(saved);
      if (!Array.isArray(ids)) return;
      const reordered = ids
        .map((id) => items.find((i) => i.id === id))
        .filter((i): i is T => i != null);
      const missing = items.filter((i) => !ids.includes(i.id));
      setOrderedItems([...reordered, ...missing]);
    } catch {
      // ignore invalid storage
    }
  }, [items, storageKey]);

  const moveItem = useCallback(
    (id: string, direction: 'up' | 'down') => {
      setOrderedItems((prev) => {
        const ids = prev.map((i) => i.id);
        const nextIds = moveItemInOrder(ids, id, direction);
        if (nextIds === ids) return prev;
        const byId = new Map(prev.map((i) => [i.id, i]));
        const next = nextIds
          .map((itemId) => byId.get(itemId))
          .filter((i): i is T => i != null);
        void persistOrder(nextIds);
        return next;
      });
    },
    [persistOrder],
  );

  const showReorderAlert = useCallback(
    (id: string) => {
      const { t } = useLanguageStore.getState();
      const current = orderedItemsRef.current;
      const index = current.findIndex((i) => i.id === id);
      if (index < 0) return;

      const canUp = index > 0;
      const canDown = index < current.length - 1;
      const buttons: {
        text: string;
        onPress?: () => void;
        style?: 'cancel' | 'default' | 'destructive';
      }[] = [];

      if (canUp) {
        buttons.push({ text: t('listOrderMoveUp'), onPress: () => moveItem(id, 'up') });
      }
      if (canDown) {
        buttons.push({ text: t('listOrderMoveDown'), onPress: () => moveItem(id, 'down') });
      }
      buttons.push({ text: t('cancel'), style: 'cancel' });

      Alert.alert(t('listReorderTitle'), undefined, buttons);
    },
    [moveItem],
  );

  return { orderedItems, loadOrder, showReorderAlert };
}
