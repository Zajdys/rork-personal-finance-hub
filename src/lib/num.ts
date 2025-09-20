export function toNum(raw: unknown): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Odstranit různé typy mezer a symboly měn
  s = s.replace(/\u00A0/g, "").replace(/\s+/g, "").replace(/[€$£¥₹]|Kč|USD|EUR|CZK|GBP/gi, "");
  
  // Odstranit závorky pro záporná čísla (např. "(123.45)" -> "-123.45")
  let isNegative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    isNegative = true;
    s = s.slice(1, -1);
  }
  
  // Zpracovat různé formáty desetinných míst
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  
  if (lastComma > lastDot) {
    // Evropský formát: 1.234.567,89 -> 1234567.89
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1 && lastComma > -1) {
    // Americký formát: 1,234,567.89 -> 1234567.89
    s = s.replace(/,/g, "");
  } else {
    // Pouze čárka nebo pouze tečka
    if (s.includes(",") && !s.includes(".")) {
      // Pokud je čárka na konci nebo má méně než 3 číslice za sebou, je to desetinná čárka
      const commaIndex = s.indexOf(",");
      const afterComma = s.substring(commaIndex + 1);
      if (afterComma.length <= 3 && !/\d{4,}/.test(afterComma)) {
        s = s.replace(",", ".");
      } else {
        // Jinak je to tisícový oddělovač
        s = s.replace(/,/g, "");
      }
    }
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  
  return isNegative ? -Math.abs(n) : n;
}
