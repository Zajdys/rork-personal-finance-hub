/** Minimální tvar pro shlukování podle částky (bez závislosti na finance-store). */
export type AmountClusterItem = { amount: number };

const AMOUNT_CLUSTER_TOLERANCE = 0.15;

/** Shluky podobných částek (±15 % od průměru shluku) uvnitř jedné skupiny obchodníka. */
export function clusterTransactionsByAmount<T extends AmountClusterItem>(txs: T[]): T[][] {
  const sorted = [...txs].sort((a, b) => a.amount - b.amount);
  const clusters: T[][] = [];
  for (const t of sorted) {
    let placed = false;
    for (const cluster of clusters) {
      const avg = cluster.reduce((s, x) => s + x.amount, 0) / cluster.length;
      if (avg > 0 && Math.abs(t.amount - avg) / avg < AMOUNT_CLUSTER_TOLERANCE) {
        cluster.push(t);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([t]);
  }
  return clusters;
}
