/**
 * Pravidelný výdaj domácnosti: sdílené vidí všichni; typ „jen můj“ jen autor (created_by / legacy added_by).
 */
export function isRecurringHouseholdExpenseVisible(
  splitType: unknown,
  createdBy: string | null | undefined,
  addedBy: string | null | undefined,
  currentUserId: string | undefined
): boolean {
  const st = String(splitType ?? 'mine').toLowerCase();
  if (st === 'shared_half' || st === 'shared_custom') return true;
  if (!currentUserId) return false;
  const author = createdBy ?? addedBy;
  return author === currentUserId;
}
