/**
 * Edge copy of utils/normalizeAccount.ts — keep in sync.
 */
export function normalizeAccount(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let s = String(raw).replace(/\s+/g, "").trim();
  if (!s) return null;

  const ibanCompact = s.toUpperCase();
  if (/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(ibanCompact) && ibanCompact.length >= 15) {
    if (ibanCompact.startsWith("CZ") && ibanCompact.length === 24) {
      const domestic = czechIbanToDomestic(ibanCompact);
      if (domestic) return domestic;
    }
    return ibanCompact;
  }

  const dom = s.match(/^(?:(\d{1,6})-)?(\d{2,16})\/(\d{4})$/);
  if (dom) {
    const prefixRaw = dom[1];
    const number = (dom[2] ?? "").replace(/^0+/, "") || "0";
    const bank = dom[3]!;
    const prefix = prefixRaw ? prefixRaw.replace(/^0+/, "") : "";
    return prefix ? `${prefix}-${number}/${bank}` : `${number}/${bank}`;
  }

  return s;
}

function czechIbanToDomestic(iban: string): string | null {
  const m = iban.match(/^CZ\d{2}(\d{4})(\d{6})(\d{10})$/);
  if (!m) return null;
  const bank = m[1]!;
  const prefixRaw = m[2]!;
  const numberRaw = m[3]!;
  const prefix = prefixRaw.replace(/^0+/, "");
  const number = numberRaw.replace(/^0+/, "") || "0";
  return prefix ? `${prefix}-${number}/${bank}` : `${number}/${bank}`;
}

export function isOwnCounterpartyAccount(
  counterpartyAccount: string | null | undefined,
  ownerAccounts: string[] | null | undefined,
): boolean {
  const cp = normalizeAccount(counterpartyAccount);
  if (!cp || !ownerAccounts?.length) return false;
  for (const raw of ownerAccounts) {
    if (normalizeAccount(raw) === cp) return true;
  }
  return false;
}
