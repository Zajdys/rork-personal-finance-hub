import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Alert,
  ActivityIndicator,
  InteractionManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { X, ChevronDown, Check } from 'lucide-react-native';
import type { Transaction } from '@/store/finance-store';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/store/finance-store';
import type { ParsedImportRow } from '@/lib/bank-statement-parser';
import { classifyImportRow, buildCounterpartyNameByAccount, withBackfilledCounterpartyName } from '@/lib/classify-import-category';
import { mapClassifySourceToCategorySource, type CategorySource } from '@/lib/categorization';
import { transactionDateYmd, ymdToLocalDateNoon } from '@/lib/transaction-date';
import { getAuthUserId } from '@/lib/supabase-transactions';
import { applyFxToImportRows } from '@/lib/cnb-exchange-rates';
import { randomUUID } from '@/lib/random-uuid';
import { fetchUserCategoryRules, upsertUserCategoryRule } from '@/lib/user-category-rules';
import { fetchMerchantCategoriesMap } from '@/lib/merchant-categories';
import { useFinanceStore } from '@/store/finance-store';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { getAllOwnerAccountNumbers } from '@/lib/owner-accounts-storage';
import { isOwnCounterpartyAccount } from '@/utils/normalizeAccount';
import { pluralPolozka, pluralTransakce } from '@/lib/plural-cs';
import { useAsyncAction } from '@/hooks/use-async-action';

const { width, height } = Dimensions.get('window');

export type PreviewRow = ParsedImportRow & {
  category: string;
  /** Chyba přepočtu ČNB — řádek nelze importovat. */
  fxError?: string | null;
};

export type ImportConfirmHelpers = {
  /** Aktualizuje text fáze v modalu a počká na vykreslení UI. */
  setProgress: (message: string) => Promise<void>;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  bankLabel: string;
  rows: ParsedImportRow[];
  /** Volitelná varování nad seznamem (např. chybějící jméno v profilu). */
  previewWarnings?: string[];
  onConfirm: (
    transactions: Transaction[],
    helpers: ImportConfirmHelpers,
  ) => void | Promise<void>;
  /** Shared phase text (parent importProgress) — shown under the confirm button. */
  importProgress?: string | null;
  /** Multi-file progress bar: completed files / total. */
  fileProgress?: { done: number; total: number } | null;
};

/** Počká, až React stihne commitnout setState a vykreslit spinner (RN JS thread). */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          InteractionManager.runAfterInteractions(() => {
            setTimeout(resolve, 32);
          });
        });
      });
    }, 0);
  });
}

function categoriesForType(type: 'income' | 'expense', isRefund?: boolean): string[] {
  if (isRefund || type === 'expense') return Object.keys(EXPENSE_CATEGORIES);
  return Object.keys(INCOME_CATEGORIES);
}

function isForeignPreviewRow(row: {
  originalCurrency?: string | null;
  originalAmount?: number | null;
}): boolean {
  const ccy = (row.originalCurrency ?? '').trim().toUpperCase();
  return Boolean(ccy && ccy !== 'CZK' && row.originalAmount != null && Number.isFinite(row.originalAmount));
}

export default function BankStatementImportModal({
  visible,
  onClose,
  bankLabel,
  rows: initialRows,
  previewWarnings = [],
  onConfirm,
  importProgress = null,
  fileProgress = null,
}: Props) {
  const { colors } = useTheme();
  const { t, language } = useLanguageStore();
  const lang = language === 'en' ? 'en' : 'cs';
  const dateLocale = language === 'en' ? 'en-US' : 'cs-CZ';
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [initialCategories, setInitialCategories] = useState<string[]>([]);
  const [picker, setPicker] = useState<{ index: number } | null>(null);
  const [preparing, setPreparing] = useState(false);
  /** true = chybí kurz ČNB → import zakázán */
  const [fxBlocked, setFxBlocked] = useState(false);
  /** Lokální fáze během confirm — jistota, že UI se překreslí před těžkou prací. */
  const [localProgress, setLocalProgress] = useState<string | null>(null);

  const existingTxs = useFinanceStore((s) => s.transactions);
  const existingTxsRef = useRef(existingTxs);
  existingTxsRef.current = existingTxs;

  useEffect(() => {
    if (!visible) {
      setLocalProgress(null);
      setFxBlocked(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !initialRows.length) return;

    let cancelled = false;
    setPreparing(true);
    setFxBlocked(false);
    void (async () => {
      try {
        console.log('[import] krok 4b modal prepare rows', { count: initialRows.length });
        const userId = await getAuthUserId();
        const [userRules, globalCache] = await Promise.all([
          userId ? fetchUserCategoryRules(userId) : Promise.resolve(new Map()),
          fetchMerchantCategoriesMap(),
        ]);
        // Vlastní účty ze store (DB → loadOwnerBanksFromSupabase při startu).
        let ownerBanks = useFinanceStore.getState().ownerBanks;
        if (ownerBanks.length === 0) {
          await useFinanceStore.getState().loadOwnerBanksFromSupabase();
          ownerBanks = useFinanceStore.getState().ownerBanks;
        }
        const ownerAccounts = getAllOwnerAccountNumbers(ownerBanks);

        if (cancelled) return;

        const existingSnapshot = existingTxsRef.current;
        const nameSources = [
          ...initialRows.map((r) => ({
            counterpartyAccount: r.counterpartyAccount,
            counterpartyName: r.counterpartyName,
          })),
          ...existingSnapshot.map((t) => ({
            counterpartyAccount: t.counterpartyAccount,
            counterpartyName: t.counterpartyName,
          })),
        ];
        const namesByAccount = buildCounterpartyNameByAccount(nameSources);

        const rows: PreviewRow[] = initialRows.map((r) => {
          const rowWithTitle = r as ParsedImportRow & { title?: string };
          const input = withBackfilledCounterpartyName(
            {
              type: r.type,
              category: r.category,
              description: r.description,
              title: rowWithTitle.title,
              amount: r.amount,
              counterpartyAccount: r.counterpartyAccount,
              counterpartyName: r.counterpartyName,
              merchantRaw: r.description,
              isRefund: r.isRefund,
            },
            namesByAccount,
          );

          // Stejně jako při ukládání: vlastní účet → Převod (v náhledu, ne až po importu)
          const isSelfTransfer = isOwnCounterpartyAccount(
            input.counterpartyAccount,
            ownerAccounts,
          );
          if (isSelfTransfer) {
            return {
              ...r,
              category: 'Převod',
              description: 'Převod mezi účty',
              counterpartyName: input.counterpartyName ?? r.counterpartyName,
              counterpartyAccount: input.counterpartyAccount ?? r.counterpartyAccount,
              categorySource: 'transfer' as CategorySource,
              merchantKey: null,
            };
          }

          const classified = classifyImportRow(
            {
              ...input,
              category: input.category === 'Převod' ? 'Převod' : input.category,
            },
            {
              userRules,
              globalCache,
            },
          );
          return {
            ...r,
            category: classified.category,
            description: classified.description || r.description,
            counterpartyName:
              classified.counterpartyName ?? input.counterpartyName ?? r.counterpartyName,
            counterpartyAccount: input.counterpartyAccount ?? r.counterpartyAccount,
            categorySource: mapClassifySourceToCategorySource(classified.source),
            merchantKey: classified.merchantKey,
          };
        });

        if (cancelled) return;

        // Přepočet ČNB stejně jako při uložení — náhled ukáže CZK + původní měnu
        const needsFx = rows.some(
          (r) =>
            r.originalCurrency &&
            r.originalCurrency.toUpperCase() !== 'CZK' &&
            r.originalAmount != null,
        );
        if (needsFx) {
          setLocalProgress(t('bankImportProgressFx'));
          try {
            const fxRows = await applyFxToImportRows(rows);
            if (cancelled) return;
            setPreviewRows(fxRows.map((r) => ({ ...r, fxError: null })));
            setInitialCategories(fxRows.map((r) => r.category));
            setFxBlocked(false);
          } catch (fxErr) {
            console.error('[import] krok 4b FX failed', fxErr);
            if (cancelled) return;
            const msg = t('bankImportFxFailed');
            setPreviewRows(
              rows.map((r) => ({
                ...r,
                fxError:
                  r.originalCurrency && r.originalCurrency.toUpperCase() !== 'CZK'
                    ? msg
                    : null,
              })),
            );
            setInitialCategories(rows.map((r) => r.category));
            setFxBlocked(true);
          } finally {
            if (!cancelled) setLocalProgress(null);
          }
        } else {
          setPreviewRows(rows);
          setInitialCategories(rows.map((r) => r.category));
          setFxBlocked(false);
        }
        console.log('[import] krok 4b modal rows ready', { count: rows.length });
      } catch (e) {
        console.error('[import] krok 4b modal prepare failed', e);
        Alert.alert(t('error'), e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setPreparing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, initialRows, t]);

  const cardBg = colors.card;
  const textPrimary = colors.text;
  const textSecondary = colors.textSecondary;
  const borderColor = colors.border;

  const updateCategory = useCallback((index: number, category: string) => {
    setPreviewRows((prev) => {
      const next = [...prev];
      const row = next[index];
      if (!row) return prev;
      next[index] = { ...row, category, categorySource: 'user' as CategorySource };
      return next;
    });
    setPicker(null);
  }, []);

  const { run: handleConfirm, isRunning: isImporting } = useAsyncAction(async () => {
    if (preparing) {
      console.log('[import] modal confirm skipped — preparing');
      return;
    }
    if (fxBlocked || previewRows.some((r) => r.fxError)) {
      Alert.alert(t('error'), t('bankImportFxBlocked'));
      return;
    }
    setPicker(null);
    const savingMsg = t('bankImportProgressSaving', {
      count: previewRows.length,
      transactionsWord: pluralTransakce(previewRows.length, lang),
    });
    setLocalProgress(savingMsg);

    // Nechat React překreslit spinner / disabled — jinak JS thread zablokuje paint
    await yieldToUi();

    try {
      // Cizí měny → CZK kurzem ČNB (idempotentní, pokud už přepočteno v náhledu)
      const fxRows = await applyFxToImportRows(previewRows);

      const transactions: Transaction[] = fxRows.map((r) => {
        const rowWithTitle = r as PreviewRow & { title?: string };
        const baseTitle =
          (r.description || rowWithTitle.title || r.counterpartyName || '').trim() ||
          t('transactionUntitled');
        const title =
          baseTitle.length > 200 ? `${baseTitle.slice(0, 197)}…` : baseTitle;
        return {
          id: randomUUID(),
          type: r.type,
          amount: r.amount,
          title,
          description: r.description || title,
          category: r.category,
          categorySource: (r as PreviewRow & { categorySource?: CategorySource }).categorySource,
          merchantKey:
            (r as PreviewRow & { merchantKey?: string | null }).merchantKey ?? null,
          date: r.date,
          bookingDate: r.bookingDate ?? null,
          source: (r as ParsedImportRow & { source?: string }).source,
          bankTransactionId: r.bankTransactionId,
          counterpartyAccount: r.counterpartyAccount,
          counterpartyName: r.counterpartyName,
          isRefund: r.isRefund === true,
          originalAmount: r.originalAmount ?? null,
          originalCurrency: r.originalCurrency ?? null,
          exchangeRate: r.exchangeRate ?? null,
        };
      });

      const userId = await getAuthUserId();
      if (userId) {
        const merchantErrors: string[] = [];
        await Promise.all(
          fxRows.map(async (row, index) => {
            if (row.category === 'Převod') return;
            if (!(row.type === 'expense' || row.isRefund)) return;
            if (row.category === initialCategories[index]) return;

            const rowWithTitle = row as PreviewRow & { title?: string };
            const desc = [row.description, rowWithTitle.title].filter(Boolean).join('\n');
            const { error } = await upsertUserCategoryRule(userId, desc, row.category);
            if (error) merchantErrors.push(error.message);
          }),
        );
        if (merchantErrors.length) {
          Alert.alert(t('error'), merchantErrors[0]!);
        }
      }

      const helpers: ImportConfirmHelpers = {
        setProgress: async (message: string) => {
          setLocalProgress(message);
          await yieldToUi();
        },
      };

      console.log('[import] krok 5 modal onConfirm → parent', { count: transactions.length });
      await Promise.resolve(onConfirm(transactions, helpers));
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        /* haptics optional */
      }
      onClose();
    } catch (e) {
      console.error('[import] krok 5 modal onConfirm failed', e);
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {
        /* haptics optional */
      }
      if (
        !(
          e instanceof Error &&
          (e.message === 'not_authenticated' ||
            e.message === 'insert_empty' ||
            e.message === 'import_failed_shown')
        )
      ) {
        Alert.alert(t('error'), e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLocalProgress(null);
    }
  });

  const requestClose = useCallback(() => {
    if (isImporting) return;
    onClose();
  }, [onClose, isImporting]);

  const pickerCategories = useMemo(() => {
    if (picker === null) return [];
    const row = previewRows[picker.index];
    if (!row) return [];
    return categoriesForType(row.type, row.isRefund);
  }, [picker, previewRows]);

  const busy = isImporting || preparing;
  const progressText =
    localProgress ||
    importProgress ||
    (preparing ? t('bankImportProgressCategorizing') : null) ||
    (isImporting ? t('bankImportConfirmImporting') : null);
  const showFileBar = !!fileProgress && fileProgress.total > 1;
  const fileBarRatio =
    showFileBar && fileProgress
      ? Math.min(1, Math.max(0, fileProgress.done / fileProgress.total))
      : 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={requestClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background, maxHeight: height * 0.92 }]}>
          <LinearGradient colors={['#667eea', '#764ba2']} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={styles.headerRow}>
              <View style={styles.headerTextWrap}>
                <Text style={styles.headerTitle}>{t('bankImportModalTitle')}</Text>
                <Text style={styles.headerSub}>{bankLabel}</Text>
              </View>
              <TouchableOpacity
                onPress={requestClose}
                style={[styles.closeBtn, (isImporting || preparing) && styles.disabledHit]}
                hitSlop={12}
                disabled={isImporting || preparing}
              >
                <X color="white" size={24} />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          <Text style={[styles.hint, { color: textSecondary }]}>
            {t('bankImportPreviewHint', {
              count: previewRows.length || initialRows.length,
              itemsWord: pluralPolozka(previewRows.length || initialRows.length, lang),
            })}
          </Text>
          {previewWarnings.length > 0
            ? previewWarnings.map((w, i) => (
                <Text
                  key={`pw-${i}`}
                  style={[styles.hint, styles.previewWarning, { color: colors.warning }]}
                >
                  {w}
                </Text>
              ))
            : null}

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {(previewRows.length ? previewRows : initialRows).map((row, index) => {
              const preview = row as PreviewRow;
              const foreign = isForeignPreviewRow(preview);
              const hasFxError = Boolean(preview.fxError);
              return (
              <View
                key={`${row.date}-${index}`}
                style={[styles.row, { backgroundColor: cardBg, borderColor }]}
              >
                <View style={styles.rowTop}>
                  <Text style={[styles.rowDate, { color: textSecondary }]}>
                    {ymdToLocalDateNoon(transactionDateYmd(row.date)).toLocaleDateString(dateLocale)}
                  </Text>
                  <View style={styles.rowAmountWrap}>
                    {hasFxError ? (
                      <>
                        <Text style={[styles.rowAmount, { color: '#EF4444' }]}>
                          {row.type === 'income' ? '+' : '−'}
                          {Number(preview.originalAmount ?? row.amount).toLocaleString(dateLocale, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          {(preview.originalCurrency || '').toUpperCase()}
                        </Text>
                        <Text style={[styles.rowOriginal, { color: '#EF4444' }]}>
                          {preview.fxError}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text
                          style={[
                            styles.rowAmount,
                            { color: row.type === 'income' ? '#10B981' : '#EF4444' },
                          ]}
                        >
                          {row.type === 'income' ? '+' : '−'}
                          {row.amount.toLocaleString(dateLocale, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })}{' '}
                          Kč
                        </Text>
                        {foreign ? (
                          <Text style={[styles.rowOriginal, { color: textSecondary }]}>
                            {Number(preview.originalAmount).toLocaleString(dateLocale, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            {(preview.originalCurrency || '').toUpperCase()}
                          </Text>
                        ) : null}
                      </>
                    )}
                  </View>
                </View>
                <Text style={[styles.rowDesc, { color: textPrimary }]} numberOfLines={3}>
                  {row.description}
                </Text>
                <TouchableOpacity
                  style={[styles.catButton, { borderColor }, busy && styles.disabledHit]}
                  onPress={() => !busy && setPicker({ index })}
                  activeOpacity={0.7}
                  disabled={busy}
                >
                  <Text style={[styles.catButtonLabel, { color: textSecondary }]}>{t('category')}</Text>
                  <View style={styles.catButtonRight}>
                    <Text style={[styles.catValue, { color: textPrimary }]} numberOfLines={1}>
                      {row.category}
                    </Text>
                    <ChevronDown color={textSecondary} size={18} style={{ marginLeft: 6 }} />
                  </View>
                </TouchableOpacity>
              </View>
              );
            })}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: borderColor }]}>
            <View style={styles.footerRow}>
              <TouchableOpacity
                onPress={requestClose}
                style={[styles.cancelOuter, (isImporting || preparing) && styles.disabledHit]}
                disabled={isImporting || preparing}
              >
                <Text style={[styles.cancelText, { color: textSecondary }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  void handleConfirm();
                }}
                style={[styles.confirmOuter, isImporting && styles.disabledHit]}
                disabled={isImporting || preparing || previewRows.length === 0 || fxBlocked}
                activeOpacity={isImporting ? 1 : 0.9}
              >
                <LinearGradient
                  colors={['#10B981', '#059669']}
                  style={styles.confirmGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  {isImporting ? (
                    <>
                      <ActivityIndicator color="white" size="small" />
                      <Text style={styles.confirmText}>{t('bankImportConfirmImporting')}</Text>
                    </>
                  ) : (
                    <>
                      <Check color="white" size={20} />
                      <Text style={styles.confirmText}>
                        {t('bankImportConfirmImport', {
                          count: previewRows.length || initialRows.length,
                        })}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
            {(progressText || showFileBar) && (
              <View style={styles.progressBlock} accessibilityLiveRegion="polite">
                {showFileBar && fileProgress ? (
                  <View style={[styles.progressTrack, { backgroundColor: borderColor }]}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.round(fileBarRatio * 100)}%`,
                          backgroundColor: colors.primary,
                        },
                      ]}
                    />
                  </View>
                ) : null}
                {progressText ? (
                  <Text style={[styles.progressText, { color: textSecondary }]}>{progressText}</Text>
                ) : null}
              </View>
            )}
          </View>

          {picker !== null && !busy ? (
            <Pressable style={styles.pickerOverlayAbs} onPress={() => setPicker(null)}>
              <Pressable
                style={[styles.pickerSheet, { backgroundColor: colors.surface }]}
                onPress={(e) => e.stopPropagation()}
              >
                <Text style={[styles.pickerTitle, { color: textPrimary }]}>{t('selectCategory')}</Text>
                <ScrollView style={{ maxHeight: height * 0.45 }} keyboardShouldPersistTaps="handled">
                  {pickerCategories.map((cat) => {
                    const active = previewRows[picker.index]?.category === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.pickerRow, { borderBottomColor: borderColor }]}
                        onPress={() => picker !== null && updateCategory(picker.index, cat)}
                      >
                        <Text style={[styles.pickerRowText, { color: textPrimary }]}>{cat}</Text>
                        {active ? <Check color="#10B981" size={20} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </Pressable>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    position: 'relative',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    paddingBottom: 28,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
  },
  headerSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  closeBtn: {
    padding: 4,
  },
  disabledHit: {
    opacity: 0.4,
  },
  hint: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  previewWarning: {
    paddingTop: 0,
    fontWeight: '600',
  },
  list: {
    maxHeight: height * 0.55,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  row: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  rowDate: {
    fontSize: 12,
  },
  rowAmount: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  rowAmountWrap: {
    alignItems: 'flex-end',
    flexShrink: 1,
    marginLeft: 8,
  },
  rowOriginal: {
    fontSize: 12,
    marginTop: 2,
    textAlign: 'right',
  },
  rowDesc: {
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  catButton: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  catButtonLabel: {
    fontSize: 12,
  },
  catButtonRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    marginLeft: 8,
  },
  catValue: {
    fontSize: 14,
    fontWeight: '600',
    maxWidth: width * 0.45,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  progressBlock: {
    gap: 8,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cancelOuter: {
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  confirmOuter: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  confirmGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  confirmText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  pickerOverlayAbs: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerRowText: {
    fontSize: 16,
  },
});
