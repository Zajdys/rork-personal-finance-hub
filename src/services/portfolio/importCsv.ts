import { toNum } from "@/src/lib/num";
import { normalizeCashSign } from "@/src/lib/sign";

export type Txn = {
  time?: string;
  action?: string;
  ccyAmount?: string;  // měna cash toků
  ccyPrice?: string;   // měna ceny akcie
  amount?: number | null; // už po normalizaci znaménka
  fees?: number;
  taxes?: number;
  price?: number | null;
  shares?: number | null;
  ticker?: string;
  name?: string;
  splitRatio?: number | null; // korporátní akce: násobek počtu kusů (new = old * ratio)
};

type Raw = Record<string, string | undefined>;

function field(r: Raw, keys: string[]) {
  for (const k of keys) if (r[k] != null) return r[k];
  return undefined;
}

function pickAmountKey(r: Raw) {
  return field(r, ["Amount", "Amount value", "Total amount"]);
}

function parseSplitRatio(raw?: string): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const colon = s.split(":");
  const slash = s.split("/");
  const parts = colon.length === 2 ? colon : (slash.length === 2 ? slash : null);
  if (parts) {
    const a = toNum(parts[0]);
    const b = toNum(parts[1]);
    if ((a ?? 0) > 0 && (b ?? 0) > 0) return (a as number) / (b as number);
  }
  const x = toNum(s);
  return x && x > 0 ? x : null;
}

export function mapRow(r: Raw): Txn {
  const amount0 = toNum(pickAmountKey(r));
  const amount  = normalizeCashSign(r["Action"], amount0);

  const fees = (toNum(r["Fee amount"]) ?? 0)
             + (toNum(r["Deposit fee"]) ?? 0)
             + (toNum(r["Charge amount"]) ?? 0)
             + (toNum(r["Currency conversion fee"]) ?? 0);

  const taxes = (toNum(r["Tax amount"]) ?? 0)
              + (toNum(r["Withholding tax"]) ?? 0)
              + (toNum(r["French transaction tax"]) ?? 0);

  const splitRatio = parseSplitRatio(field(r, ["Split ratio", "Ratio", "Split", "Reverse split"])) ?? null;

  return {
    time: r["Time"],
    action: r["Action"],
    ccyAmount: r["Currency (Amount)"] || "",
    ccyPrice: r["Currency (Price / share)"] || r["Currency (Amount)"] || "",
    amount,
    fees,
    taxes,
    price: toNum(r["Price / share"]),
    shares: toNum(r["No. of shares"]),
    ticker: r["Ticker"],
    name: r["Name"],
    splitRatio,
  };
}

export function calcNetCash(t: Txn): number {
  const amt = t.amount ?? 0;
  return amt - (t.fees ?? 0) - (t.taxes ?? 0);
}
