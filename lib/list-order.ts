/** Sloučení uloženého pořadí ID s aktuální položkami (nové na konec). */
export function mergeOrderIds(saved: string[], itemIds: string[]): string[] {
  const idSet = new Set(itemIds);
  const merged = saved.filter((id) => idSet.has(id));
  for (const id of itemIds) {
    if (!merged.includes(id)) merged.push(id);
  }
  return merged;
}

/** Posun položky o jedno místo nahoru / dolů v pořadí. */
export function moveItemInOrder(order: string[], id: string, direction: 'up' | 'down'): string[] {
  const index = order.indexOf(id);
  if (index < 0) return order;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= order.length) return order;
  const next = [...order];
  const [removed] = next.splice(index, 1);
  next.splice(target, 0, removed);
  return next;
}
