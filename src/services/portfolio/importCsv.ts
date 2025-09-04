import { toNum } from "@/src/lib/num";
import { normalizeCashSign } from "@/src/lib/sign";

export type Raw = Record<string, string | undefined>;
export type Txn = {
  time?: string;
  action?: string;
  ccyAmount?: string;
  ccyPrice?: string;
  amount?: number | null;        // po normalizaci znaménka
  fees?: number;
  taxes?: number;
  price?: number | null;
  shares?: number | null;
  ticker?: string;
  name?: string;
};

function pickAmountKey(r: Raw) {
  return r["Amount"] ?? r["Amount value"] ?? r["Total amount"] ?? null;
}

export function mapRow(r: Raw): Txn {
  try {
    const amount0 = toNum(pickAmountKey(r));
    const amount  = normalizeCashSign(r["Action"], amount0);

    const fees = (toNum(r["Fee amount"]) ?? 0)
               + (toNum(r["Deposit fee"]) ?? 0)
               + (toNum(r["Charge amount"]) ?? 0)
               + (toNum(r["Currency conversion fee"]) ?? 0);
  
    const taxes = (toNum(r["Tax amount"]) ?? 0)
                + (toNum(r["Withholding tax"]) ?? 0)
                + (toNum(r["French transaction tax"]) ?? 0);
  
    const txn: Txn = {
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
    };

    console.log("[importCsv.mapRow] mapped", { inputKeys: Object.keys(r), txn });
    return txn;
  } catch (err) {
    console.error("[importCsv.mapRow] error", err);
    return {};
  }
}

export function calcNetCash(t: Txn): number {
  const amt = t.amount ?? 0;
  const net = amt - (t.fees ?? 0) - (t.taxes ?? 0);
  console.log("[importCsv.calcNetCash]", { amt, fees: t.fees ?? 0, taxes: t.taxes ?? 0, net });
  return net;
}
