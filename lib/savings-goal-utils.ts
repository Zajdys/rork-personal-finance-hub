/** Kalendářní dny do termínu (záporné = po termínu). */
export function daysUntilDeadline(deadlineIso: string, from = new Date()): number {
  const end = new Date(deadlineIso);
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function formatGoalDeadlineCs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
