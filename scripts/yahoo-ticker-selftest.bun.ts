/**
 * Self-test: Yahoo ticker mapping + GBp normalization.
 * Run: bun scripts/yahoo-ticker-selftest.bun.ts
 */
import { toYahooSymbol, normalizeYahooPrice, isYahooPenceCurrency, fetchYahooPriceInCurrency } from '../lib/yahoo-ticker.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

console.log('=== Yahoo ticker self-test ===');

const mapCases: [string, string, string?][] = [
  // XTB-style suffixes
  ['VUAA.UK', 'VUAA.L'],
  ['CNDX.UK', 'CNDX.L'],
  ['VWCE.DE', 'VWCE.DE'],
  ['VVSM.DE', 'VVSM.DE'],
  ['AAPL.US', 'AAPL'],
  ['MSFT.US', 'MSFT'],
  ['ASML.NL', 'ASML.AS'],
  ['AIR.FR', 'AIR.PA'],
  ['SAN.ES', 'SAN.MC'],
  ['ENEL.IT', 'ENEL.MI'],
  ['NESN.CH', 'NESN.SW'],
  ['PKO.PL', 'PKO.WA'],
  ['EDP.PT', 'EDP.LS'],
  ['ABI.BE', 'ABI.BR'],
  ['UNKNOWN.ZZ', 'UNKNOWN.ZZ'],
  ['AAPL', 'AAPL'],
  // Explicit fallback (no ISIN) — lib/yahoo-symbol-overrides.ts
  ['P911', 'P911.DE'],
  ['RHM', 'RHM.DE'],
  ['VUAA', 'VUAA.DE'],
  ['ADS', 'ADS.DE'],
  // Trading 212: bare ticker + ISIN country
  ['P911', 'P911.DE', 'DE000PAG9113'],
  ['SU', 'SU.PA', 'FR0000121972'],
  ['AIR', 'AIR.PA', 'FR0000120073'],
  ['ASML', 'ASML.AS', 'NL0010273215'],
  ['SAN', 'SAN.MC', 'ES0113900J37'],
  ['ENEL', 'ENEL.MI', 'IT0003128367'],
  ['AAPL', 'AAPL', 'US0378331005'],
  ['VUSA', 'VUSA.L', 'IE00B3XXRP09'],
  // T212 noise suffixes
  ['AAPL_US', 'AAPL'],
  ['VUSA_EQ', 'VUSA.L', 'IE00B3XXRP09'],
  // Suffix in ticker wins over ISIN
  ['VWCE.DE', 'VWCE.DE', 'IE00BK5BQT80'],
  // eToro-specific
  ['BRK.B', 'BRK-B'],
  ['ADBE.RTH', 'ADBE'],
  ['ASML.NV.AS', 'ASML.AS', 'NL0010273215'],
  ['ASML.NV', 'ASML.AS', 'NL0010273215'],
  ['01211.HK', '1211.HK', 'CNE100000296'],
  ['0700.HK', '0700.HK'],
  ['AUS.DE', 'AUS.F', 'AT0000969985'],
  ['LIN', 'LIN', 'IE000S9YS762'],
  ['ABT.US', 'ABT'],
  ['NOVO-B', 'NOVO-B.CO', 'DK0062498333'],
  ['BLBD', 'BLBD'],
  ['8001.T', '8001.T'],
  ['WIZZ', 'WIZZ.L'],
  ['KAP.L', 'KAP.IL'],
  ['DG', 'DG.PA'],
  ['SU', 'SU.PA'],
  ['SMSN.L', 'SMSN.IL'],
];

for (const [input, expected, isin] of mapCases) {
  const got = toYahooSymbol(input, isin);
  const label = isin ? `${input} + ${isin}` : input;
  assert(got === expected, `${label} → ${got}, expected ${expected}`);
}

const gbp = normalizeYahooPrice(12345, 'GBp');
assert(gbp.currency === 'GBP', `GBp currency → GBP got ${gbp.currency}`);
assert(Math.abs(gbp.price - 123.45) < 1e-9, `GBp /100 got ${gbp.price}`);

const gbx = normalizeYahooPrice(200, 'GBX');
assert(gbx.currency === 'GBP' && gbx.price === 2, `GBX got ${JSON.stringify(gbx)}`);

const eur = normalizeYahooPrice(100.5, 'EUR');
assert(eur.currency === 'EUR' && eur.price === 100.5, `EUR unchanged`);

const pounds = normalizeYahooPrice(10.5, 'GBP');
assert(pounds.currency === 'GBP' && pounds.price === 10.5 && !pounds.dividedBy100, `GBP major unchanged`);

const smsn = normalizeYahooPrice(1179.5, 'USD');
assert(smsn.price === 1179.5 && smsn.currency === 'USD' && !smsn.dividedBy100, `SMSN.L USD must not divide`);
assert(!isYahooPenceCurrency('USD'), 'USD is not pence');
assert(isYahooPenceCurrency('GBp'), 'GBp is pence');

console.log('=== ALL YAHOO TICKER SELF-TEST PASSED ===');
