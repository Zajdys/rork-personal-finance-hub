import { parseCsvText, type ParsedTable } from '@/src/utils/fileParser';
import { toNum } from '@/src/lib/num';

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
  const result = toNum(v);
  return result ?? 0;
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
  console.log('[T212] Processing', rows.length, 'rows');
  if (rows.length > 0) {
    console.log('[T212] Sample row headers:', Object.keys(rows[0]));
    console.log('[T212] Sample row data:', rows[0]);
  }
  
  const byTicker: Record<string, T212Row[]> = {};
  for (const r of rows) {
    const action = r['Action'];
    if (!(isBuy(action) || isSell(action))) {
      console.log('[T212] Skipping non-trade action:', action);
      continue;
    }
    const ticker = (r['Ticker'] ?? '').trim();
    if (!ticker) {
      console.log('[T212] Skipping row without ticker');
      continue;
    }
    (byTicker[ticker] ||= []).push(r);
  }

  console.log('[T212] Found tickers:', Object.keys(byTicker));
  const items: T212PortfolioItem[] = [];

  for (const [ticker, list] of Object.entries(byTicker)) {
    console.log(`[T212] Processing ticker ${ticker} with ${list.length} transactions`);
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
      const sharesRaw = toNumber(row['No. of shares']);
      const totalRaw = toNumber(row['Total']);
      const shares = Math.abs(sharesRaw);
      const total = Math.abs(totalRaw);
      
      console.log(`[T212] ${ticker}: ${row['Action']} ${shares} shares for ${total} (raw: shares=${row['No. of shares']}, total=${row['Total']})`);
      
      if (isBuy(row['Action'])) {
        fifo.push({ shares, cost: total });
        sharesHeld += shares;
        invested += total;
        console.log(`[T212] After buy: ${ticker} has ${sharesHeld} shares, invested ${invested}`);
      } else if (isSell(row['Action'])) {
        let toSell = shares;
        console.log(`[T212] Selling ${toSell} shares of ${ticker}`);
        while (toSell > 0 && fifo.length > 0) {
          const lot = fifo[0];
          if (lot.shares <= toSell) {
            toSell -= lot.shares;
            sharesHeld -= lot.shares;
            invested -= lot.cost;
            console.log(`[T212] Removed entire lot: ${lot.shares} shares, cost ${lot.cost}`);
            fifo.shift();
          } else {
            const remainShares = lot.shares - toSell;
            const remainCost = lot.cost * (remainShares / lot.shares);
            sharesHeld -= toSell;
            invested -= lot.cost * (toSell / lot.shares);
            console.log(`[T212] Partial lot sale: sold ${toSell}, remaining ${remainShares} shares`);
            fifo[0] = { shares: remainShares, cost: remainCost };
            toSell = 0;
          }
        }
        console.log(`[T212] After sell: ${ticker} has ${sharesHeld} shares, invested ${invested}`);
      }
    }

    if (sharesHeld > 0.0001) {
      const currency = (sorted[sorted.length - 1]['Currency (Total)'] ?? '').trim() || null;
      console.log(`[T212] ✓ Final ${ticker}: ${sharesHeld} shares, invested ${invested} ${currency}`);
      items.push({ ticker, shares: sharesHeld, invested, currency });
    } else {
      console.log(`[T212] ✗ Skipping ${ticker}: position closed (${sharesHeld} shares)`);
    }
  }

  console.log(`[T212] Total positions with shares: ${items.length}`);
  items.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return items;
}
