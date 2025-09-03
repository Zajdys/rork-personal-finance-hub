/**
 * Unit testy pro finanční výpočty TWR a XIRR
 */

import {
  computeTWR,
  computeXIRR,
  calculatePortfolioMetrics,
  createEquitySeries,
  createCashFlows,
  CashFlow,
  EquityPoint
} from '../services/financial-calculations';

/**
 * Test pro TWR výpočet
 * Portfolio +10%, pak -5%, pak žádné vklady → TWR = (1.10 * 0.95 - 1) = 4.5%
 */
export function testTWRCalculation(): boolean {
  console.log('🧪 Testování TWR výpočtu...');
  
  // Vytvoříme equity series: 1000 → 1100 → 1045
  const equitySeries: EquityPoint[] = [
    { date: new Date('2024-01-01'), equity: 1000 },
    { date: new Date('2024-02-01'), equity: 1100 }, // +10%
    { date: new Date('2024-03-01'), equity: 1045 }  // -5%
  ];
  
  // Žádné cash flows během období
  const netFlows: { [key: string]: number } = {};
  
  const twr = computeTWR(equitySeries, netFlows);
  const expectedTWR = (1.10 * 0.95) - 1; // 0.045 = 4.5%
  
  console.log(`Vypočítané TWR: ${(twr * 100).toFixed(2)}%`);
  console.log(`Očekávané TWR: ${(expectedTWR * 100).toFixed(2)}%`);
  
  const isCorrect = Math.abs(twr - expectedTWR) < 0.001;
  console.log(`✅ TWR test ${isCorrect ? 'PROŠEL' : 'SELHAL'}`);
  
  return isCorrect;
}

/**
 * Test pro XIRR výpočet
 * Investice -10000 (2024-01-01), hodnota +11250 (2025-01-01) → ~12.5% p.a.
 */
export function testXIRRCalculation(): boolean {
  console.log('🧪 Testování XIRR výpočtu...');
  
  const cashflows: CashFlow[] = [
    { date: new Date('2024-01-01'), amount: -10000 }, // Investice
    { date: new Date('2025-01-01'), amount: 11250 }   // Výnos po roce
  ];
  
  const xirr = computeXIRR(cashflows);
  const expectedXIRR = 0.125; // 12.5% p.a.
  
  console.log(`Vypočítané XIRR: ${(xirr * 100).toFixed(2)}% p.a.`);
  console.log(`Očekávané XIRR: ${(expectedXIRR * 100).toFixed(2)}% p.a.`);
  
  const isCorrect = Math.abs(xirr - expectedXIRR) < 0.01; // Tolerance 1%
  console.log(`✅ XIRR test ${isCorrect ? 'PROŠEL' : 'SELHAL'}`);
  
  return isCorrect;
}

/**
 * Test pro komplexnější XIRR scénář s více cash flows
 */
export function testComplexXIRR(): boolean {
  console.log('🧪 Testování komplexního XIRR...');
  
  const cashflows: CashFlow[] = [
    { date: new Date('2024-01-01'), amount: -5000 },  // Počáteční investice
    { date: new Date('2024-06-01'), amount: -3000 },  // Další investice
    { date: new Date('2024-09-01'), amount: 1000 },   // Částečný výběr
    { date: new Date('2024-12-31'), amount: 8500 }    // Závěrečná hodnota
  ];
  
  const xirr = computeXIRR(cashflows);
  
  console.log(`Komplexní XIRR: ${(xirr * 100).toFixed(2)}% p.a.`);
  
  // Pro komplexní scénář jen ověříme, že výsledek je rozumný
  const isReasonable = xirr > -0.5 && xirr < 2.0; // Mezi -50% a +200%
  console.log(`✅ Komplexní XIRR test ${isReasonable ? 'PROŠEL' : 'SELHAL'}`);
  
  return isReasonable;
}

/**
 * Test pro edge cases
 */
export function testEdgeCases(): boolean {
  console.log('🧪 Testování edge cases...');
  
  let allPassed = true;
  
  // Test 1: Prázdné equity series
  const emptyTWR = computeTWR([], {});
  if (emptyTWR !== 0) {
    console.log('❌ Prázdné equity series test selhal');
    allPassed = false;
  }
  
  // Test 2: Prázdné cashflows
  const emptyXIRR = computeXIRR([]);
  if (emptyXIRR !== 0) {
    console.log('❌ Prázdné cashflows test selhal');
    allPassed = false;
  }
  
  // Test 3: Pouze kladné cashflows
  const positiveOnlyXIRR = computeXIRR([
    { date: new Date('2024-01-01'), amount: 1000 },
    { date: new Date('2024-02-01'), amount: 2000 }
  ]);
  if (positiveOnlyXIRR !== 0) {
    console.log('❌ Pouze kladné cashflows test selhal');
    allPassed = false;
  }
  
  // Test 4: Pouze záporné cashflows
  const negativeOnlyXIRR = computeXIRR([
    { date: new Date('2024-01-01'), amount: -1000 },
    { date: new Date('2024-02-01'), amount: -2000 }
  ]);
  if (negativeOnlyXIRR !== 0) {
    console.log('❌ Pouze záporné cashflows test selhal');
    allPassed = false;
  }
  
  console.log(`✅ Edge cases test ${allPassed ? 'PROŠEL' : 'SELHAL'}`);
  return allPassed;
}

/**
 * Test pro portfolio metriky s reálnými obchody
 */
export function testPortfolioMetrics(): boolean {
  console.log('🧪 Testování portfolio metrik...');
  
  const trades = [
    {
      date: new Date('2024-01-15'),
      type: 'buy' as const,
      amount: 10,
      price: 1000,
      total: 10000
    },
    {
      date: new Date('2024-03-15'),
      type: 'buy' as const,
      amount: 5,
      price: 1200,
      total: 6000
    },
    {
      date: new Date('2024-06-15'),
      type: 'sell' as const,
      amount: 3,
      price: 1300,
      total: 3900
    }
  ];
  
  const metrics = calculatePortfolioMetrics(trades);
  
  console.log('Portfolio metriky:');
  console.log(`- Celková hodnota: ${metrics.totalValue.toLocaleString('cs-CZ')} Kč`);
  console.log(`- Investováno: ${metrics.totalInvested.toLocaleString('cs-CZ')} Kč`);
  console.log(`- Výnosy: ${metrics.totalReturns.toLocaleString('cs-CZ')} Kč`);
  console.log(`- TWR: ${(metrics.twr * 100).toFixed(2)}%`);
  console.log(`- XIRR: ${(metrics.xirr * 100).toFixed(2)}% p.a.`);
  
  // Ověříme, že výsledky jsou rozumné
  const isReasonable = 
    metrics.totalValue > 0 &&
    metrics.totalInvested > 0 &&
    Math.abs(metrics.twr) < 1 && // TWR mezi -100% a +100%
    Math.abs(metrics.xirr) < 2;  // XIRR mezi -200% a +200%
  
  console.log(`✅ Portfolio metriky test ${isReasonable ? 'PROŠEL' : 'SELHAL'}`);
  return isReasonable;
}

/**
 * Spustí všechny testy
 */
export function runAllTests(): void {
  console.log('🚀 Spouštím všechny testy pro finanční výpočty...\n');
  
  const results = [
    testTWRCalculation(),
    testXIRRCalculation(),
    testComplexXIRR(),
    testEdgeCases(),
    testPortfolioMetrics()
  ];
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n📊 Výsledky testů: ${passed}/${total} prošlo`);
  
  if (passed === total) {
    console.log('🎉 Všechny testy prošly úspěšně!');
  } else {
    console.log('⚠️ Některé testy selhaly. Zkontrolujte implementaci.');
  }
}