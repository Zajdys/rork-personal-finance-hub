/**
 * Finanční výpočty pro portfolio analýzu
 * Implementuje TWR (Time-Weighted Return) a XIRR (Extended Internal Rate of Return)
 */

export interface CashFlow {
  date: Date;
  amount: number; // záporné pro vklady, kladné pro výběry
}

export interface EquityPoint {
  date: Date;
  equity: number; // hodnota portfolia v daném dni
}

/**
 * Vypočítá Time-Weighted Return (TWR)
 * 
 * @param equitySeries - denní hodnoty portfolia [(date, equity_base)]
 * @param netFlows - peněžní toky {date: cashflow} (kladné pro vklady, záporné pro výběry)
 * @returns kumulativní výnos (float, např. 0.123 = +12.3%)
 */
export function computeTWR(
  equitySeries: EquityPoint[],
  netFlows: { [key: string]: number }
): number {
  if (equitySeries.length < 2) {
    return 0.0;
  }

  // Seřadíme equity series podle data
  const sortedEquity = [...equitySeries].sort((a, b) => a.date.getTime() - b.date.getTime());
  
  let cumulativeReturn = 1.0;
  
  for (let i = 1; i < sortedEquity.length; i++) {
    const currentEquity = sortedEquity[i].equity;
    const previousEquity = sortedEquity[i - 1].equity;
    const currentDate = sortedEquity[i].date.toISOString().split('T')[0];
    
    // Získáme cash flow pro tento den
    const flow = netFlows[currentDate] || 0;
    
    // Výpočet denního výnosu: r_d = (E_d - E_{d-1} - Flow_d) / E_{d-1}
    if (previousEquity > 0) {
      const dailyReturn = (currentEquity - previousEquity - flow) / previousEquity;
      cumulativeReturn *= (1 + dailyReturn);
    }
  }
  
  // TWR = Π (1 + r_d) - 1
  return cumulativeReturn - 1;
}

/**
 * Vypočítá Extended Internal Rate of Return (XIRR)
 * Používá Newton-Raphson metodu s fallback na bisekci
 * 
 * @param cashflows - seznam [(date, amount)] kde vklady jsou záporné, výběry kladné
 * @returns roční výnos (float, např. 0.102 = 10.2% p.a.)
 */
export function computeXIRR(cashflows: CashFlow[]): number {
  if (cashflows.length < 2) {
    return 0.0;
  }

  // Seřadíme cashflows podle data
  const sortedCashflows = [...cashflows].sort((a, b) => a.date.getTime() - b.date.getTime());
  
  // Kontrola, že máme aspoň jeden záporný a jeden kladný cashflow
  const hasNegative = sortedCashflows.some(cf => cf.amount < 0);
  const hasPositive = sortedCashflows.some(cf => cf.amount > 0);
  
  if (!hasNegative || !hasPositive) {
    return 0.0;
  }

  // Zkusíme Newton-Raphson metodu
  let rate = newtonRaphsonXIRR(sortedCashflows);
  
  // Pokud Newton-Raphson selhala, použijeme bisekci
  if (isNaN(rate) || !isFinite(rate)) {
    rate = bisectionXIRR(sortedCashflows);
  }
  
  return isNaN(rate) || !isFinite(rate) ? 0.0 : rate;
}

/**
 * Newton-Raphson metoda pro XIRR
 */
function newtonRaphsonXIRR(cashflows: CashFlow[]): number {
  const baseDate = cashflows[0].date;
  let rate = 0.1; // Počáteční odhad 10%
  const maxIterations = 100;
  const tolerance = 1e-6;
  
  for (let i = 0; i < maxIterations; i++) {
    const { npv, derivative } = calculateNPVAndDerivative(cashflows, baseDate, rate);
    
    if (Math.abs(derivative) < tolerance) {
      break;
    }
    
    const newRate = rate - npv / derivative;
    
    if (Math.abs(newRate - rate) < tolerance) {
      return newRate;
    }
    
    rate = newRate;
    
    // Ochrana proti extrémním hodnotám
    if (rate < -0.99 || rate > 10) {
      break;
    }
  }
  
  return rate;
}

/**
 * Bisekce metoda pro XIRR jako fallback
 */
function bisectionXIRR(cashflows: CashFlow[]): number {
  const baseDate = cashflows[0].date;
  let lowRate = -0.99;
  let highRate = 10.0;
  const tolerance = 1e-6;
  const maxIterations = 100;
  
  for (let i = 0; i < maxIterations; i++) {
    const midRate = (lowRate + highRate) / 2;
    const { npv } = calculateNPVAndDerivative(cashflows, baseDate, midRate);
    
    if (Math.abs(npv) < tolerance) {
      return midRate;
    }
    
    const { npv: lowNPV } = calculateNPVAndDerivative(cashflows, baseDate, lowRate);
    
    if ((npv > 0 && lowNPV > 0) || (npv < 0 && lowNPV < 0)) {
      lowRate = midRate;
    } else {
      highRate = midRate;
    }
    
    if (Math.abs(highRate - lowRate) < tolerance) {
      return midRate;
    }
  }
  
  return (lowRate + highRate) / 2;
}

/**
 * Vypočítá NPV a jeho derivaci pro danou úrokovou sazbu
 */
function calculateNPVAndDerivative(
  cashflows: CashFlow[],
  baseDate: Date,
  rate: number
): { npv: number; derivative: number } {
  let npv = 0;
  let derivative = 0;
  
  for (const cf of cashflows) {
    const daysDiff = (cf.date.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24);
    const yearsDiff = daysDiff / 365.25;
    
    if (yearsDiff === 0) {
      npv += cf.amount;
    } else {
      const discountFactor = Math.pow(1 + rate, yearsDiff);
      npv += cf.amount / discountFactor;
      derivative -= (cf.amount * yearsDiff) / Math.pow(1 + rate, yearsDiff + 1);
    }
  }
  
  return { npv, derivative };
}

/**
 * Pomocná funkce pro vytvoření equity series z obchodů
 */
export function createEquitySeries(
  trades: Array<{
    date: Date;
    type: 'buy' | 'sell';
    amount: number;
    price: number;
    total: number;
  }>
): EquityPoint[] {
  if (trades.length === 0) {
    return [];
  }

  // Seřadíme obchody podle data
  const sortedTrades = [...trades].sort((a, b) => a.date.getTime() - b.date.getTime());
  
  const equityPoints: EquityPoint[] = [];
  let currentEquity = 0;
  
  // Vytvoříme equity point pro každý den s obchodem
  for (const trade of sortedTrades) {
    if (trade.type === 'buy') {
      currentEquity += trade.total;
    } else {
      currentEquity -= trade.total;
    }
    
    equityPoints.push({
      date: trade.date,
      equity: Math.max(0, currentEquity) // Equity nemůže být záporné
    });
  }
  
  // Přidáme současný bod s aktuální hodnotou
  if (equityPoints.length > 0) {
    equityPoints.push({
      date: new Date(),
      equity: currentEquity
    });
  }
  
  return equityPoints;
}

/**
 * Pomocná funkce pro vytvoření cash flows z obchodů
 */
export function createCashFlows(
  trades: Array<{
    date: Date;
    type: 'buy' | 'sell';
    total: number;
  }>,
  finalEquity: number
): CashFlow[] {
  const cashflows: CashFlow[] = [];
  
  // Přidáme všechny obchody jako cash flows
  for (const trade of trades) {
    cashflows.push({
      date: trade.date,
      amount: trade.type === 'buy' ? -trade.total : trade.total // Nákupy jsou záporné, prodeje kladné
    });
  }
  
  // Přidáme závěrečnou hodnotu portfolia jako kladný cash flow
  if (finalEquity > 0) {
    cashflows.push({
      date: new Date(),
      amount: finalEquity
    });
  }
  
  return cashflows;
}

/**
 * Vypočítá portfolio metriky včetně TWR a XIRR
 */
export function calculatePortfolioMetrics(
  trades: Array<{
    date: Date;
    type: 'buy' | 'sell';
    amount: number;
    price: number;
    total: number;
  }>
): {
  totalValue: number;
  totalInvested: number;
  totalReturns: number;
  twr: number;
  xirr: number;
} {
  if (trades.length === 0) {
    return {
      totalValue: 0,
      totalInvested: 0,
      totalReturns: 0,
      twr: 0,
      xirr: 0
    };
  }

  // Vypočítáme celkovou investovanou částku a současnou hodnotu
  let totalInvested = 0;
  let totalValue = 0;
  
  for (const trade of trades) {
    if (trade.type === 'buy') {
      totalInvested += trade.total;
      totalValue += trade.total; // Zjednodušeno - v reálné aplikaci by se použily aktuální ceny
    } else {
      totalInvested -= trade.total;
      totalValue -= trade.total;
    }
  }
  
  // Simulujeme růst portfolia (v reálné aplikaci by se použily aktuální tržní ceny)
  const growthFactor = 1 + (Math.random() * 0.2 - 0.1); // -10% až +10%
  totalValue *= growthFactor;
  
  const totalReturns = totalValue - totalInvested;
  
  // Vytvoříme equity series a cash flows
  const equitySeries = createEquitySeries(trades);
  const cashFlows = createCashFlows(trades, totalValue);
  
  // Vytvoříme net flows pro TWR (zjednodušeno)
  const netFlows: { [key: string]: number } = {};
  for (const trade of trades) {
    const dateKey = trade.date.toISOString().split('T')[0];
    netFlows[dateKey] = (netFlows[dateKey] || 0) + (trade.type === 'buy' ? trade.total : -trade.total);
  }
  
  // Vypočítáme TWR a XIRR
  const twr = computeTWR(equitySeries, netFlows);
  const xirr = computeXIRR(cashFlows);
  
  return {
    totalValue: Math.max(0, totalValue),
    totalInvested: Math.max(0, totalInvested),
    totalReturns,
    twr,
    xirr
  };
}