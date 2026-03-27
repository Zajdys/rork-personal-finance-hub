import type { Txn } from "./importCsv";
import { buildPositions } from "./holdings";

export type AllocationRow = {
  ccy: string;
  label: string;
  value: number;
  weightPct: number | null;
};

export type PortfolioRow = {
  symbol: string;
  shares: number;
  lastPrice: number;
  positionValue: number;
  ccy: string;
  weightPct: number; // within its currency; 0 when total is 0
};

export type CashRow = {
  ccy: string;
  cashValue: number;
  weightPct: number; // within its currency; 0 when total is 0
};

export function valueAndWeightsByCurrency(txns: Txn[]): AllocationRow[] {
  try {
    console.log("[allocation] valueAndWeightsByCurrency: txns count=", txns?.length ?? 0);

    const positions = buildPositions(txns);

    const valued = positions.map((p) => ({
      ...p,
      marketValue: (p.lastPrice ?? 0) * p.shares,
    }));

    const cashByCcy = new Map<string, number>();
    for (const t of txns) {
      const amt = t.amount ?? null;
      const fees = t.fees ?? 0;
      const taxes = t.taxes ?? 0;

      if (amt != null) {
        const ccyAmt = t.ccyAmount || t.ccyPrice || "";
        cashByCcy.set(ccyAmt, (cashByCcy.get(ccyAmt) ?? 0) + amt);
      }
      if (fees) {
        const ccyFees = t.feesCurrency || t.ccyAmount || t.ccyPrice || "";
        cashByCcy.set(ccyFees, (cashByCcy.get(ccyFees) ?? 0) - fees);
      }
      if (taxes) {
        const ccyTax = t.ccyAmount || t.ccyPrice || "";
        cashByCcy.set(ccyTax, (cashByCcy.get(ccyTax) ?? 0) - taxes);
      }
    }

    const totalByCcy = new Map<string, number>();
    for (const v of valued) {
      const c = v.ccyPrice || "";
      totalByCcy.set(c, (totalByCcy.get(c) ?? 0) + v.marketValue);
    }
    for (const [c, csh] of cashByCcy.entries()) {
      totalByCcy.set(c, (totalByCcy.get(c) ?? 0) + csh);
    }

    const rows: AllocationRow[] = [];
    for (const v of valued) {
      const total = totalByCcy.get(v.ccyPrice || "") ?? 0;
      const weight = total > 0 ? (v.marketValue / total) * 100 : null;
      rows.push({ ccy: v.ccyPrice || "", label: v.key, value: v.marketValue, weightPct: weight });
    }
    for (const [ccy, csh] of cashByCcy.entries()) {
      const total = totalByCcy.get(ccy) ?? 0;
      const weight = total > 0 ? (csh / total) * 100 : null;
      rows.push({ ccy, label: "CASH", value: csh, weightPct: weight });
    }

    rows.sort((a, b) => a.ccy.localeCompare(b.ccy) || ((b.weightPct ?? -Infinity) - (a.weightPct ?? -Infinity)));

    console.log("[allocation] rows sample=", rows.slice(0, 5));
    return rows;
  } catch (err) {
    console.error("[allocation] valueAndWeightsByCurrency error:", err);
    return [];
  }
}

export function portfolioAndCashByCurrency(txns: Txn[]): { portfolio: PortfolioRow[]; cash: CashRow[] } {
  try {
    console.log("[allocation] portfolioAndCashByCurrency: txns count=", txns?.length ?? 0);

    const positions = buildPositions(txns);
    const valued = positions.map((p) => ({
      ...p,
      marketValue: (p.lastPrice ?? 0) * p.shares,
    }));

    const cashByCcy = new Map<string, number>();
    for (const t of txns) {
      const amt = t.amount ?? null;
      const fees = t.fees ?? 0;
      const taxes = t.taxes ?? 0;

      if (amt != null) {
        const ccyAmt = t.ccyAmount || t.ccyPrice || "";
        cashByCcy.set(ccyAmt, (cashByCcy.get(ccyAmt) ?? 0) + amt);
      }
      if (fees) {
        const ccyFees = t.feesCurrency || t.ccyAmount || t.ccyPrice || "";
        cashByCcy.set(ccyFees, (cashByCcy.get(ccyFees) ?? 0) - fees);
      }
      if (taxes) {
        const ccyTax = t.ccyAmount || t.ccyPrice || "";
        cashByCcy.set(ccyTax, (cashByCcy.get(ccyTax) ?? 0) - taxes);
      }
    }

    const totalByCcy = new Map<string, number>();
    for (const v of valued) {
      const c = v.ccyPrice || "";
      totalByCcy.set(c, (totalByCcy.get(c) ?? 0) + v.marketValue);
    }
    for (const [c, csh] of cashByCcy.entries()) {
      totalByCcy.set(c, (totalByCcy.get(c) ?? 0) + csh);
    }

    const portfolio: PortfolioRow[] = valued.map((v) => {
      const total = totalByCcy.get(v.ccyPrice || "") ?? 0;
      const weightPct = total > 0 ? (v.marketValue / total) * 100 : 0;
      return {
        symbol: v.key,
        shares: v.shares,
        lastPrice: v.lastPrice ?? 0,
        positionValue: v.marketValue,
        ccy: v.ccyPrice || "",
        weightPct,
      };
    }).sort((a, b) => a.ccy.localeCompare(b.ccy) || b.weightPct - a.weightPct || a.symbol.localeCompare(b.symbol));

    const cash: CashRow[] = [...cashByCcy.entries()].map(([ccy, csh]) => {
      const total = totalByCcy.get(ccy) ?? 0;
      const weightPct = total > 0 ? (csh / total) * 100 : 0;
      return { ccy, cashValue: csh, weightPct };
    }).sort((a, b) => a.ccy.localeCompare(b.ccy) || b.weightPct - a.weightPct);

    console.log("[allocation] portfolio sample=", portfolio.slice(0, 5));
    console.log("[allocation] cash sample=", cash.slice(0, 5));

    return { portfolio, cash };
  } catch (err) {
    console.error("[allocation] portfolioAndCashByCurrency error:", err);
    return { portfolio: [], cash: [] };
  }
}

export type FxMap = Record<string, number>;

export function convertToBase(value: number, ccy: string, fx: FxMap, base: string = "CZK"): number | null {
  try {
    const rateCcy = fx?.[ccy as keyof FxMap];
    const rateBase = fx?.[base as keyof FxMap] ?? 1;
    if (!Number.isFinite(rateCcy as number)) return null;
    const result = value * (Number(rateCcy) / Number(rateBase));
    return Number.isFinite(result) ? result : null;
  } catch (e) {
    console.error("[allocation] convertToBase error", e);
    return null;
  }
}

export function valueAndWeightsGlobal(txns: Txn[], fx: FxMap, base: string = "CZK"): AllocationRow[] {
  try {
    console.log("[allocation] valueAndWeightsGlobal: txns=", txns?.length ?? 0, "base=", base);
    const positions = buildPositions(txns);
    const valued = positions.map((p) => ({ ...p, marketValue: (p.lastPrice ?? 0) * p.shares }));

    const cashByCcy = new Map<string, number>();
    for (const t of txns) {
      const amt = t.amount ?? null;
      const fees = t.fees ?? 0;
      const taxes = t.taxes ?? 0;

      if (amt != null) {
        const ccyAmt = t.ccyAmount || t.ccyPrice || "";
        cashByCcy.set(ccyAmt, (cashByCcy.get(ccyAmt) ?? 0) + amt);
      }
      if (fees) {
        const ccyFees = t.feesCurrency || t.ccyAmount || t.ccyPrice || "";
        cashByCcy.set(ccyFees, (cashByCcy.get(ccyFees) ?? 0) - fees);
      }
      if (taxes) {
        const ccyTax = t.ccyAmount || t.ccyPrice || "";
        cashByCcy.set(ccyTax, (cashByCcy.get(ccyTax) ?? 0) - taxes);
      }
    }

    type Item = { label: string; sourceCcy: string; value: number };
    const items: Item[] = [];
    for (const v of valued) {
      items.push({ label: v.key, sourceCcy: v.ccyPrice || base, value: v.marketValue });
    }
    for (const [ccy, csh] of cashByCcy.entries()) {
      items.push({ label: "CASH", sourceCcy: ccy || base, value: csh });
    }

    const converted: { label: string; value: number }[] = [];
    for (const it of items) {
      const v = convertToBase(it.value, it.sourceCcy || base, fx, base);
      if (v == null) {
        console.warn("[allocation] Skipping item without FX rate", it);
        continue;
      }
      converted.push({ label: it.label, value: v });
    }

    const total = converted.reduce((sum, r) => sum + r.value, 0);
    if (!(total > 0)) {
      return converted.map((r) => ({ ccy: base, label: r.label, value: r.value, weightPct: null }));
    }

    const rows: AllocationRow[] = converted.map((r) => ({
      ccy: base,
      label: r.label,
      value: r.value,
      weightPct: (r.value / total) * 100,
    }));

    rows.sort((a, b) => ((b.weightPct ?? -Infinity) - (a.weightPct ?? -Infinity)) || a.label.localeCompare(b.label));
    console.log("[allocation] global rows sample=", rows.slice(0, 5));
    return rows;
  } catch (err) {
    console.error("[allocation] valueAndWeightsGlobal error:", err);
    return [];
  }
}
