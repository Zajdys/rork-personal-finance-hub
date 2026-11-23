/** Délka pracovního dne pro převod hodin na „dny práce“. */
export const WORKDAY_HOURS = 8;

type Tr = (cs: string, en: string) => string;

/**
 * „1 den a 2 hodiny“ – dny počítané jako 8hodinové pracovní dny.
 * `tr` je překladová funkce z language-store (cs, en).
 */
export function formatWorkTime(hours: number, tr: Tr): string {
  const totalMin = Math.max(0, Math.round(hours * 60));
  if (totalMin < 60) return tr(`${totalMin} min`, `${totalMin} min`);
  const days = Math.floor(totalMin / (WORKDAY_HOURS * 60));
  const restMin = totalMin - days * WORKDAY_HOURS * 60;
  const h = Math.floor(restMin / 60);
  const m = restMin % 60;
  const csPl = (n: number, one: string, few: string, many: string) =>
    n === 1 ? one : n >= 2 && n <= 4 ? few : many;
  const parts: string[] = [];
  if (days > 0) {
    parts.push(tr(`${days} ${csPl(days, 'den', 'dny', 'dní')}`, `${days} ${days === 1 ? 'day' : 'days'}`));
  }
  if (h > 0) {
    parts.push(tr(`${h} ${csPl(h, 'hodina', 'hodiny', 'hodin')}`, `${h} ${h === 1 ? 'hour' : 'hours'}`));
  }
  if (days === 0 && m > 0) parts.push(tr(`${m} min`, `${m} min`));
  if (parts.length === 0) return tr('0 min', '0 min');
  const last = parts.pop()!;
  return parts.length ? `${parts.join(', ')} ${tr('a', 'and')} ${last}` : last;
}
