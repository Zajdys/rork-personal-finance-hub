/** Minimální tvar pro shlukování podle částky (bez závislosti na finance-store). */
export type AmountClusterItem = { amount: number };

export const AMOUNT_CLUSTER_TOLERANCE = 0.15;

/** Shluky podobných částek (±tol od průměru shluku) uvnitř jedné skupiny obchodníka. */
export function clusterTransactionsByAmount<T extends AmountClusterItem>(
  txs: T[],
  tol = AMOUNT_CLUSTER_TOLERANCE,
): T[][] {
  const sorted = [...txs].sort((a, b) => a.amount - b.amount);
  const clusters: T[][] = [];
  for (const t of sorted) {
    let placed = false;
    for (const cluster of clusters) {
      const avg = cluster.reduce((s, x) => s + x.amount, 0) / cluster.length;
      if (avg > 0 && Math.abs(t.amount - avg) / avg <= tol) {
        cluster.push(t);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([t]);
  }
  return clusters;
}
