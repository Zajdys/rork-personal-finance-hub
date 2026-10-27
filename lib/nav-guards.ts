/** Jednorázově potlačí auto-redirect na /(tabs) (např. po welcome-tour → paywall). */
let suppressTabsRedirectOnce = false;

export function suppressNextTabsRedirect(): void {
  suppressTabsRedirectOnce = true;
}

export function consumeSuppressTabsRedirect(): boolean {
  const v = suppressTabsRedirectOnce;
  suppressTabsRedirectOnce = false;
  return v;
}
