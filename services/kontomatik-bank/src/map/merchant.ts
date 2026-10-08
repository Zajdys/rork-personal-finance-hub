/** Minimal merchant_key normalizer (mirrors lib/normalize-merchant-key intent). */
export function normalizeMerchantKey(raw: string): string {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  s = s.split(';')[0]!.trim();
  if (!s) return '';
  s = s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase();
  s = s.replace(/[^A-Z0-9 .*-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.slice(0, 120);
}

export function normalizeAccount(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).replace(/\s+/g, '').toUpperCase();
  if (!s) return null;
  return s;
}
