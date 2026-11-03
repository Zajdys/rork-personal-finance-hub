/**
 * Krátce potlačí auto-redirect gate v _layout (např. po welcome-tour → paywall / import).
 * Platí ~2,5 s, ať ho nespotřebuje první z několika rychle po sobě jdoucích běhů gate efektu.
 */
let suppressUntil = 0;

export function suppressNextTabsRedirect(ms = 2500): void {
  suppressUntil = Date.now() + ms;
}

export function consumeSuppressTabsRedirect(): boolean {
  return Date.now() < suppressUntil;
}
