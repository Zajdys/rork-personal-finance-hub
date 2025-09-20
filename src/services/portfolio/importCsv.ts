import { toNum } from "@/src/lib/num";
import { normalizeCashSign } from "@/src/lib/sign";

export type Txn = {
  time: string;             // ISO
  action: string;           // Buy|Sell|Dividend|Interest|Fee|Tax|...
  ticker?: string;
  isin?: string;
  name?: string;
  shares?: number | null;     // z CSV (na transakci)
  price?: number | null;      // Price / share (měna viz níže)
  ccyPrice?: string;        // Currency (Price / share)
  amount?: number | null;      // Amount (cash tok) už po znaménku
  fees?: number;            // součet všech fee
  taxes?: number;           // součet všech daní
  ccyAmount?: string;       // Currency (Amount)
  feesCurrency?: string;    // Currency (Fees)
  splitRatio?: number | null; // korporátní akce: násobek počtu kusů (new = old * ratio)
};

type Raw = Record<string, string | undefined>;

function field(r: Raw, keys: string[]) {
  for (const k of keys) if (r[k] != null) return r[k];
  // fallback case-insensitive
  const lowerMap: Record<string, string | undefined> = {};
  for (const kk in r) lowerMap[kk.toLowerCase()] = r[kk];
  for (const k of keys) {
    const v = lowerMap[k.toLowerCase()];
    if (v != null) return v;
  }
  return undefined;
}

function pickAmountKey(r: Raw) {
  return field(r, [
    "Total", "Result", "Amount", "Amount value", "Total amount",
    "Celkem", "Částka", "Hodnota", "Suma", "Objem"
  ]);
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
  const action = field(r, ["Action", "type"]) || "";

  const explicitCashAmount = toNum(pickAmountKey(r));

  let shares = toNum(field(r, [
    "No. of shares", "amount", "Quantity", "Shares", "Units",
    "Počet", "Množství", "Kusy", "Ks"
  ]));
  const price = toNum(field(r, [
    "Price / share", "unitPrice", "Price", "Unit Price", "Share Price",
    "Cena za kus", "Jednotková cena", "Cena"
  ]));

  const ccyPrice = field(r, [
    "Currency (Price / share)", "currency", "Currency (Amount)",
    "Price Currency", "Currency", "Měna"
  ]) || "";
  const ccyAmount = field(r, [
    "Currency (Total)", "Currency (Result)", "Currency (Amount)",
    "currency", "Amount Currency", "Total Currency", "Měna"
  ]) || "";

  const fees = (toNum(field(r, [
    "Fee amount", "Deposit fee", "Charge amount", "Currency conversion fee", "fees",
    "Fee", "Commission", "Poplatek", "Provize"
  ])) ?? 0);

  const taxes = (toNum(field(r, [
    "Tax amount", "Withholding tax", "French transaction tax", "taxes",
    "Tax", "Daň", "Srážková daň"
  ])) ?? 0);

  const splitRatio = parseSplitRatio(field(r, ["Split ratio", "Ratio", "Split", "Reverse split"])) ?? null;

  let amount: number | null = null;
  if (explicitCashAmount != null) {
    amount = normalizeCashSign(action, explicitCashAmount);
  } else if (shares != null && price != null) {
    amount = normalizeCashSign(action, shares * price);
  }

  return {
    time: field(r, ["Time", "Date", "Datum", "Čas"]) || "",
    action,
    ticker: field(r, ["Ticker", "Symbol", "Instrument", "Nástroj"]),
    isin: field(r, ["ISIN", "Isin"]),
    name: field(r, ["Name", "Instrument name", "Název", "Název nástroje"]),
    shares,
    price,
    ccyPrice,
    amount,
    fees,
    taxes,
    ccyAmount,
    feesCurrency: field(r, ["feesCurrency", "Fee Currency", "Měna poplatku"]),
    splitRatio,
  };
}

export function calcNetCash(t: Txn): number {
  const amt = t.amount ?? 0;
  return amt - (t.fees ?? 0) - (t.taxes ?? 0);
}
