import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  InteractionManager,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { FileSpreadsheet, Upload, X } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { useAuth } from '@/store/auth-store';
import { useSettingsStore } from '@/store/settings-store';
import { supabase } from '@/lib/supabase';
import { czechCountForm, pluralNovaTransakce, pluralDuplicita, pluralTransakce, pluralPolozka, pluralProtiucet, pluralVypis, pluralSoubor, pluralUcet } from '@/lib/plural-cs';
import { normalizeAccount } from '@/utils/normalizeAccount';
import {
  insertBankImportTransactionsRemote,
  reclassifyTransfersByAccountsRemote,
} from '@/lib/supabase-transactions';
import { useFinanceStore } from '@/store/finance-store';
import BankStatementImportModal from '@/components/BankStatementImportModal';
import { readCsvTextFromUri, parseBankStatementCsv, type ParsedImportRow } from '@/lib/bank-statement-parser';
import { parseBankPdfWithPdfCo, PDF_PARSE_LOGIN_REQUIRED } from '@/lib/parse-bank-pdf-api';
import { csvBankIdToSource, resolvePdfImportSource } from '@/lib/bank-import-source';
import { invokeFioSync } from '@/lib/fio-sync-client';
import { logAndGetUserFacingError } from '@/lib/user-facing-error';
import { useAsyncAction } from '@/hooks/use-async-action';
import {
  loadOwnerBanksFromStorage,
  getAllOwnerAccountNumbers,
  shouldShowOwnerAccountsImportPrompt,
  markOwnerAccountsImportPromptDone,
  loadDismissedOwnAccountSuggestions,
  addDismissedOwnAccountSuggestions,
  appendOwnerAccountsToStorage,
} from '@/lib/owner-accounts-storage';
import { buildOwnerNames, accountLabelsFromOwnerBanks } from '@/lib/owner-names';
import { fetchUserProfileFromSupabase } from '@/lib/user-profile-supabase';
import {
  buildOwnAccountSuggestions,
  findLoanPaymentCandidates,
  findPooledTransferCandidates,
  findRevolutCardTopupCandidates,
  findTransactionIdsMatchingAccounts,
  type LoanPaymentSuggestCandidate,
  type OwnAccountCandidate,
  type PooledTransferCandidate,
  type RevolutCardTopupCandidate,
} from '@/lib/suggest-own-accounts';
import { LOAN_PAYMENT_CATEGORY } from '@/lib/loan-payment-detect';
import { randomUUID } from '@/lib/random-uuid';

import type { Transaction } from '@/store/finance-store';

function isCsvFile(mimeType: string | undefined, fileName: string | undefined): boolean {
  const m = (mimeType ?? '').toLowerCase();
  const n = (fileName ?? '').toLowerCase();
  if (m.includes('csv') || m === 'text/plain') return true;
  if (n.endsWith('.csv')) return true;
  return false;
}

function isPdfFile(mimeType: string | undefined, fileName: string | undefined): boolean {
  const m = (mimeType ?? '').toLowerCase();
  const n = (fileName ?? '').toLowerCase();
  if (m === 'application/pdf' || m.includes('pdf')) return true;
  if (n.endsWith('.pdf')) return true;
  return false;
}

function bankImportUndoConfirmKey(
  n: number,
): 'bankImportUndoConfirmOne' | 'bankImportUndoConfirmFew' | 'bankImportUndoConfirmMany' {
  const f = czechCountForm(n);
  if (f === 'one') return 'bankImportUndoConfirmOne';
  if (f === 'few') return 'bankImportUndoConfirmFew';
  return 'bankImportUndoConfirmMany';
}

function bankImportSuggestOwnTitle(
  count: number,
  t: (k: any, p?: Record<string, string | number>) => string,
  lang: 'cs' | 'en',
): string {
  const noun = pluralUcet(count, lang);
  const which =
    count === 1 ? t('bankImportSuggestOwnWhichOne') : t('bankImportSuggestOwnWhichMany');
  return t('bankImportSuggestOwnTitleTpl', { count, noun, which });
}

export default function BankImportScreen() {
  const { colors } = useTheme();
  const { t, language } = useLanguageStore();
  const lang = language === 'en' ? 'en' : 'cs';
  const { user } = useAuth();
  const userProfile = useSettingsStore((s) => s.userProfile);
  const setUserProfile = useSettingsStore((s) => s.setUserProfile);
  const addTransactions = useFinanceStore((s) => s.addTransactions);
  const deleteTransactions = useFinanceStore((s) => s.deleteTransactions);
  const updateTransaction = useFinanceStore((s) => s.updateTransaction);
  const [modalOpen, setModalOpen] = useState(false);
  const [preview, setPreview] = useState<{
    bankLabel: string;
    rows: ParsedImportRow[];
    warnings?: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  /** Postup jen v horním tlačítku „Vybrat CSV nebo PDF“ (žádná samostatná karta). */
  const [importProgress, setImportProgress] = useState<string | null>(null);
  /** Varování z parsování (neúplný výpis / selhání souboru) — do shrnutí po importu. */
  const parseWarningsRef = useRef<string[]>([]);
  /** ID transakcí z posledního dokončeného importu (pro vrácení jedním klikem). */
  const [lastImportIds, setLastImportIds] = useState<string[] | null>(null);
  const [fioToken, setFioToken] = useState('');
  const [fioSaved, setFioSaved] = useState(false);
  const [ownAccountsPromptOpen, setOwnAccountsPromptOpen] = useState(false);
  const [draftAccountNumber, setDraftAccountNumber] = useState('');
  const [draftAccountLabel, setDraftAccountLabel] = useState('');
  const [draftAccounts, setDraftAccounts] = useState<{ number: string; label: string }[]>([]);
  const [ownAccountCandidates, setOwnAccountCandidates] = useState<OwnAccountCandidate[]>([]);
  const [selectedCandidateKeys, setSelectedCandidateKeys] = useState<Set<string>>(new Set());
  const [loanPaymentCandidates, setLoanPaymentCandidates] = useState<LoanPaymentSuggestCandidate[]>(
    [],
  );
  const [pooledTransferCandidates, setPooledTransferCandidates] = useState<PooledTransferCandidate[]>(
    [],
  );
  const [selectedPooledIds, setSelectedPooledIds] = useState<Set<string>>(new Set());
  const [revolutCardCandidates, setRevolutCardCandidates] = useState<RevolutCardTopupCandidate[]>(
    [],
  );
  const [selectedRevolutCardIds, setSelectedRevolutCardIds] = useState<Set<string>>(new Set());
  /** Jméno majitele z hlavičky posledního PDF importu (primární zdroj pro návrhy). */
  const [statementOwnerName, setStatementOwnerName] = useState<string | null>(null);
  const statementOwnerNameRef = useRef<string | null>(null);
  const [reclassifyUndo, setReclassifyUndo] = useState<
    { id: string; category: string }[] | null
  >(null);
  /** Po dismissu modalu „vlastní účty“ otevřít picker (iOS onDismiss / Android fallback). */
  const openPickerAfterOwnAccountsDismissRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem('fio_token').then(async (t) => {
      if (t) {
        setFioToken(t);
        setFioSaved(true);
        // Auto-sync silently on screen open
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const { data: sessionData } = await supabase.auth.getSession();
          if (!user?.id || !sessionData.session?.access_token) return;
          await invokeFioSync({
            fioToken: t,
            userId: user.id,
            accessToken: sessionData.session.access_token,
          });
        } catch (e) {
          // Silent fail - auto sync failure should not bother user
          console.log('[bank-import auto fio-sync] raw error:', e);
        }
      }
    });
  }, []);

  // Jednorázově odeber hypotéční účet z vlastních účtů (nesmí být Převod)
  useEffect(() => {
    const KEY = 'removed_mortgage_own_account_110116442';
    void (async () => {
      try {
        const done = await AsyncStorage.getItem(KEY);
        if (done) return;
        const { removeOwnerAccountsFromStorage } = await import('@/lib/owner-accounts-storage');
        const { removed, banks } = await removeOwnerAccountsFromStorage(['110116442/0100', '110116442']);
        if (removed > 0) {
          useFinanceStore.getState().replaceOwnerBanks(banks);
        }
        await AsyncStorage.setItem(KEY, '1');
        console.log('[bank-import] removed mortgage own account', removed);
      } catch (e) {
        console.warn('[bank-import] remove mortgage account failed', e);
      }
    })();
  }, []);

  const { run: runImportFromAssets, isRunning: isImportingAssets } = useAsyncAction(
    async (
      assets: { uri: string; mimeType?: string; name?: string }[],
    ) => {
      console.log('[import] krok 1 assets picked', {
        count: assets.length,
        names: assets.map((a) => a.name),
        mimes: assets.map((a) => a.mimeType),
      });
      try {
      const supported = assets.filter(
        (a) => isPdfFile(a.mimeType, a.name) || isCsvFile(a.mimeType, a.name),
      );
      console.log('[import] krok 1b supported files', {
        count: supported.length,
        names: supported.map((a) => a.name),
      });
      if (supported.length === 0) {
        Alert.alert(t('importLabel'), t('bankImportSelectCsvOrPdf'));
        return;
      }
      if (supported.length < assets.length) {
        Alert.alert(t('importLabel'), t('bankImportSomeFilesSkipped'));
      }

      const anyPdf = supported.some((a) => isPdfFile(a.mimeType, a.name));
      const showProgressUi = anyPdf || supported.length > 1;
      setLoading(true);
      if (showProgressUi) {
        setImportProgress(null);
      }

      // Účty ze store (plněný z DB); fallback na load pokud ještě není.
      let ownerBanks = useFinanceStore.getState().ownerBanks;
      if (ownerBanks.length === 0) {
        ownerBanks = await loadOwnerBanksFromStorage();
        useFinanceStore.getState().replaceOwnerBanks(ownerBanks);
      }
      const ownerAccounts = getAllOwnerAccountNumbers(ownerBanks);

      // Profil z Supabase (ne jen AsyncStorage) — first/last mají přednost před auth display name
      let profileFirst = userProfile.firstName;
      let profileLast = userProfile.lastName;
      if (user?.id) {
        const row = await fetchUserProfileFromSupabase(user.id);
        if (row) {
          profileFirst = row.first_name ?? '';
          profileLast = row.last_name ?? '';
          setUserProfile({
            firstName: profileFirst,
            lastName: profileLast,
            avatarUrl: row.avatar_url ?? null,
          });
        }
      }

      const ownerNames = buildOwnerNames({
        profileFirstName: profileFirst,
        profileLastName: profileLast,
        authDisplayName: user?.name,
        accountLabels: accountLabelsFromOwnerBanks(ownerBanks),
      });
      /** Pro PDF edge (stále jeden string) — první jméno z pole, nebo undefined. */
      const ownerNameForPdf = ownerNames[0];

      console.log('[import] krok 2 owner context', {
        ownerNames,
        ownerName: ownerNameForPdf ?? null,
        ownerAccounts: ownerAccounts.length,
      });

      const allRows: ParsedImportRow[] = [];
      const sourceLabels: string[] = [];
      const errors: string[] = [];
      const failedNames: string[] = [];
      const total = supported.length;
      let okFiles = 0;
      let collectedStatementOwner: string | null = null;
      statementOwnerNameRef.current = null;
      setStatementOwnerName(null);
      parseWarningsRef.current = [];

      for (let i = 0; i < supported.length; i += 1) {
        const asset = supported[i]!;
        if (showProgressUi) {
          setImportProgress(
            t('bankImportProgressImporting', { current: i + 1, total }),
          );
        }
        if (isPdfFile(asset.mimeType, asset.name)) {
          try {
            console.log('[import] krok 3 read PDF', { i: i + 1, name: asset.name, uri: asset.uri });
            const pdfBase64 = await readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 });
            console.log('[import] krok 3 read PDF done', {
              name: asset.name,
              base64Len: pdfBase64?.length ?? 0,
            });
            const {
              rows,
              message,
              bankLabel,
              debugLines,
              source: pdfSource,
              statementOwnerName: fromStatement,
              statementIncomplete,
              emptyStatement,
              expectedCount,
              parsedCount,
            } = await parseBankPdfWithPdfCo(pdfBase64, asset.name, ownerNameForPdf, ownerAccounts);
            console.log('[import] krok 3 parse done', {
              name: asset.name,
              rows: rows.length,
              bankLabel,
              pdfSource,
              statementIncomplete,
              emptyStatement,
            });
            if (fromStatement?.trim() && !collectedStatementOwner) {
              collectedStatementOwner = fromStatement.trim();
            }
            const src = resolvePdfImportSource(pdfSource);
            if (statementIncomplete || (rows.length === 0 && message?.includes('načíst celý'))) {
              const warn =
                message ||
                t('bankImportStatementIncomplete', {
                  parsed: parsedCount ?? 0,
                  expected: expectedCount ?? '?',
                });
              errors.push(`${asset.name || t('bankImportFileWord')}: ${warn}`);
              failedNames.push(asset.name || t('bankImportFileWord'));
            } else if (rows.length) {
              allRows.push(...rows.map((r) => ({ ...r, source: src })));
              okFiles += 1;
              if (bankLabel) sourceLabels.push(bankLabel);
            } else if (emptyStatement || message?.includes('neobsahuje žádné transakce')) {
              // Prázdný výpis (0 pohybů) — OK, ne chyba
              okFiles += 1;
              if (bankLabel) sourceLabels.push(bankLabel);
              parseWarningsRef.current.push(
                `${asset.name || t('bankImportFileWord')}: ${message || t('bankImportEmptyStatement')}`,
              );
            } else {
              errors.push(
                `${asset.name || t('bankImportFileWord')}: ${message ?? t('bankImportNoTransactions')}`,
              );
              failedNames.push(asset.name || t('bankImportFileWord'));
            }
            if (total === 1 && debugLines?.length) {
              const windowLines = debugLines.slice(0, 50);
              console.log('[bank-import PDF] debug_lines (řádky 1-50):', windowLines);
            }
          } catch (e) {
            console.error('[import] krok 3 PDF failed', asset.name, e);
            const msg =
              e instanceof Error && e.message === PDF_PARSE_LOGIN_REQUIRED
                ? t('bankImportNotSignedIn')
                : e instanceof Error
                  ? e.message
                  : logAndGetUserFacingError('bank-import-pdf', e);
            errors.push(`${asset.name || 'PDF'}: ${msg}`);
            failedNames.push(asset.name || 'PDF');
          }
        } else if (isCsvFile(asset.mimeType, asset.name)) {
          try {
            console.log('[import] krok 3 read CSV', { i: i + 1, name: asset.name });
            const text = await readCsvTextFromUri(asset.uri);
            const parsed = parseBankStatementCsv(text, ownerAccounts, ownerNames);
            if ('error' in parsed) {
              errors.push(`${asset.name || 'CSV'}: ${parsed.error}`);
              failedNames.push(asset.name || 'CSV');
            } else {
              allRows.push(
                ...parsed.rows.map((r) => ({
                  ...r,
                  source: csvBankIdToSource(parsed.bank.id),
                })),
              );
              sourceLabels.push(parsed.bank.label);
              okFiles += 1;
              console.log('[import] krok 3 CSV done', { rows: parsed.rows.length });
            }
          } catch (e) {
            console.error('[import] krok 3 CSV failed', asset.name, e);
            const msg = e instanceof Error ? e.message : String(e);
            errors.push(`${asset.name || 'CSV'}: ${msg}`);
            failedNames.push(asset.name || 'CSV');
          }
        }
      }

      statementOwnerNameRef.current = collectedStatementOwner;
      setStatementOwnerName(collectedStatementOwner);

      if (errors.length) {
        const fileSummary = t('bankImportFilesResultSummary', {
          ok: okFiles,
          total,
          statementsWord: pluralVypis(total, lang),
          failed: failedNames.length,
          names: failedNames.join(', '),
        });
        const warnings: string[] = [];
        if (failedNames.length > 0 && total > 1) {
          warnings.push(fileSummary);
        }
        for (const e of errors) {
          if (/načíst celý|could not be loaded completely|Statement could not/i.test(e)) {
            warnings.push(`${t('bankImportBalanceWarnPrefix')}${e}`);
          } else if (total === 1 || failedNames.length === 0) {
            warnings.push(e);
          }
        }
        if (!warnings.length) warnings.push(...errors);
        parseWarningsRef.current = warnings;
      }

      if (showProgressUi) {
        setImportProgress(t('bankImportProgressCategorizing'));
      }

      console.log('[import] krok 4 preview gate', {
        allRows: allRows.length,
        errors: errors.length,
      });

      if (allRows.length === 0) {
        setLoading(false);
        setImportProgress(null);
        Alert.alert(
          t('importLabel'),
          errors.length
            ? parseWarningsRef.current.join('\n\n') || errors.join('\n\n')
            : t('bankImportNothingToImport'),
        );
        return;
      }

      setLoading(false);
      setImportProgress(null);

      const fileWord = pluralSoubor(total, lang);
      const labelSummary =
        sourceLabels.length > 0 ? Array.from(new Set(sourceLabels)).join(' + ') : t('importLabel');
      const statementCurrencies = [
        ...new Set(
          allRows.map((r) =>
            (r.originalCurrency && r.originalCurrency.toUpperCase() !== 'CZK'
              ? r.originalCurrency.toUpperCase()
              : 'CZK'),
          ),
        ),
      ];
      const currencyPart =
        statementCurrencies.length === 1
          ? ` · ${statementCurrencies[0]}`
          : statementCurrencies.length > 1
            ? ` · ${statementCurrencies.join('+')}`
            : '';
      setPreview({
        bankLabel: t('bankImportPreviewLabel', {
          label: `${labelSummary}${currencyPart}`,
          count: allRows.length,
          transactionsWord: pluralTransakce(allRows.length, lang),
          total,
          fileWord,
        }),
        rows: allRows,
        warnings: ownerNames.length === 0 ? [t('bankImportOwnerNameMissing')] : undefined,
      });
      setModalOpen(true);
      console.log('[import] krok 4 preview modal open', { rows: allRows.length });
      } catch (e) {
        console.error('[import] runImportFromAssets fatal', e);
        setLoading(false);
        setImportProgress(null);
        Alert.alert(t('importLabel'), logAndGetUserFacingError('bank-import', e));
      }
    },
  );

  const { run: openDocumentPicker, isRunning: isPicking } = useAsyncAction(async () => {
    console.log('[import] krok 0 openDocumentPicker');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/csv',
          'application/pdf',
        ],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) {
        console.log('[import] krok 0 canceled by user');
        return;
      }
      const assets = result.assets?.filter((a) => a?.uri) ?? [];
      console.log('[import] krok 0 picker result', { assets: assets.length });
      if (assets.length === 0) {
        Alert.alert(t('importLabel'), t('bankImportFilePickFailed'));
        return;
      }
      await runImportFromAssets(assets);
    } catch (e) {
      console.error('[import] openDocumentPicker failed', e);
      setLoading(false);
      setImportProgress(null);
      Alert.alert(t('importLabel'), logAndGetUserFacingError('bank-import', e));
    }
  });

  /** Zavře modal a otevře picker až po dismissu (iOS) / po InteractionManager (fallback). */
  const closeOwnAccountsPromptThenPick = useCallback(() => {
    openPickerAfterOwnAccountsDismissRef.current = true;
    setOwnAccountsPromptOpen(false);
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        if (!openPickerAfterOwnAccountsDismissRef.current) return;
        openPickerAfterOwnAccountsDismissRef.current = false;
        void openDocumentPicker();
      }, 350);
    });
  }, [openDocumentPicker]);

  const onOwnAccountsPromptDismiss = useCallback(() => {
    if (!openPickerAfterOwnAccountsDismissRef.current) return;
    openPickerAfterOwnAccountsDismissRef.current = false;
    void openDocumentPicker();
  }, [openDocumentPicker]);

  const pickFile = useCallback(async () => {
    if (loading || isPicking || isImportingAssets) {
      console.log('[import] pickFile skipped — busy');
      return;
    }
    console.log('[import] pickFile tapped');
    try {
      if (await shouldShowOwnerAccountsImportPrompt()) {
        console.log('[import] own-accounts prompt shown — picker deferred');
        setDraftAccounts([]);
        setDraftAccountNumber('');
        setDraftAccountLabel('');
        setOwnAccountsPromptOpen(true);
        return;
      }
      await openDocumentPicker();
    } catch (e) {
      console.error('[import] pickFile failed', e);
      Alert.alert(t('importLabel'), logAndGetUserFacingError('bank-import', e));
    }
  }, [loading, isPicking, isImportingAssets, openDocumentPicker, t]);

  const addDraftAccount = useCallback(() => {
    const number = draftAccountNumber.trim();
    if (!number) {
      Alert.alert(t('importLabel'), t('bankImportOwnAccountsEmptyAdd'));
      return;
    }
    setDraftAccounts((prev) => [
      ...prev,
      {
        number,
        label: draftAccountLabel.trim() || t('bankImportOwnAccountsDefaultLabel'),
      },
    ]);
    setDraftAccountNumber('');
    setDraftAccountLabel('');
  }, [draftAccountLabel, draftAccountNumber, t]);

  const { run: persistDraftAccountsAndContinue } = useAsyncAction(async () => {
    try {
      const pending = [...draftAccounts];
      const number = draftAccountNumber.trim();
      if (number && !pending.some((a) => a.number === number)) {
        pending.push({
          number,
          label: draftAccountLabel.trim() || t('bankImportOwnAccountsDefaultLabel'),
        });
      }

      if (pending.length > 0) {
        const saved = await appendOwnerAccountsToStorage(
          pending,
          t('bankImportOwnAccountsBankName'),
        );
        useFinanceStore.getState().replaceOwnerBanks(saved);
      }
      await markOwnerAccountsImportPromptDone();
      setDraftAccounts([]);
      setDraftAccountNumber('');
      setDraftAccountLabel('');
      closeOwnAccountsPromptThenPick();
    } catch (e) {
      Alert.alert(t('importLabel'), logAndGetUserFacingError('bank-import-own-accounts', e));
    }
  });

  const { run: skipOwnAccountsPrompt } = useAsyncAction(async () => {
    await markOwnerAccountsImportPromptDone();
    closeOwnAccountsPromptThenPick();
  });

  const { run: handleSuggestAddSelected } = useAsyncAction(async () => {
    const selected = ownAccountCandidates.filter((c) =>
      selectedCandidateKeys.has(c.key),
    );
    if (!selected.length) return;
    try {
      const saved = await appendOwnerAccountsToStorage(
        selected.map((c) => ({
          number: c.accountNumber,
          label: c.counterpartyName || t('bankImportOwnAccountsDefaultLabel'),
        })),
        t('bankImportOwnAccountsBankName'),
      );
      useFinanceStore.getState().replaceOwnerBanks(saved);
      const remaining = ownAccountCandidates.filter(
        (c) => !selectedCandidateKeys.has(c.key),
      );
      if (remaining.length) {
        await addDismissedOwnAccountSuggestions(remaining.map((c) => c.key));
      }
      setOwnAccountCandidates([]);
      setSelectedCandidateKeys(new Set());

      const nums = selected
        .map((c) => normalizeAccount(c.accountNumber))
        .filter((a): a is string => !!a);
      const { updatedCount, missingCounterpartyCount, error } =
        await reclassifyTransfersByAccountsRemote(nums);
      console.log('[import] krok 6 reclassify', {
        accounts: nums,
        updatedCount,
        missingCounterpartyCount,
        error: error?.message,
      });
      if (error) {
        console.error('[import] krok 6 reclassify failed', error);
        Alert.alert(t('importLabel'), error.message);
        return;
      }
      const ids = findTransactionIdsMatchingAccounts(
        useFinanceStore.getState().transactions,
        nums,
      );
      const undo = ids.map((id) => {
        const tx = useFinanceStore.getState().transactions.find((x) => x.id === id);
        return { id, category: tx?.category || 'Ostatní' };
      });
      for (const { id } of undo) {
        updateTransaction(id, { category: 'Převod' });
      }
      if (updatedCount > 0) setReclassifyUndo(undo);

      const parts = [
        t('bankImportSuggestReclassifyDone', {
          count: updatedCount,
          transactionsWord: pluralTransakce(updatedCount, lang),
        }),
      ];
      if (missingCounterpartyCount > 0) {
        parts.push(
          t('bankImportSuggestReclassifyMissingCp', {
            count: missingCounterpartyCount,
            transactionsWord: pluralTransakce(missingCounterpartyCount, lang),
          }),
        );
      }
      if (updatedCount === 0 && missingCounterpartyCount === 0) {
        Alert.alert(t('importLabel'), t('bankImportSuggestAccountsAdded'));
        return;
      }
      Alert.alert(t('importLabel'), parts.join('\n\n'));
    } catch (e) {
      console.error('[import] suggest add failed', e);
      Alert.alert(t('importLabel'), logAndGetUserFacingError('bank-import-suggest', e));
    }
  });

  const { run: handleSuggestDismissOwn } = useAsyncAction(async () => {
    await addDismissedOwnAccountSuggestions(ownAccountCandidates.map((c) => c.key));
    setOwnAccountCandidates([]);
    setSelectedCandidateKeys(new Set());
  });

  const { run: handleLoanSuggestConfirm } = useAsyncAction(async () => {
    try {
      const ids = loanPaymentCandidates.flatMap((c) => c.sampleTxIds);
      for (const id of ids) {
        updateTransaction(id, { category: LOAN_PAYMENT_CATEGORY });
      }
      setLoanPaymentCandidates([]);
      Alert.alert(
        t('importLabel'),
        t('bankImportSuggestReclassifyDone', {
          count: ids.length,
          transactionsWord: pluralTransakce(ids.length, lang),
        }),
      );
    } catch (e) {
      Alert.alert(t('importLabel'), logAndGetUserFacingError('bank-import-loan', e));
    }
  });

  const { run: syncFio, isRunning: fioSyncing } = useAsyncAction(async () => {
    if (!fioToken.trim()) return;
    try {
      await AsyncStorage.setItem('fio_token', fioToken.trim());
      const { data: { user } } = await supabase.auth.getUser();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!user?.id || !sessionData.session?.access_token) {
        Alert.alert('Chyba', 'Přihlášení vypršelo, přihlas se znovu.');
        return;
      }
      const result = await invokeFioSync({
        fioToken: fioToken.trim(),
        userId: user.id,
        accessToken: sessionData.session.access_token,
      });
      setFioSaved(true);
      const imported = result?.imported ?? 0;
      const total = result?.total ?? 0;
      Alert.alert(
        'Fio synchronizace',
        `Importováno ${imported} ${pluralNovaTransakce(imported, 'cs')} z ${total} celkem`,
      );
    } catch (e) {
      Alert.alert('Chyba', logAndGetUserFacingError('fio-sync', e));
    }
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#0D9488', '#0F766E']}
          style={styles.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <FileSpreadsheet color="white" size={40} />
          <Text style={styles.heroTitle}>{t('bankImportHeroTitle')}</Text>
          <Text style={styles.heroSub}>{t('bankImportHeroDescription')}</Text>
        </LinearGradient>

        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
          onPress={pickFile}
          activeOpacity={0.9}
          disabled={loading}
        >
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            style={styles.primaryGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {loading ? (
              <ActivityIndicator color="white" style={styles.primaryIcon} />
            ) : (
              <Upload color="white" size={22} style={styles.primaryIcon} />
            )}
            <Text style={styles.primaryBtnText} numberOfLines={2}>
              {loading ? (importProgress ?? t('hhNotifSaving')) : t('bankImportPickFiles')}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        {ownAccountCandidates.length > 0 && (
          <View
            style={[
              styles.suggestCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.suggestTitle, { color: colors.text }]}>
              {bankImportSuggestOwnTitle(ownAccountCandidates.length, t, lang)}
            </Text>
            <Text style={[styles.suggestBody, { color: colors.textSecondary }]}>
              {t('bankImportSuggestOwnBody')}
            </Text>
            {ownAccountCandidates.map((c) => {
              const checked = selectedCandidateKeys.has(c.key);
              return (
                <TouchableOpacity
                  key={c.key}
                  style={styles.suggestRow}
                  onPress={() => {
                    setSelectedCandidateKeys((prev) => {
                      const next = new Set(prev);
                      if (next.has(c.key)) next.delete(c.key);
                      else next.add(c.key);
                      return next;
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.suggestCheck,
                      {
                        borderColor: colors.border,
                        backgroundColor: checked ? colors.primary : 'transparent',
                      },
                    ]}
                  >
                    {checked ? <Text style={styles.suggestCheckMark}>✓</Text> : null}
                  </View>
                  <Text style={[styles.suggestRowText, { color: colors.text }]}>
                    {c.accountNumber} — {c.counterpartyName} ({c.count}×)
                  </Text>
                </TouchableOpacity>
              );
            })}
            <View style={styles.suggestActions}>
              <TouchableOpacity
                style={[
                  styles.suggestPrimary,
                  {
                    backgroundColor: colors.primary,
                    opacity: selectedCandidateKeys.size === 0 ? 0.5 : 1,
                  },
                ]}
                disabled={selectedCandidateKeys.size === 0}
                onPress={() => {
                  void handleSuggestAddSelected();
                }}
              >
                <Text style={styles.suggestPrimaryText}>{t('bankImportSuggestAddSelected')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  void handleSuggestDismissOwn();
                }}
              >
                <Text style={{ color: colors.textSecondary }}>{t('bankImportSuggestNotNow')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {loanPaymentCandidates.length > 0 && (
          <View
            style={[
              styles.suggestCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.suggestTitle, { color: colors.text }]}>
              {t('bankImportLoanSuggestTitle')}
            </Text>
            <Text style={[styles.suggestBody, { color: colors.textSecondary }]}>
              {t('bankImportLoanSuggestBody')}
            </Text>
            {loanPaymentCandidates.map((c) => (
              <View key={c.key} style={styles.suggestRow}>
                <Text style={[styles.suggestRowText, { color: colors.text }]}>
                  {c.accountNumber} — {c.counterpartyName} ({c.count}× ·{' '}
                  {Math.round(c.totalAmount).toLocaleString(lang === 'cs' ? 'cs-CZ' : 'en-US')} Kč)
                </Text>
              </View>
            ))}
            <View style={styles.suggestActions}>
              <TouchableOpacity
                style={[styles.suggestPrimary, { backgroundColor: colors.primary }]}
                onPress={() => {
                  void handleLoanSuggestConfirm();
                }}
              >
                <Text style={styles.suggestPrimaryText}>{t('bankImportLoanSuggestConfirm')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setLoanPaymentCandidates([])}>
                <Text style={{ color: colors.textSecondary }}>{t('bankImportSuggestNotNow')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {pooledTransferCandidates.length > 0 && (
          <View
            style={[
              styles.suggestCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.suggestTitle, { color: colors.text }]}>
              {t('bankImportPooledTitle', {
                service: pooledTransferCandidates[0]?.serviceLabel ?? 'Revolut',
              })}
            </Text>
            <Text style={[styles.suggestBody, { color: colors.textSecondary }]}>
              {t('bankImportPooledBody', {
                service: pooledTransferCandidates[0]?.serviceLabel ?? 'Revolut',
              })}
            </Text>
            {pooledTransferCandidates.map((c) => {
              const checked = selectedPooledIds.has(c.id);
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.suggestRow}
                  onPress={() => {
                    setSelectedPooledIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(c.id)) next.delete(c.id);
                      else next.add(c.id);
                      return next;
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.suggestCheck,
                      {
                        borderColor: colors.border,
                        backgroundColor: checked ? colors.primary : 'transparent',
                      },
                    ]}
                  >
                    {checked ? <Text style={styles.suggestCheckMark}>✓</Text> : null}
                  </View>
                  <Text style={[styles.suggestRowText, { color: colors.text }]}>
                    {c.date} · {c.type === 'income' ? '+' : '−'}
                    {c.amount.toLocaleString('cs-CZ')} Kč — {c.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <View style={styles.suggestActions}>
              <TouchableOpacity
                style={[
                  styles.suggestPrimary,
                  {
                    backgroundColor: colors.primary,
                    opacity: selectedPooledIds.size === 0 ? 0.5 : 1,
                  },
                ]}
                disabled={selectedPooledIds.size === 0}
                onPress={() => {
                  const ids = [...selectedPooledIds];
                  for (const id of ids) {
                    updateTransaction(id, { category: 'Převod' });
                  }
                  setPooledTransferCandidates((prev) => prev.filter((c) => !selectedPooledIds.has(c.id)));
                  setSelectedPooledIds(new Set());
                  Alert.alert(
                    t('importLabel'),
                    t('bankImportSuggestReclassifyDone', {
                      count: ids.length,
                      transactionsWord: pluralTransakce(ids.length, lang),
                    }),
                  );
                }}
              >
                <Text style={styles.suggestPrimaryText}>{t('bankImportPooledConfirm')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setPooledTransferCandidates([]);
                  setSelectedPooledIds(new Set());
                }}
              >
                <Text style={{ color: colors.textSecondary }}>{t('bankImportSuggestNotNow')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {revolutCardCandidates.length > 0 && (
          <View
            style={[
              styles.suggestCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.suggestTitle, { color: colors.text }]}>
              {t('bankImportRevolutCardTitle')}
            </Text>
            <Text style={[styles.suggestBody, { color: colors.textSecondary }]}>
              {t('bankImportRevolutCardBody')}
            </Text>
            {revolutCardCandidates.map((c) => {
              const checked = selectedRevolutCardIds.has(c.id);
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.suggestRow}
                  onPress={() => {
                    setSelectedRevolutCardIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(c.id)) next.delete(c.id);
                      else next.add(c.id);
                      return next;
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.suggestCheck,
                      {
                        borderColor: colors.border,
                        backgroundColor: checked ? colors.primary : 'transparent',
                      },
                    ]}
                  >
                    {checked ? <Text style={styles.suggestCheckMark}>✓</Text> : null}
                  </View>
                  <Text style={[styles.suggestRowText, { color: colors.text }]}>
                    {c.date} · {c.amount.toLocaleString('cs-CZ')} Kč — {c.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <View style={styles.suggestActions}>
              <TouchableOpacity
                style={[
                  styles.suggestPrimary,
                  {
                    backgroundColor: colors.primary,
                    opacity: selectedRevolutCardIds.size === 0 ? 0.5 : 1,
                  },
                ]}
                disabled={selectedRevolutCardIds.size === 0}
                onPress={() => {
                  const ids = [...selectedRevolutCardIds];
                  for (const id of ids) {
                    updateTransaction(id, { category: 'Převod' });
                  }
                  setRevolutCardCandidates((prev) =>
                    prev.filter((c) => !selectedRevolutCardIds.has(c.id)),
                  );
                  setSelectedRevolutCardIds(new Set());
                  Alert.alert(
                    t('importLabel'),
                    t('bankImportSuggestReclassifyDone', {
                      count: ids.length,
                      transactionsWord: pluralTransakce(ids.length, lang),
                    }),
                  );
                }}
              >
                <Text style={styles.suggestPrimaryText}>{t('bankImportRevolutCardConfirm')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setRevolutCardCandidates([]);
                  setSelectedRevolutCardIds(new Set());
                }}
              >
                <Text style={{ color: colors.textSecondary }}>{t('bankImportSuggestNotNow')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {reclassifyUndo && reclassifyUndo.length > 0 && (
          <TouchableOpacity
            style={[styles.undoImportBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              for (const u of reclassifyUndo) {
                updateTransaction(u.id, { category: u.category });
              }
              setReclassifyUndo(null);
              Alert.alert(t('importLabel'), t('bankImportSuggestReclassifyUndone'));
            }}
          >
            <Text style={[styles.undoImportText, { color: colors.text }]}>
              {t('bankImportSuggestUndoReclassify')}
            </Text>
            <Text style={[styles.undoImportSub, { color: colors.textSecondary }]}>
              {t('bankImportSuggestUndoReclassifySub', {
                count: reclassifyUndo.length,
                transactionsWord: pluralTransakce(reclassifyUndo.length, lang),
              })}
            </Text>
          </TouchableOpacity>
        )}

        <View style={[styles.fioCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.fioTitle, { color: colors.text }]}>🏦 Fio banka — auto sync</Text>
          <Text style={[styles.fioSub, { color: colors.textSecondary }]}>
            Vlož API token z Fio internetového bankovnictví. Token najdeš v nastavení Fio účtu.
          </Text>
          <TextInput
            style={[styles.fioInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            placeholder="Fio API token"
            placeholderTextColor={colors.textSecondary}
            value={fioToken}
            onChangeText={setFioToken}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.fioBtn, { backgroundColor: colors.primary, opacity: (fioSyncing || !fioToken.trim()) ? 0.6 : 1 }]}
            onPress={syncFio}
            disabled={fioSyncing || !fioToken.trim()}
            activeOpacity={0.85}
          >
            {fioSyncing
              ? <ActivityIndicator color="white" />
              : <Text style={styles.fioBtnText}>{fioSaved ? '🔄 Synchronizovat' : '💾 Uložit a synchronizovat'}</Text>
            }
          </TouchableOpacity>
        </View>

        {lastImportIds && lastImportIds.length > 0 && (
          <TouchableOpacity
            style={[styles.undoImportBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              const n = lastImportIds.length;
              Alert.alert(
                t('bankImportUndoTitle'),
                t(bankImportUndoConfirmKey(n), { count: n }),
                [
                  { text: t('cancel'), style: 'cancel' },
                  {
                    text: t('delete'),
                    style: 'destructive',
                    onPress: () => {
                      deleteTransactions(lastImportIds);
                      setLastImportIds(null);
                    },
                  },
                ],
              );
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.undoImportText, { color: colors.text }]}>{t('bankImportUndoButton')}</Text>
            <Text style={[styles.undoImportSub, { color: colors.textSecondary }]}>
              {t('bankImportUndoSubtitle', {
                count: lastImportIds.length,
                itemsWord: pluralPolozka(lastImportIds.length, lang),
              })}
            </Text>
          </TouchableOpacity>
        )}

      </ScrollView>

      {preview && (
        <BankStatementImportModal
          visible={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setPreview(null);
            setImportProgress(null);
          }}
          bankLabel={preview.bankLabel}
          rows={preview.rows}
          previewWarnings={preview.warnings}
          importProgress={importProgress}
          onConfirm={async (txs, helpers) => {
            console.log('[import] krok 5 confirm start', { count: txs.length });
            const setProgress = async (message: string) => {
              setImportProgress(message);
              await helpers.setProgress(message);
            };
            try {
            await setProgress(
              t('bankImportProgressSaving', {
                count: txs.length,
                transactionsWord: pluralTransakce(txs.length, lang),
              }),
            );
            const importBatchId = randomUUID();
            const withMeta: Transaction[] = txs.map((tx) => {
              const cpAcc = normalizeAccount(tx.counterpartyAccount) ?? undefined;
              const cpName = tx.counterpartyName?.trim() || undefined;
              return {
                ...tx,
                title: (tx.title || tx.counterpartyName || '').trim() || t('transactionUntitled'),
                importBatchId,
                counterpartyAccount: cpAcc,
                counterpartyName: cpName,
                uniqueKey: undefined,
              };
            });

            const {
              data: { user: authUser },
              error: authError,
            } = await supabase.auth.getUser();
            if (authError || !authUser?.id) {
              console.error('[import] krok 5 not authenticated', authError);
              Alert.alert(t('importLabel'), t('bankImportNotSavedCloud'));
              throw new Error('not_authenticated');
            }

            console.log('[import] krok 5 insert+backfill', {
              batchId: importBatchId,
              rows: withMeta.length,
            });
            const { transactions: inserted, error: remoteError, skippedDuplicates, backfilledCounterparties } =
              await insertBankImportTransactionsRemote(withMeta, authUser.id);
            if (remoteError) {
              console.error('[import] krok 5 insert failed', remoteError);
              Alert.alert(t('importLabel'), remoteError.message || t('bankImportSaveFailed'));
              throw new Error('import_failed_shown');
            }
            if (!inserted) {
              console.error('[import] krok 5 insert empty');
              Alert.alert(t('importLabel'), t('bankImportInsertEmpty'));
              throw new Error('insert_empty');
            }

            const x = inserted.length;
            const y = skippedDuplicates;
            const bf = backfilledCounterparties;
            console.log('[import] krok 5 insert done', {
              inserted: x,
              skipped: y,
              backfilled: bf,
            });

            await setProgress(t('bankImportProgressReclassify'));

            if (x > 0) {
              addTransactions(inserted, { fromRemote: true });
              setLastImportIds(inserted.map((tx) => tx.id));
            }

            // Návrhy i při čistém reimportu (x===0) — DB deduplikuje, protiúčty můžou být nové.
            {
              const fromStatement = (
                statementOwnerNameRef.current ||
                statementOwnerName ||
                ''
              ).trim();
              let banksForSuggest = useFinanceStore.getState().ownerBanks;
              if (banksForSuggest.length === 0) {
                banksForSuggest = await loadOwnerBanksFromStorage();
                useFinanceStore.getState().replaceOwnerBanks(banksForSuggest);
              }
              const ownerNamesForSuggest = buildOwnerNames({
                profileFirstName: userProfile.firstName,
                profileLastName: userProfile.lastName,
                authDisplayName: user?.name,
                accountLabels: accountLabelsFromOwnerBanks(banksForSuggest),
              });
              const resolvedOwner =
                fromStatement ||
                ownerNamesForSuggest[0] ||
                [userProfile.firstName, userProfile.lastName].filter(Boolean).join(' ').trim() ||
                '';

              const owners = getAllOwnerAccountNumbers(banksForSuggest);
              const dismissed = await loadDismissedOwnAccountSuggestions();

              const storeTxs = useFinanceStore.getState().transactions;
              const suggestSource =
                inserted.length > 0
                  ? inserted
                  : withMeta.map((tx) => {
                      const match = storeTxs.find(
                        (s) =>
                          s.date === tx.date &&
                          s.amount === tx.amount &&
                          s.type === tx.type &&
                          (normalizeAccount(s.counterpartyAccount) ?? '') ===
                            (normalizeAccount(tx.counterpartyAccount) ?? '') &&
                          (s.title || '') === (tx.title || ''),
                      );
                      return match ?? tx;
                    });

              const suggestTxs = suggestSource.map((tx) => ({
                id: tx.id,
                title: tx.title,
                description: tx.description,
                type: tx.type,
                amount: tx.amount,
                date: tx.date,
                category: tx.category,
                counterpartyAccount: tx.counterpartyAccount,
                counterpartyName: tx.counterpartyName,
              }));

              const candidates = buildOwnAccountSuggestions({
                txs: suggestTxs,
                ownerName: resolvedOwner,
                existingAccounts: owners,
                dismissedKeys: dismissed,
              });
              if (candidates.length) {
                setOwnAccountCandidates(candidates);
                setSelectedCandidateKeys(new Set(candidates.map((c) => c.key)));
              } else {
                setOwnAccountCandidates([]);
                setSelectedCandidateKeys(new Set());
                console.log('[bank-import] own-account suggestions: none', {
                  resolvedOwner: resolvedOwner || null,
                });
              }

              const loanCands = findLoanPaymentCandidates({ txs: suggestTxs });
              setLoanPaymentCandidates(loanCands);

              const pooled = findPooledTransferCandidates(suggestTxs);
              setPooledTransferCandidates(pooled);
              setSelectedPooledIds(new Set());

              const revolutCards = findRevolutCardTopupCandidates(suggestTxs);
              setRevolutCardCandidates(revolutCards);
              setSelectedRevolutCardIds(new Set());
            }

            await setProgress(t('bankImportProgressDone'));

            const summary = t('bankImportResultSummary', {
              imported: x,
              transactionsWord: pluralTransakce(x, lang),
              skipped: y,
              duplicatesWord: pluralDuplicita(y, lang),
              backfilled: bf,
              counterpartiesWord: pluralProtiucet(bf, lang),
            });
            const warnParts = parseWarningsRef.current;
            const body =
              warnParts.length > 0 ? `${summary}\n\n${warnParts.join('\n\n')}` : summary;
            Alert.alert(t('done'), body);
            parseWarningsRef.current = [];
            setImportProgress(null);
            console.log('[import] krok 5 confirm complete');
            } catch (e) {
              console.error('[import] krok 5 confirm failed', e);
              setImportProgress(null);
              if (
                !(
                  e instanceof Error &&
                  (e.message === 'not_authenticated' ||
                    e.message === 'insert_empty' ||
                    e.message === 'import_failed_shown')
                )
              ) {
                Alert.alert(t('importLabel'), logAndGetUserFacingError('bank-import-confirm', e));
                throw new Error('import_failed_shown');
              }
              throw e;
            }
          }}
        />
      )}

      <Modal
        visible={ownAccountsPromptOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setOwnAccountsPromptOpen(false)}
        onDismiss={onOwnAccountsPromptDismiss}
      >
        <KeyboardAvoidingView
          style={styles.promptOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.promptCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.promptTitle, { color: colors.text }]}>
              {t('bankImportOwnAccountsTitle')}
            </Text>
            <Text style={[styles.promptBody, { color: colors.textSecondary }]}>
              {t('bankImportOwnAccountsBody')}
            </Text>
            <Text style={[styles.promptWarn, { color: colors.text }]}>
              {t('bankImportOwnAccountsWarn')}
            </Text>

            {draftAccounts.map((a, i) => (
              <View key={`${a.number}-${i}`} style={[styles.draftRow, { borderColor: colors.border }]}>
                <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
                  {a.label}: {a.number}
                </Text>
                <TouchableOpacity
                  onPress={() => setDraftAccounts((prev) => prev.filter((_, j) => j !== i))}
                  hitSlop={8}
                >
                  <X size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {t('bankImportOwnAccountsNumberLabel')}
            </Text>
            <TextInput
              style={[
                styles.promptInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              placeholder={t('bankImportOwnAccountsNumberPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={draftAccountNumber}
              onChangeText={setDraftAccountNumber}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {t('bankImportOwnAccountsLabelOptional')}
            </Text>
            <TextInput
              style={[
                styles.promptInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
              placeholder={t('bankImportOwnAccountsLabelPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={draftAccountLabel}
              onChangeText={setDraftAccountLabel}
            />
            <TouchableOpacity
              style={[styles.addDraftBtn, { borderColor: colors.border }]}
              onPress={addDraftAccount}
            >
              <Text style={{ color: colors.primary, fontWeight: '600' }}>
                {t('bankImportOwnAccountsAdd')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.promptPrimary, { backgroundColor: colors.primary }]}
              onPress={persistDraftAccountsAndContinue}
              activeOpacity={0.9}
            >
              <Text style={styles.promptPrimaryText}>{t('bankImportOwnAccountsContinue')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={skipOwnAccountsPrompt} style={styles.promptSkip}>
              <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>
                {t('bankImportOwnAccountsSkip')}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 40 },
  hero: { paddingTop: 24, paddingBottom: 28, paddingHorizontal: 20 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: 'white', marginTop: 12 },
  heroSub: { fontSize: 15, color: 'rgba(255,255,255,0.92)', marginTop: 12, lineHeight: 22 },
  primaryBtn: {
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnDisabled: { opacity: 0.85 },
  primaryGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  primaryIcon: { marginRight: 10 },
  primaryBtnText: { color: 'white', fontSize: 17, fontWeight: '700' },
  undoImportBtn: {
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: 6,
  },
  undoImportText: {
    fontSize: 17,
    fontWeight: '700',
  },
  undoImportSub: {
    fontSize: 13,
    textAlign: 'center',
  },
  fioCard: { marginHorizontal: 20, marginTop: 16, padding: 18, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 10 },
  fioTitle: { fontSize: 17, fontWeight: '700' },
  fioSub: { fontSize: 13, lineHeight: 19 },
  fioInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  fioBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  fioBtnText: { color: 'white', fontWeight: '700', fontSize: 16 },
  transferHint: {
    marginHorizontal: 20,
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  transferHintText: { fontSize: 14, lineHeight: 20 },
  transferHintActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  transferHintBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  transferHintBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  suggestCard: {
    marginHorizontal: 20,
    marginTop: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  suggestTitle: { fontSize: 16, fontWeight: '800' },
  suggestBody: { fontSize: 13, lineHeight: 19 },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  suggestCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestCheckMark: { color: 'white', fontSize: 13, fontWeight: '800' },
  suggestRowText: { flex: 1, fontSize: 14, lineHeight: 20 },
  suggestActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  suggestPrimary: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  suggestPrimaryText: { color: 'white', fontWeight: '700', fontSize: 14 },
  promptOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  promptCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 28,
    gap: 10,
    maxHeight: '92%',
  },
  promptTitle: { fontSize: 20, fontWeight: '800' },
  promptBody: { fontSize: 15, lineHeight: 22 },
  promptWarn: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  fieldLabel: { fontSize: 13, marginTop: 4 },
  promptInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  addDraftBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  promptPrimary: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  promptPrimaryText: { color: 'white', fontWeight: '700', fontSize: 16 },
  promptSkip: { paddingVertical: 12 },
});
