/**
 * Ruční mapování broker ticker → Yahoo Finance symbol.
 *
 * Revolut Invest CSV dává holé tickery bez burzy (RHM, VUAA).
 * Sem doplň / oprav mapování, když cena nejde načíst.
 *
 * Formát: 'TICKER': 'YAHOO_SYMBOL'
 * Příklady: evropské akcie → .DE / .PA / …, LSE ETF → .L, US bez přípony.
 */
export const YAHOO_SYMBOL_OVERRIDES: Record<string, string> = {
  // Revolut / holé EU tickery
  RHM: 'RHM.DE',
  VUAA: 'VUAA.DE',
  // Další holé fallbacky (bez ISIN)
  P911: 'P911.DE',
  ADS: 'ADS.DE',
};

/**
 * XTB / evropské burzovní přípony → Yahoo Finance suffix.
 * '' = odstranit příponu (US).
 *
 * XTB: VUAA.UK → VUAA.L (LSE, často USD kotace)
 * XTB: VWCE.DE → VWCE.DE (XETRA)
 * XTB: AAPL.US → AAPL
 */
export const YAHOO_EXCHANGE_SUFFIX_OVERRIDES: Record<string, string> = {
  UK: 'L',
  L: 'L',
  DE: 'DE',
  US: '',
  FR: 'PA',
  PA: 'PA',
  NL: 'AS',
  AS: 'AS',
  PL: 'WA',
  WA: 'WA',
  ES: 'MC',
  MC: 'MC',
  IT: 'MI',
  MI: 'MI',
  BE: 'BR',
  BR: 'BR',
  PT: 'LS',
  LS: 'LS',
  AT: 'VI',
  VI: 'VI',
  SE: 'ST',
  ST: 'ST',
  CH: 'SW',
  SW: 'SW',
  DK: 'CO',
  CO: 'CO',
  NO: 'OL',
  OL: 'OL',
  FI: 'HE',
  HE: 'HE',
  HK: 'HK',
  T: 'T', // Tokyo Stock Exchange (.T) — ne US třída akcií
};
