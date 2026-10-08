/**
 * Kontomatik target / officialName → naše transactions.source.
 * Neznámý target → 'bank_import' (import projde, UI může upozornit).
 */
const TARGET_TO_SOURCE: Record<string, string> = {
  // Common CZ PSD2 / fallback target name fragments (case-insensitive match below)
  csas: 'cs',
  ceskasporitelna: 'cs',
  'ceska-sporitelna': 'cs',
  sporitelna: 'cs',
  csob: 'csob',
  kb: 'kb',
  komercni: 'kb',
  'komercni-banka': 'kb',
  fio: 'fio',
  airbank: 'airbank',
  moneta: 'moneta',
  mbank: 'mbank',
  raiffeisen: 'raiffeisenbank',
  rb: 'raiffeisenbank',
  revolut: 'revolut',
  kontobank: 'kontobank',
  kontobankapi: 'kontobank',
};

export function mapKontomatikTargetToSource(
  target: string | null | undefined,
  officialName?: string | null,
): string {
  const blob = `${target ?? ''} ${officialName ?? ''}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '');

  if (!blob) return 'bank_import';

  for (const [key, source] of Object.entries(TARGET_TO_SOURCE)) {
    const k = key.replace(/[^a-z0-9]+/g, '');
    if (blob.includes(k)) return source;
  }
  return 'bank_import';
}
