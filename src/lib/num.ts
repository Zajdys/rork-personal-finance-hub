export function toNum(raw: unknown): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  const parenNeg = /^\(.+\)$/.test(s);
  if (parenNeg) s = s.slice(1, -1);

  s = s
    .replace(/\u00A0|\u202F|\u2009/g, "") // NBSP, NNBSP, thin space
    .replace(/[€$£¥₹₽₺₿₴₩₫₦₪₱]|Kč|CZK|PLN|CHF|JPY|USD|EUR|GBP/gi, "")
    .replace(/'/g, "")
    .replace(/[−‒—–]/g, "-")
    .replace(/%/g, "")
    .trim();

  let sign = 1;
  if (/^-/.test(s)) {
    sign = -1;
    s = s.replace(/^-+/, "");
  }
  if (/-$/.test(s)) {
    sign = -1;
    s = s.replace(/-$/, "");
  }
  if (/^\+/.test(s)) s = s.replace(/^\+/, "");

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1 && lastComma > -1) {
    s = s.replace(/,/g, "");
  } else {
    if (s.includes(",") && !s.includes(".")) {
      if (/^\d{1,3}(,\d{3})+$/.test(s)) {
        s = s.replace(/,/g, "");
      } else {
        s = s.replace(/,/g, ".");
      }
    }
  }

  s = s.replace(/[^0-9.\-]/g, "");
  if (!s) return null;
  const n = Number(s) * (parenNeg ? -sign : sign);
  return Number.isFinite(n) ? n : null;
}
