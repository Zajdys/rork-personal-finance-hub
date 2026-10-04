import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import {
  logEtoroTransactionParseSummary,
  parseEtoroTransactionsXlsx,
  parseEtoroTransactionsXlsxFiles,
  type EtoroTransactionParseResult,
} from '@/lib/etoro-transactions-parser';
import {
  logTrading212TransactionParseSummary,
  parseTrading212TransactionsCsvFiles,
  readCSVFromUri,
  type Portfolio,
} from '@/lib/trading212-parser';
import { isAnycoinCsv, logAnycoinParseSummary, parseAnycoinCsv } from '@/lib/anycoin-parser';
import { detectBrokerFromXlsxBytes } from '@/lib/broker-import-detect';
import {
  logXtbTransactionParseSummary,
  parseXtbTransactionsXlsx,
  xtbCashByCurrency,
  xtbHoldingsByTicker,
} from '@/lib/xtb-transactions-parser';
import {
  parseRevolutInvestCsv,
  revolutInvestCashByCurrency,
  revolutInvestHoldingsByTicker,
} from '@/lib/revolut-invest-csv-parse';
import type { InvestmentBroker, InvestmentPortfolioVisibility, PositionInsert } from '@/lib/investment-portfolios';
import { supabaseUrl } from '@/lib/supabase';
import { useHouseholdActiveStore } from '@/store/household-active-store';
import { AsyncButton } from '@/components/AsyncButton';
import { formatCountNoun, pluralSoubor, pluralTransakce } from '@/lib/plural-cs';

export type PendingPortfolioImport =
  | {
      kind: 'positions';
      broker: InvestmentBroker;
      portfolioName: string;
      currency: string;
      positions: PositionInsert[];
      visibility: InvestmentPortfolioVisibility;
      householdId?: string | null;
      cashBalance?: number | null;
    }
  | {
      kind: 'etoro-transactions';
      fileContents: string[];
      portfolioName: string;
      visibility: InvestmentPortfolioVisibility;
      householdId?: string | null;
      transactionCount: number;
      fileCount: number;
    }
  | {
      kind: 'trading212-transactions';
      csvTexts: string[];
      portfolioName: string;
      visibility: InvestmentPortfolioVisibility;
      householdId?: string | null;
      transactionCount: number;
      fileCount: number;
      hasOrphanSells: boolean;
    }
  | {
      kind: 'anycoin-transactions';
      csvTexts: string[];
      portfolioName: string;
      visibility: InvestmentPortfolioVisibility;
      householdId?: string | null;
      transactionCount: number;
      fileCount: number;
    }
  | {
      kind: 'revolut-invest-transactions';
      csvText: string;
      portfolioName: string;
      visibility: InvestmentPortfolioVisibility;
      householdId?: string | null;
      transactionCount: number;
    }
  | {
      kind: 'xtb-transactions';
      fileContent: string;
      portfolioName: string;
      visibility: InvestmentPortfolioVisibility;
      householdId?: string | null;
      transactionCount: number;
    };

type Props = {
  visible: boolean;
  onClose: () => void;
  onImportReady: (data: PendingPortfolioImport) => Promise<void>;
  fetchT212Quotes: (portfolio: Portfolio) => Promise<Record<string, number | null>>;
};

type Step = 'choose' | 'preview' | 'naming' | 'loading';

export function InvestmentPortfolioImportSheet({
  visible,
  onClose,
  onImportReady,
  fetchT212Quotes,
}: Props) {
  const { colors } = useTheme();
  const { t } = useLanguageStore();
  const { households, activeHouseholdId } = useHouseholdActiveStore();
  const [step, setStep] = useState<Step>('choose');
  const [portfolioName, setPortfolioName] = useState('');
  const [pendingBroker, setPendingBroker] = useState<InvestmentBroker>('etoro');
  const [pendingCurrency, setPendingCurrency] = useState('USD');
  const [pendingPositions, setPendingPositions] = useState<PositionInsert[]>([]);
  const [pendingCashBalance, setPendingCashBalance] = useState<number | null>(null);
  const [pendingEtoroFileContents, setPendingEtoroFileContents] = useState<string[] | null>(null);
  const [pendingEtoroTxCount, setPendingEtoroTxCount] = useState(0);
  const [pendingEtoroFileCount, setPendingEtoroFileCount] = useState(0);
  const [pendingT212CsvTexts, setPendingT212CsvTexts] = useState<string[] | null>(null);
  const [pendingT212TxCount, setPendingT212TxCount] = useState(0);
  const [pendingT212FileCount, setPendingT212FileCount] = useState(0);
  const [pendingT212OrphanSells, setPendingT212OrphanSells] = useState(false);
  const [pendingAnycoinCsvTexts, setPendingAnycoinCsvTexts] = useState<string[] | null>(null);
  const [pendingAnycoinTxCount, setPendingAnycoinTxCount] = useState(0);
  const [pendingAnycoinFileCount, setPendingAnycoinFileCount] = useState(0);
  const [pendingRevolutCsvText, setPendingRevolutCsvText] = useState<string | null>(null);
  const [pendingRevolutPreview, setPendingRevolutPreview] = useState<{
    typeCounts: Record<string, number>;
    holdings: Record<string, number>;
    cash: Record<string, number>;
    txCount: number;
    unknownTypes: string[];
    error: string | null;
  } | null>(null);
  const [pendingXtbFileContent, setPendingXtbFileContent] = useState<string | null>(null);
  const [pendingXtbPreview, setPendingXtbPreview] = useState<{
    typeCounts: Record<string, number>;
    holdings: Record<string, number>;
    cash: Record<string, number>;
    txCount: number;
    realizedPl: number;
    cashBalance: number | null;
    error: string | null;
  } | null>(null);
  const [infoHint, setInfoHint] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<InvestmentPortfolioVisibility>('personal');
  const [sharedHouseholdId, setSharedHouseholdId] = useState<string | null>(activeHouseholdId);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep('choose');
    setPortfolioName('');
    setPendingPositions([]);
    setPendingCashBalance(null);
    setPendingEtoroFileContents(null);
    setPendingEtoroTxCount(0);
    setPendingEtoroFileCount(0);
    setPendingT212CsvTexts(null);
    setPendingT212TxCount(0);
    setPendingT212FileCount(0);
    setPendingT212OrphanSells(false);
    setPendingAnycoinCsvTexts(null);
    setPendingAnycoinTxCount(0);
    setPendingAnycoinFileCount(0);
    setPendingRevolutCsvText(null);
    setPendingRevolutPreview(null);
    setPendingXtbFileContent(null);
    setPendingXtbPreview(null);
    setInfoHint(null);
    setVisibility('personal');
    setSharedHouseholdId(activeHouseholdId);
    setError(null);
  }, [activeHouseholdId]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const finishImport = useCallback(
    async (name: string) => {
      if (!name.trim()) {
        setError('Zadej název portfolia.');
        return;
      }
      setStep('loading');
      setError(null);
      try {
        if (visibility === 'shared' && !sharedHouseholdId) {
          setError('Vyber domácnost pro společné portfolio.');
          setStep('naming');
          return;
        }

        if (pendingEtoroFileContents?.length) {
          await onImportReady({
            kind: 'etoro-transactions',
            fileContents: pendingEtoroFileContents,
            portfolioName: name.trim(),
            visibility,
            householdId: visibility === 'shared' ? sharedHouseholdId : null,
            transactionCount: pendingEtoroTxCount,
            fileCount: pendingEtoroFileCount,
          });
        } else if (pendingT212CsvTexts?.length) {
          await onImportReady({
            kind: 'trading212-transactions',
            csvTexts: pendingT212CsvTexts,
            portfolioName: name.trim(),
            visibility,
            householdId: visibility === 'shared' ? sharedHouseholdId : null,
            transactionCount: pendingT212TxCount,
            fileCount: pendingT212FileCount,
            hasOrphanSells: pendingT212OrphanSells,
          });
        } else if (pendingAnycoinCsvTexts?.length) {
          await onImportReady({
            kind: 'anycoin-transactions',
            csvTexts: pendingAnycoinCsvTexts,
            portfolioName: name.trim(),
            visibility,
            householdId: visibility === 'shared' ? sharedHouseholdId : null,
            transactionCount: pendingAnycoinTxCount,
            fileCount: pendingAnycoinFileCount,
          });
        } else if (pendingRevolutCsvText) {
          await onImportReady({
            kind: 'revolut-invest-transactions',
            csvText: pendingRevolutCsvText,
            portfolioName: name.trim(),
            visibility,
            householdId: visibility === 'shared' ? sharedHouseholdId : null,
            transactionCount: pendingRevolutPreview?.txCount ?? 0,
          });
        } else if (pendingXtbFileContent) {
          await onImportReady({
            kind: 'xtb-transactions',
            fileContent: pendingXtbFileContent,
            portfolioName: name.trim(),
            visibility,
            householdId: visibility === 'shared' ? sharedHouseholdId : null,
            transactionCount: pendingXtbPreview?.txCount ?? 0,
          });
        } else {
          await onImportReady({
            kind: 'positions',
            broker: pendingBroker,
            portfolioName: name.trim(),
            currency: pendingCurrency,
            positions: pendingPositions,
            cashBalance: pendingCashBalance,
            visibility,
            householdId: visibility === 'shared' ? sharedHouseholdId : null,
          });
        }
        handleClose();
      } catch (e) {
        console.error(
          '[Investice import save] selhalo',
          `${supabaseUrl}/rest/v1/investment_portfolios`,
          e,
        );
        setError(e instanceof Error ? e.message : t('investImportError'));
        setStep('naming');
      }
    },
    [
      handleClose,
      onImportReady,
      pendingBroker,
      pendingCurrency,
      pendingPositions,
      pendingCashBalance,
      pendingEtoroFileContents,
      pendingEtoroTxCount,
      pendingEtoroFileCount,
      pendingT212CsvTexts,
      pendingT212TxCount,
      pendingT212FileCount,
      pendingT212OrphanSells,
      pendingAnycoinCsvTexts,
      pendingAnycoinTxCount,
      pendingAnycoinFileCount,
      pendingRevolutCsvText,
      pendingRevolutPreview,
      pendingXtbFileContent,
      pendingXtbPreview,
      visibility,
      sharedHouseholdId,
      t,
    ],
  );

  const pickEtoro = useCallback(async () => {
    setStep('loading');
    setError(null);
    setInfoHint(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) {
        setStep('choose');
        return;
      }
      const assets = result.assets?.filter((a) => a?.uri) ?? [];
      if (!assets.length) throw new Error(t('investImportFailed'));

      const fileContents = await Promise.all(
        assets.map((a) => readAsStringAsync(a.uri, { encoding: EncodingType.Base64 })),
      );

      let parseResult: EtoroTransactionParseResult;
      try {
        parseResult =
          fileContents.length === 1
            ? parseEtoroTransactionsXlsx(fileContents[0]!)
            : parseEtoroTransactionsXlsxFiles(fileContents);
        logEtoroTransactionParseSummary(parseResult);
        console.log(
          `[Import] eToro transactions parsed: ${parseResult.transactions.length} from ${fileContents.length} file(s)`,
        );
      } catch (err) {
        console.error('[Import] eToro tx parse error:', err);
        setError(`Chyba parsování transakcí: ${err instanceof Error ? err.message : String(err)}`);
        setStep('choose');
        return;
      }

      if (parseResult.transactions.length === 0) {
        setError('Soubor byl načten, ale nebyly nalezeny žádné transakce v listu Aktivita na účtu.');
        setStep('choose');
        return;
      }

      setPendingBroker('etoro');
      setPendingCurrency('USD');
      setPendingCashBalance(null);
      setPendingPositions([]);
      setPendingT212CsvTexts(null);
      setPendingAnycoinCsvTexts(null);
      setPendingRevolutCsvText(null);
      setPendingRevolutPreview(null);
      setPendingXtbFileContent(null);
      setPendingXtbPreview(null);
      setPendingEtoroFileContents(fileContents);
      setPendingEtoroTxCount(parseResult.transactions.length);
      setPendingEtoroFileCount(fileContents.length);
      setPortfolioName('eToro');
      setStep('naming');
    } catch (e) {
      console.error('[Import] eToro import error:', e);
      setError(e instanceof Error ? e.message : t('investImportError'));
      setStep('choose');
    }
  }, [t]);

  const pickXtb = useCallback(async () => {
    setStep('loading');
    setError(null);
    setInfoHint(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled) {
        setStep('choose');
        return;
      }
      const asset = result.assets?.[0];
      if (!asset?.uri) throw new Error(t('investImportFailed'));

      const fileContent = await readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 });
      const detected = detectBrokerFromXlsxBytes(fileContent);
      if (detected === 'etoro') {
        setError('Soubor vypadá jako eToro export — použijte tlačítko eToro XLSX.');
        setStep('choose');
        return;
      }

      let parseResult;
      try {
        parseResult = parseXtbTransactionsXlsx(fileContent);
        logXtbTransactionParseSummary(parseResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStep('choose');
        return;
      }

      if (parseResult.transactions.length === 0) {
        setError('V XTB souboru nebyly nalezeny žádné Cash Operations transakce.');
        setStep('choose');
        return;
      }

      const typeCounts: Record<string, number> = {};
      for (const [type, stats] of Object.entries(parseResult.summary)) {
        if (stats.count > 0) typeCounts[type] = stats.count;
      }
      const holdings = xtbHoldingsByTicker(parseResult.transactions);
      const cash = xtbCashByCurrency(parseResult.transactions);

      setPendingBroker('xtb');
      setPendingCurrency(parseResult.accountCurrency || 'EUR');
      setPendingCashBalance(parseResult.cashBalance);
      setPendingPositions([]);
      setPendingEtoroFileContents(null);
      setPendingT212CsvTexts(null);
      setPendingAnycoinCsvTexts(null);
      setPendingRevolutCsvText(null);
      setPendingRevolutPreview(null);
      setPendingXtbFileContent(fileContent);
      setPendingXtbPreview({
        typeCounts,
        holdings,
        cash,
        txCount: parseResult.transactions.length,
        realizedPl: parseResult.realizedPl,
        cashBalance: parseResult.cashBalance,
        error: null,
      });
      setPortfolioName('XTB');
      setStep('preview');
    } catch (e) {
      console.error('[Import] XTB parse selhalo', e);
      setError(e instanceof Error ? e.message : t('investImportError'));
      setStep('choose');
    }
  }, [t]);

  const pickT212 = useCallback(async () => {
    setStep('loading');
    setError(null);
    setInfoHint(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) {
        setStep('choose');
        return;
      }
      const assets = result.assets?.filter((a) => a?.uri) ?? [];
      if (!assets.length) throw new Error(t('investImportFailed'));

      const csvTexts = await Promise.all(assets.map((a) => readCSVFromUri(a.uri)));
      const parseResult = parseTrading212TransactionsCsvFiles(csvTexts);
      logTrading212TransactionParseSummary(parseResult);

      if (parseResult.transactions.length === 0) {
        setError(
          'V CSV nebyly nalezeny žádné transakce. Ověř, že export obsahuje sloupec Action (Market buy / sell, Dividend, Deposit…).',
        );
        setStep('choose');
        return;
      }

      setPendingBroker('trading212');
      setPendingCurrency('EUR');
      setPendingCashBalance(null);
      setPendingPositions([]);
      setPendingEtoroFileContents(null);
      setPendingEtoroTxCount(0);
      setPendingEtoroFileCount(0);
      setPendingAnycoinCsvTexts(null);
      setPendingRevolutCsvText(null);
      setPendingRevolutPreview(null);
      setPendingXtbFileContent(null);
      setPendingXtbPreview(null);
      setPendingT212CsvTexts(csvTexts);
      setPendingT212TxCount(parseResult.transactions.length);
      setPendingT212FileCount(csvTexts.length);
      setPendingT212OrphanSells(parseResult.hasOrphanSells);
      setPortfolioName('Trading 212');
      setInfoHint(parseResult.hasOrphanSells ? t('investT212OrphanSellsHint') : null);
      setStep('naming');
    } catch (e) {
      console.error('[Import] T212 pick / parse selhalo', e);
      setError(e instanceof Error ? e.message : t('investImportError'));
      setStep('choose');
    }
  }, [t]);

  const pickAnycoin = useCallback(async () => {
    setStep('loading');
    setError(null);
    setInfoHint(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) {
        setStep('choose');
        return;
      }
      const assets = result.assets?.filter((a) => a?.uri) ?? [];
      if (!assets.length) throw new Error(t('investImportFailed'));

      const csvTexts = await Promise.all(assets.map((a) => readCSVFromUri(a.uri)));
      if (!csvTexts.some(isAnycoinCsv)) {
        setError(
          'Soubor nevypadá jako Anycoin CSV (očekávám sloupce Date, Type, Amount, Currency, anycoin TX ID…).',
        );
        setStep('choose');
        return;
      }

      const mergedTx = [];
      let skipped = 0;
      const warnings: string[] = [];
      for (const text of csvTexts) {
        const part = parseAnycoinCsv(text);
        mergedTx.push(...part.transactions);
        skipped += part.skipped;
        warnings.push(...part.warnings);
      }
      const byId = new Map(mergedTx.map((tx) => [tx.external_id, tx] as const));
      const transactions = [...byId.values()];
      const summaryMap = {
        buy: { count: 0, amountSum: 0, unitsSum: 0 },
        sell: { count: 0, amountSum: 0, unitsSum: 0 },
        dividend: { count: 0, amountSum: 0, unitsSum: 0 },
        deposit: { count: 0, amountSum: 0, unitsSum: 0 },
        withdrawal: { count: 0, amountSum: 0, unitsSum: 0 },
        fee: { count: 0, amountSum: 0, unitsSum: 0 },
        promo: { count: 0, amountSum: 0, unitsSum: 0 },
        transfer_out: { count: 0, amountSum: 0, unitsSum: 0 },
        gift: { count: 0, amountSum: 0, unitsSum: 0 },
      } as const;
      const summaryMutable = {
        buy: { count: 0, amountSum: 0, unitsSum: 0 },
        sell: { count: 0, amountSum: 0, unitsSum: 0 },
        dividend: { count: 0, amountSum: 0, unitsSum: 0 },
        deposit: { count: 0, amountSum: 0, unitsSum: 0 },
        withdrawal: { count: 0, amountSum: 0, unitsSum: 0 },
        fee: { count: 0, amountSum: 0, unitsSum: 0 },
        promo: { count: 0, amountSum: 0, unitsSum: 0 },
        transfer_out: { count: 0, amountSum: 0, unitsSum: 0 },
        gift: { count: 0, amountSum: 0, unitsSum: 0 },
      };
      void summaryMap;
      for (const tx of transactions) {
        summaryMutable[tx.type].count += 1;
        summaryMutable[tx.type].amountSum += tx.amount;
        summaryMutable[tx.type].unitsSum += Math.abs(tx.units ?? 0);
      }
      logAnycoinParseSummary({
        transactions,
        skipped,
        warnings,
        summary: summaryMutable,
      });

      if (transactions.length === 0) {
        setError('V CSV nebyly nalezeny žádné Anycoin transakce.');
        setStep('choose');
        return;
      }

      setPendingBroker('anycoin');
      setPendingCurrency('CZK');
      setPendingCashBalance(null);
      setPendingPositions([]);
      setPendingEtoroFileContents(null);
      setPendingT212CsvTexts(null);
      setPendingRevolutCsvText(null);
      setPendingRevolutPreview(null);
      setPendingXtbFileContent(null);
      setPendingXtbPreview(null);
      setPendingAnycoinCsvTexts(csvTexts);
      setPendingAnycoinTxCount(transactions.length);
      setPendingAnycoinFileCount(csvTexts.length);
      setPortfolioName('Anycoin');
      setInfoHint(
        `Držené BTC (Σ buy): ${summaryMutable.buy.unitsSum.toFixed(8)} · Vloženo: ${(summaryMutable.deposit.amountSum - Math.abs(summaryMutable.withdrawal.amountSum)).toFixed(0)} CZK`,
      );
      setStep('naming');
    } catch (e) {
      console.error('[Import] Anycoin pick / parse selhalo', e);
      setError(e instanceof Error ? e.message : t('investImportError'));
      setStep('choose');
    }
  }, [t]);

  const pickRevolut = useCallback(async () => {
    setStep('loading');
    setError(null);
    setInfoHint(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) {
        setStep('choose');
        return;
      }
      const asset = result.assets?.[0];
      if (!asset?.uri) throw new Error(t('investImportFailed'));

      const csvText = await readCSVFromUri(asset.uri);
      const parseResult = parseRevolutInvestCsv(csvText);

      // Strukturální chyba (prázdný CSV / chybí sloupce) — zpět na výběr.
      if (!parseResult.ok && parseResult.unknownTypes.length === 0) {
        setError(parseResult.error);
        setStep('choose');
        return;
      }

      const typeCounts: Record<string, number> = {};
      for (const [type, stats] of Object.entries(parseResult.summary)) {
        if (stats.count > 0) typeCounts[type] = stats.count;
      }
      const holdings = revolutInvestHoldingsByTicker(parseResult.transactions);
      const cash = revolutInvestCashByCurrency(parseResult.transactions);
      const unknownTypes = !parseResult.ok ? parseResult.unknownTypes : [];
      const previewError = !parseResult.ok ? parseResult.error : null;

      if (parseResult.ok && parseResult.transactions.length === 0) {
        setError('V CSV nebyly nalezeny žádné Revolut Invest transakce.');
        setStep('choose');
        return;
      }

      setPendingBroker('revolut');
      setPendingCurrency('EUR');
      setPendingCashBalance(null);
      setPendingPositions([]);
      setPendingEtoroFileContents(null);
      setPendingT212CsvTexts(null);
      setPendingAnycoinCsvTexts(null);
      setPendingXtbFileContent(null);
      setPendingXtbPreview(null);
      setPendingRevolutCsvText(unknownTypes.length ? null : csvText);
      setPendingRevolutPreview({
        typeCounts,
        holdings,
        cash,
        txCount: parseResult.transactions.length,
        unknownTypes,
        error: previewError,
      });
      setPortfolioName('Revolut Invest');
      setStep('preview');
    } catch (e) {
      console.error('[Import] Revolut Invest pick / parse selhalo', e);
      setError(e instanceof Error ? e.message : t('investImportError'));
      setStep('choose');
    }
  }, [t]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: colors.text }]}>{t('importPortfolio')}</Text>

          {step === 'choose' && (
            <View style={styles.options}>
              <TouchableOpacity
                style={[styles.optionBtn, { borderColor: colors.border }]}
                onPress={pickEtoro}
              >
                <Text style={[styles.optionText, { color: colors.text }]}>eToro XLSX</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionBtn, { borderColor: colors.border }]}
                onPress={pickXtb}
              >
                <Text style={[styles.optionText, { color: colors.text }]}>XTB XLSX</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionBtn, { borderColor: colors.border }]}
                onPress={pickT212}
              >
                <Text style={[styles.optionText, { color: colors.text }]}>Trading 212 CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionBtn, { borderColor: colors.border }]}
                onPress={pickRevolut}
              >
                <Text style={[styles.optionText, { color: colors.text }]}>Revolut Invest CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionBtn, { borderColor: colors.border }]}
                onPress={pickAnycoin}
              >
                <Text style={[styles.optionText, { color: colors.text }]}>Anycoin CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionBtn, { borderColor: colors.border, opacity: 0.5 }]}
                disabled
              >
                <Text style={[styles.optionText, { color: colors.textSecondary }]}>
                  Ruční zadání (brzy)
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'preview' && pendingRevolutPreview ? (
            <View style={styles.naming}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Náhled Revolut Invest ({formatCountNoun(pendingRevolutPreview.txCount, pluralTransakce)})
              </Text>
              {pendingRevolutPreview.unknownTypes.length > 0 || pendingRevolutPreview.error ? (
                <Text style={styles.error}>
                  {pendingRevolutPreview.error ??
                    `Neznámé typy: ${pendingRevolutPreview.unknownTypes.join(', ')}`}
                </Text>
              ) : null}
              <View style={[styles.previewBlock, { borderColor: colors.border }]}>
                {Object.entries(pendingRevolutPreview.typeCounts)
                  .filter(([, count]) => count > 0)
                  .map(([type, count]) => (
                    <Text key={type} style={[styles.previewLine, { color: colors.text }]}>
                      {type}: {count}
                    </Text>
                  ))}
                {Object.keys(pendingRevolutPreview.typeCounts).length === 0 ? (
                  <Text style={[styles.previewLine, { color: colors.textSecondary }]}>
                    Žádné známé typy
                  </Text>
                ) : null}
              </View>
              {Object.keys(pendingRevolutPreview.holdings).length > 0 ? (
                <>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Pozice</Text>
                  <View style={[styles.previewBlock, { borderColor: colors.border }]}>
                    {Object.entries(pendingRevolutPreview.holdings).map(([ticker, units]) => (
                      <Text key={ticker} style={[styles.previewLine, { color: colors.text }]}>
                        {ticker}: {units}
                      </Text>
                    ))}
                  </View>
                </>
              ) : null}
              {Object.keys(pendingRevolutPreview.cash).length > 0 ? (
                <>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Hotovost</Text>
                  <View style={[styles.previewBlock, { borderColor: colors.border }]}>
                    {Object.entries(pendingRevolutPreview.cash).map(([ccy, amount]) => (
                      <Text key={ccy} style={[styles.previewLine, { color: colors.text }]}>
                        {ccy}: {amount}
                      </Text>
                    ))}
                  </View>
                </>
              ) : null}
              {pendingRevolutPreview.unknownTypes.length === 0 && !pendingRevolutPreview.error ? (
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setStep('naming')}
                >
                  <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Pokračovat</Text>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.txPreview, { color: colors.textSecondary }]}>
                  Import není povolen, dokud CSV neobsahuje jen známé typy.
                </Text>
              )}
            </View>
          ) : null}

          {step === 'preview' && pendingXtbPreview ? (
            <View style={styles.naming}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Náhled XTB ({formatCountNoun(pendingXtbPreview.txCount, pluralTransakce)})
              </Text>
              {pendingXtbPreview.error ? (
                <Text style={styles.error}>{pendingXtbPreview.error}</Text>
              ) : null}
              <View style={[styles.previewBlock, { borderColor: colors.border }]}>
                {Object.entries(pendingXtbPreview.typeCounts)
                  .filter(([, count]) => count > 0)
                  .map(([type, count]) => (
                    <Text key={type} style={[styles.previewLine, { color: colors.text }]}>
                      {type}: {count}
                    </Text>
                  ))}
              </View>
              {Object.keys(pendingXtbPreview.holdings).length > 0 ? (
                <>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Pozice</Text>
                  <View style={[styles.previewBlock, { borderColor: colors.border }]}>
                    {Object.entries(pendingXtbPreview.holdings).map(([ticker, units]) => (
                      <Text key={ticker} style={[styles.previewLine, { color: colors.text }]}>
                        {ticker}: {units}
                      </Text>
                    ))}
                  </View>
                </>
              ) : null}
              <Text style={[styles.label, { color: colors.textSecondary }]}>Hotovost</Text>
              <View style={[styles.previewBlock, { borderColor: colors.border }]}>
                {Object.entries(pendingXtbPreview.cash).map(([ccy, amount]) => (
                  <Text key={ccy} style={[styles.previewLine, { color: colors.text }]}>
                    {ccy}: {amount}
                  </Text>
                ))}
                {pendingXtbPreview.cashBalance != null ? (
                  <Text style={[styles.previewLine, { color: colors.textSecondary }]}>
                    Total (výpis): {pendingXtbPreview.cashBalance}
                  </Text>
                ) : null}
                <Text style={[styles.previewLine, { color: colors.textSecondary }]}>
                  Realizovaný zisk: {pendingXtbPreview.realizedPl}
                </Text>
              </View>
              {!pendingXtbPreview.error ? (
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setStep('naming')}
                >
                  <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Pokračovat</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {step === 'naming' && (
            <View style={styles.naming}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                {t('investPortfolioVisibility')}
              </Text>
              <View style={[styles.segmented, { backgroundColor: colors.muted }]}>
                {(
                  [
                    { id: 'personal' as const, label: t('investPortfolioPersonal') },
                    { id: 'shared' as const, label: t('investPortfolioShared') },
                  ] as const
                ).map((item) => {
                  const active = visibility === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.segment, active && { backgroundColor: colors.primary }]}
                      onPress={() => setVisibility(item.id)}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          { color: colors.textSecondary },
                          active && { color: colors.onPrimary, fontWeight: '700' },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {visibility === 'shared' && households.length > 0 ? (
                <View style={styles.householdPick}>
                  {households.map((h) => {
                    const active = sharedHouseholdId === h.id;
                    return (
                      <TouchableOpacity
                        key={h.id}
                        style={[
                          styles.householdChip,
                          {
                            borderColor: active ? colors.primary : colors.border,
                            backgroundColor: active ? colors.primary + '22' : colors.surface,
                          },
                        ]}
                        onPress={() => setSharedHouseholdId(h.id)}
                      >
                        <Text style={{ color: active ? colors.primary : colors.text, fontWeight: '600' }}>
                          {h.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
              <Text style={[styles.label, { color: colors.textSecondary }]}>Název portfolia</Text>
              {pendingEtoroFileContents?.length ? (
                <Text style={[styles.txPreview, { color: colors.textSecondary }]}>
                  {formatCountNoun(pendingEtoroFileCount, pluralSoubor)},{' '}
                  {formatCountNoun(pendingEtoroTxCount, pluralTransakce)} (upsert — lze přidávat další
                  výpisy)
                </Text>
              ) : null}
              {pendingT212CsvTexts?.length ? (
                <Text style={[styles.txPreview, { color: colors.textSecondary }]}>
                  {formatCountNoun(pendingT212FileCount, pluralSoubor)},{' '}
                  {formatCountNoun(pendingT212TxCount, pluralTransakce)} (upsert — lze přidávat další
                  roční CSV)
                </Text>
              ) : null}
              {pendingRevolutCsvText && pendingRevolutPreview ? (
                <Text style={[styles.txPreview, { color: colors.textSecondary }]}>
                  {formatCountNoun(pendingRevolutPreview.txCount, pluralTransakce)}
                  {Object.keys(pendingRevolutPreview.typeCounts).length
                    ? ` (${Object.entries(pendingRevolutPreview.typeCounts)
                        .map(([type, count]) => `${type}: ${count}`)
                        .join(', ')})`
                    : ''}
                  {Object.keys(pendingRevolutPreview.cash).length
                    ? ` · hotovost ${Object.entries(pendingRevolutPreview.cash)
                        .map(([ccy, amount]) => `${amount} ${ccy}`)
                        .join(', ')}`
                    : ''}
                </Text>
              ) : null}
              {pendingXtbFileContent && pendingXtbPreview ? (
                <Text style={[styles.txPreview, { color: colors.textSecondary }]}>
                  {formatCountNoun(pendingXtbPreview.txCount, pluralTransakce)}
                  {Object.keys(pendingXtbPreview.typeCounts).length
                    ? ` (${Object.entries(pendingXtbPreview.typeCounts)
                        .map(([type, count]) => `${type}: ${count}`)
                        .join(', ')})`
                    : ''}
                  {pendingXtbPreview.cashBalance != null
                    ? ` · hotovost ${pendingXtbPreview.cashBalance} EUR`
                    : ''}
                  {` · P/L ${pendingXtbPreview.realizedPl} EUR`}
                </Text>
              ) : null}
              {infoHint ? (
                <Text style={[styles.infoHint, { color: colors.textSecondary, borderColor: colors.border }]}>
                  {infoHint}
                </Text>
              ) : null}
              <TextInput
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
                ]}
                value={portfolioName}
                onChangeText={setPortfolioName}
                placeholder="eToro – Smudliczek"
                placeholderTextColor={colors.textSecondary}
                autoFocus
              />
              {pendingRevolutCsvText || pendingXtbFileContent ? (
                <AsyncButton
                  label="Importovat"
                  loadingLabel="Importuji…"
                  onPress={() => finishImport(portfolioName)}
                  variant="solid"
                  solidColor={colors.primary}
                  style={styles.primaryBtn}
                  textStyle={[styles.primaryBtnText, { color: colors.onPrimary }]}
                />
              ) : (
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                  onPress={() => void finishImport(portfolioName)}
                >
                  <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>Uložit portfolio</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {step === 'loading' && (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.textSecondary, marginTop: 12 }}>{t('loading')}</Text>
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity onPress={handleClose} style={styles.cancelBtn}>
            <Text style={{ color: colors.textSecondary }}>{t('cancel')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  options: { gap: 10 },
  optionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionText: { fontSize: 16, fontWeight: '600' },
  naming: { gap: 10 },
  segmented: { flexDirection: 'row', borderRadius: 12, padding: 4 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  segmentText: { fontSize: 14, fontWeight: '600' },
  householdPick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  householdChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 14 },
  txPreview: { fontSize: 13, marginBottom: 4 },
  previewBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  previewLine: { fontSize: 13 },
  infoHint: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  primaryBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
  loading: { alignItems: 'center', paddingVertical: 24 },
  error: { color: '#EF4444', marginTop: 12, fontSize: 14 },
  cancelBtn: { marginTop: 16, alignItems: 'center' },
});
