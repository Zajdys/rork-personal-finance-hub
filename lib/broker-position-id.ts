/**
 * Broker Position ID — legacy tag v `investment_transactions.note`.
 * Primárně ukládej do sloupce `lot_id`; note tag zůstává jako fallback.
 * Formát: `[xtb-pos:123456]` / `[etoro-pos:…]` na začátku note.
 */
const POSITION_NOTE_RE = /^\[(xtb|etoro)-pos:([^\]]+)\]\s*/i;

export function encodeBrokerPositionNote(
  note: string | null | undefined,
  positionId: string | null | undefined,
  broker: 'xtb' | 'etoro' = 'xtb',
): string | null {
  const pid = String(positionId ?? '').trim();
  const stripped = String(note ?? '')
    .trim()
    .replace(POSITION_NOTE_RE, '')
    .trim();
  if (!pid || pid === '-') return stripped || null;
  const tag = `[${broker}-pos:${pid}]`;
  return stripped ? `${tag} ${stripped}` : tag;
}

export function parseBrokerPositionIdFromNote(
  note: string | null | undefined,
): string | null {
  const m = String(note ?? '').match(POSITION_NOTE_RE);
  const pid = m?.[2]?.trim();
  return pid && pid !== '-' ? pid : null;
}
