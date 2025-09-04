export function toNum(raw: unknown): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // měnové symboly + NBSP/mezery
  s = s.replace(/\u00A0/g, "").replace(/\s/g, "").replace(/[€$£]|Kč/g, "");

  // rozhodni desetinný oddělovač podle poslední interpunkce
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // 1.234,56 -> 1234.56
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1 && lastComma > -1) {
    // 1,234.56 -> 1234.56
    s = s.replace(/,/g, "");
  } else {
    if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
