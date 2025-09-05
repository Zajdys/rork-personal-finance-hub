import { parseCsvText, type ParsedTable } from '@/src/utils/fileParser';

export type T212Row = Record<string, string | undefined>;

export type T212PortfolioItem = {
  ticker: string;
  shares: number;
  invested: number;
  currency: string | null;
};

export type T212Portfolio = {
  items: T212PortfolioItem[];
  prices: Record<string, number>;
};

function toNumber(v: string | undefined): number {
  const n = Number((v ?? '').toString().replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function isBuy(action: string | undefined): boolean {
  const a = (action ?? '').toLowerCase();
  return a.includes('market buy') || a.includes('limit buy') || a === 'buy';
}

function isSell(action: string | undefined): boolean {
  const a = (action ?? '').toLowerCase();
  return a.includes('market sell') || a.includes('limit sell') || a === 'sell';
}

export function parseT212Csv(text: string): ParsedTable {
  return parseCsvText(text);
}

export function buildFifoFromT212Rows(rows: ParsedTable): T212PortfolioItem[] {
  const byTicker: Record<string, T212Row[]> = {};
  for (const r of rows) {
    const action = r['Action'];
    if (!(isBuy(action) || isSell(action))) continue;
    const ticker = (r['Ticker'] ?? '').trim();
    if (!ticker) continue;
    (byTicker[ticker] ||= []).push(r);
  }

  const items: T212PortfolioItem[] = [];

  for (const [ticker, list] of Object.entries(byTicker)) {
    const sorted = [...list].sort((a, b) => {
      const ta = new Date(a['Time'] ?? '').getTime();
      const tb = new Date(b['Time'] ?? '').getTime();
      return ta - tb;
    });

    let sharesHeld = 0;
    let invested = 0;

    type Lot = { shares: number; cost: number };
    const fifo: Lot[] = [];

    for (const row of sorted) {
      const shares = toNumber(row['No. of shares']);
      const total = toNumber(row['Total']);
      if (isBuy(row['Action'])) {
        fifo.push({ shares, cost: total });
        sharesHeld += shares;
        invested += total;
      } else if (isSell(row['Action'])) {
        let toSell = shares;
        while (toSell > 0 && fifo.length > 0) {
          const lot = fifo[0];
          if (lot.shares <= toSell) {
            toSell -= lot.shares;
            sharesHeld -= lot.shares;
            invested -= lot.cost;
            fifo.shift();
          } else {
            const remainShares = lot.shares - toSell;
            const remainCost = lot.cost * (remainShares / lot.shares);
            sharesHeld -= toSell;
            invested -= lot.cost * (toSell / lot.shares);
            fifo[0] = { shares: remainShares, cost: remainCost };
            toSell = 0;
          }
        }
      }
    }

    if (sharesHeld > 0) {
      const currency = (sorted[sorted.length - 1]['Currency (Total)'] ?? '').trim() || null;
      items.push({ ticker, shares: sharesHeld, invested, currency });
    }
  }

  items.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return items;
}
