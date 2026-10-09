import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Platform,
  ToastAndroid,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { StackHeaderBackButton } from '@/components/BackButton';
import { AsyncButton } from '@/components/AsyncButton';
import { BankLogo } from '@/components/BankLogo';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import { useAsyncAction } from '@/hooks/use-async-action';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { useFinanceStore } from '@/store/finance-store';
import { useSettingsStore } from '@/store/settings-store';
import { useAuth } from '@/store/auth-store';
import {
  serializeOwnerBanksForStorage,
  type OwnerBankStored,
  type OwnerBankAccountStored,
} from '@/lib/owner-accounts-storage';
import {
  OTHER_BANK_NAME,
  previewBankNameFromAccountNumber,
  resolveOwnerBankName,
} from '@/lib/cz-bank-codes';
import { syncOwnerBankAccountsRemote } from '@/lib/owner-bank-accounts-supabase';
import {
  accountLabelsFromOwnerBanks,
  buildOwnerNames,
  resolveOwnerAccountTitle,
} from '@/lib/owner-names';
import { randomUUID } from '@/lib/random-uuid';
import {
  deleteImportBatchRemote,
  fetchImportBatchSummaries,
  type ImportBatchSummary,
} from '@/lib/import-batches';
import { pluralTransakce, pluralPrevod } from '@/lib/plural-cs';
import { getAuthUserId, reclassifyOwnAccountTransfersRemote } from '@/lib/supabase-transactions';
import { BANK_SYNC_ENABLED } from '@/constants/feature-flags';
import * as WebBrowser from 'expo-web-browser';
import {
  bankComplete,
  bankConnectionDisplayName,
  bankDisconnect,
  bankLink,
  bankSync,
  daysUntilConsentExpiry,
  fetchBankConnections,
  KONTOMATIK_AUTH_RETURN_URL,
  parseRedirectionIdFromReturnUrl,
  type BankConnectionRow,
} from '@/lib/kontomatik-bank-api';

WebBrowser.maybeCompleteAuthSession();

type AccountModalMode = 'add' | 'edit';

type AccountModalState = {
  mode: AccountModalMode;
  accountId: string | null;
  number: string;
  label: string;
};

function upsertAccountIntoBanks(
  banks: OwnerBankStored[],
  account: OwnerBankAccountStored,
  previousId: string | null,
): OwnerBankStored[] {
  const bankName = resolveOwnerBankName(account.number, null);
  let next = banks.map((b) => ({
    ...b,
    accounts: b.accounts.filter((a) => a.id !== account.id && a.id !== previousId),
  }));
  next = next.filter((b) => b.accounts.length > 0 || b.bankName === bankName);

  let target = next.find((b) => b.bankName === bankName || b.id === bankName);
  if (!target) {
    target = { id: bankName, bankName, accounts: [] };
    next = [...next, target];
  }
  return next.map((b) =>
    b.id === target!.id || b.bankName === target!.bankName
      ? { ...b, accounts: [...b.accounts, account] }
      : b,
  );
}

function removeAccountFromBanks(banks: OwnerBankStored[], accountId: string): OwnerBankStored[] {
  return banks
    .map((b) => ({ ...b, accounts: b.accounts.filter((a) => a.id !== accountId) }))
    .filter((b) => b.accounts.length > 0);
}

export default function BankAccountsScreen() {
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguageStore();
  const { user } = useAuth();
  const userProfile = useSettingsStore((s) => s.userProfile);
  const deleteTransactions = useFinanceStore((s) => s.deleteTransactions);
  const loadTransactionsFromSupabase = useFinanceStore((s) => s.loadTransactionsFromSupabase);
  const loadOwnerBanksFromSupabase = useFinanceStore((s) => s.loadOwnerBanksFromSupabase);
  const replaceOwnerBanks = useFinanceStore((s) => s.replaceOwnerBanks);
  const storeOwnerBanks = useFinanceStore((s) => s.ownerBanks);
  const shadowSoft = isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.08)';
  const monthLocale = language === 'cs' ? 'cs-CZ' : 'en-US';
  const [ownerBanks, setOwnerBanks] = useState<OwnerBankStored[]>([]);
  const [accountModal, setAccountModal] = useState<AccountModalState | null>(null);
  const [importBatches, setImportBatches] = useState<ImportBatchSummary[]>([]);
  const [importBatchesLoading, setImportBatchesLoading] = useState(true);
  const [deletingImportKey, setDeletingImportKey] = useState<string | null>(null);
  const [bankConnections, setBankConnections] = useState<BankConnectionRow[]>([]);
  const [bankConnectionsLoading, setBankConnectionsLoading] = useState(false);
  const [bankSyncBusyId, setBankSyncBusyId] = useState<string | null>(null);
  const [bankConnectBusy, setBankConnectBusy] = useState(false);

  const ownerNames = useMemo(
    () =>
      buildOwnerNames({
        profileFirstName: userProfile.firstName,
        profileLastName: userProfile.lastName,
        authDisplayName: user?.name,
        accountLabels: accountLabelsFromOwnerBanks(ownerBanks),
      }),
    [userProfile.firstName, userProfile.lastName, user?.name, ownerBanks],
  );

  const liveBankName = useMemo(() => {
    if (!accountModal) return null;
    const preview = previewBankNameFromAccountNumber(accountModal.number);
    if (!preview) return null;
    if (preview === OTHER_BANK_NAME) return t('bankAccountsOtherBank');
    return preview;
  }, [accountModal, t]);

  const loadImportBatches = useCallback(async () => {
    setImportBatchesLoading(true);
    const userId = await getAuthUserId();
    if (!userId) {
      setImportBatches([]);
      setImportBatchesLoading(false);
      return;
    }
    const { batches, error } = await fetchImportBatchSummaries(userId, monthLocale);
    if (error) {
      Alert.alert(t('error'), error.message);
      setImportBatches([]);
    } else {
      setImportBatches(batches);
    }
    setImportBatchesLoading(false);
  }, [monthLocale, t]);

  const loadBankConnections = useCallback(async () => {
    if (!BANK_SYNC_ENABLED) return;
    setBankConnectionsLoading(true);
    const { connections, error } = await fetchBankConnections();
    if (error) {
      console.warn('[bank-accounts] bank_connections', error.message);
      setBankConnections([]);
    } else {
      setBankConnections(connections.filter((c) => c.status !== 'revoked'));
    }
    setBankConnectionsLoading(false);
  }, []);

  useEffect(() => {
    setOwnerBanks(storeOwnerBanks);
  }, [storeOwnerBanks]);

  useFocusRefresh(
    useCallback(async () => {
      await loadOwnerBanksFromSupabase();
      await loadImportBatches();
      await loadBankConnections();
    }, [loadImportBatches, loadOwnerBanksFromSupabase, loadBankConnections]),
  );

  const statusLabel = useCallback(
    (status: string) => {
      switch (status) {
        case 'active':
          return t('bankSyncStatusActive');
        case 'pending':
          return t('bankSyncStatusPending');
        case 'error':
          return t('bankSyncStatusError');
        case 'expired':
          return t('bankSyncStatusExpired');
        case 'revoked':
          return t('bankSyncStatusRevoked');
        default:
          return status;
      }
    },
    [t],
  );

  const { run: runConnectBank } = useAsyncAction(async () => {
    setBankConnectBusy(true);
    try {
      const { url, redirectionId: linkId } = await bankLink();
      const authResult = await WebBrowser.openAuthSessionAsync(
        url,
        KONTOMATIK_AUTH_RETURN_URL,
      );
      if (authResult.type !== 'success') {
        Alert.alert(t('error'), t('bankSyncAuthCancelled'));
        return;
      }
      const redirectionId =
        parseRedirectionIdFromReturnUrl(authResult.url) || linkId;
      if (!redirectionId) {
        Alert.alert(t('error'), t('bankSyncMissingRedirectionId'));
        return;
      }
      const result = await bankComplete(redirectionId);
      showToast(
        t('bankSyncConnectSuccess', {
          inserted: result.inserted,
          enriched: result.enriched,
        }),
      );
      await loadBankConnections();
      void loadTransactionsFromSupabase();
    } finally {
      setBankConnectBusy(false);
    }
  }, {
    onError: (e) => {
      Alert.alert(t('error'), e instanceof Error ? e.message : String(e));
    },
  });

  const { run: runSyncConnection } = useAsyncAction(async (connectionId: string) => {
    setBankSyncBusyId(connectionId);
    try {
      const result = await bankSync(connectionId);
      showToast(
        t('bankSyncSyncSuccess', {
          inserted: result.inserted,
          enriched: result.enriched,
        }),
      );
      await loadBankConnections();
      void loadTransactionsFromSupabase();
    } finally {
      setBankSyncBusyId(null);
    }
  }, {
    onError: (e) => {
      Alert.alert(t('error'), e instanceof Error ? e.message : String(e));
      void loadBankConnections();
    },
  });

  const { run: runDisconnectConnection } = useAsyncAction(async (connectionId: string) => {
    setBankSyncBusyId(connectionId);
    try {
      await bankDisconnect(connectionId);
      await loadBankConnections();
    } finally {
      setBankSyncBusyId(null);
    }
  }, {
    onError: (e) => {
      Alert.alert(t('error'), e instanceof Error ? e.message : String(e));
    },
  });

  const confirmDisconnect = (row: BankConnectionRow) => {
    Alert.alert(
      t('bankSyncDisconnect'),
      t('bankSyncDisconnectConfirm', { bank: bankConnectionDisplayName(row) }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('bankSyncDisconnect'),
          style: 'destructive',
          onPress: () => {
            void runDisconnectConnection(row.id);
          },
        },
      ],
    );
  };

  const showToast = (message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }
    Alert.alert(message);
  };

  const persistBanks = useCallback(
    async (nextBanks: OwnerBankStored[], toastKind: 'saved' | 'deleted') => {
      const userId = await getAuthUserId();
      if (!userId) {
        Alert.alert(t('error'), t('bankImportNotSignedIn'));
        return;
      }
      const payload = serializeOwnerBanksForStorage(nextBanks);
      const { banks: saved, error: syncErr } = await syncOwnerBankAccountsRemote(userId, payload);
      if (syncErr) throw syncErr;
      setOwnerBanks(saved);
      replaceOwnerBanks(saved);

      let reclassified = 0;
      const { updatedCount, error: rpcErr } = await reclassifyOwnAccountTransfersRemote();
      if (rpcErr) {
        console.warn('[bank-accounts] reclassify own transfers', rpcErr.message);
      } else {
        reclassified = updatedCount;
      }
      if (reclassified > 0) {
        void loadTransactionsFromSupabase();
      }

      const base =
        toastKind === 'deleted' ? t('bankAccountsAccountDeleted') : t('bankAccountsAccountSaved');
      const msg =
        reclassified > 0
          ? `${base}. ${t('bankAccountsReclassifiedToast', {
              count: reclassified,
              transfersWord: pluralPrevod(reclassified, language === 'en' ? 'en' : 'cs'),
            })}`
          : base;
      showToast(msg);
    },
    [t, language, replaceOwnerBanks, loadTransactionsFromSupabase],
  );

  const openAddAccountModal = () => {
    setAccountModal({ mode: 'add', accountId: null, number: '', label: '' });
  };

  const openEditAccountModal = (account: OwnerBankAccountStored) => {
    setAccountModal({
      mode: 'edit',
      accountId: account.id,
      number: account.number,
      label: account.label,
    });
  };

  const closeAccountModal = () => setAccountModal(null);

  const { run: saveAccountFromModal } = useAsyncAction(async () => {
    if (!accountModal) return;
    const num = accountModal.number.trim();
    if (!num) {
      Alert.alert(t('bankAccountsAccountAlertTitle'), t('bankAccountsEnterAccountNumber'));
      return;
    }
    const account: OwnerBankAccountStored = {
      id: accountModal.accountId ?? randomUUID(),
      label: accountModal.label.trim(),
      number: num,
    };
    const next = upsertAccountIntoBanks(ownerBanks, account, accountModal.accountId);
    await persistBanks(next, 'saved');
    closeAccountModal();
  }, {
    onError: (e) => {
      Alert.alert(t('error'), e instanceof Error ? e.message : t('bankAccountsAccountsSaveFailed'));
    },
  });

  const { run: deleteAccountFromModal } = useAsyncAction(async () => {
    if (!accountModal?.accountId) return;
    const next = removeAccountFromBanks(ownerBanks, accountModal.accountId);
    await persistBanks(next, 'deleted');
    closeAccountModal();
  }, {
    onError: (e) => {
      Alert.alert(t('error'), e instanceof Error ? e.message : t('bankAccountsAccountsSaveFailed'));
    },
  });

  const confirmDeleteAccount = () => {
    Alert.alert(t('bankAccountsAccountAlertTitle'), t('bankAccountsDeleteAccountConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void deleteAccountFromModal();
        },
      },
    ]);
  };

  const formatImportedAt = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(monthLocale, {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const { run: runDeleteImportBatch, isRunning: isDeletingImport } = useAsyncAction(
    async (batch: ImportBatchSummary) => {
      const userId = await getAuthUserId();
      if (!userId) {
        Alert.alert(t('error'), t('bankImportNotSignedIn'));
        return;
      }
      setDeletingImportKey(batch.key);
      try {
        const { error, deletedIds } = await deleteImportBatchRemote(userId, batch.deleteTarget);
        if (error) {
          Alert.alert(t('error'), error.message);
          return;
        }
        if (deletedIds.length > 0) {
          deleteTransactions(deletedIds);
        }
        showToast(
          t('bankAccountsDeleteImportSuccess', {
            count: deletedIds.length,
            transactionsWord: pluralTransakce(deletedIds.length, language === 'en' ? 'en' : 'cs'),
          }),
        );
        await loadImportBatches();
      } finally {
        setDeletingImportKey(null);
      }
    },
  );

  const confirmDeleteImportBatch = (batch: ImportBatchSummary) => {
    Alert.alert(
      t('bankAccountsDeleteImport'),
      t('bankAccountsDeleteImportConfirm', {
        count: batch.transactionCount,
        transactionsWord: pluralTransakce(batch.transactionCount, language === 'en' ? 'en' : 'cs'),
        bank: batch.bankLabel,
        period: batch.periodLabel,
      }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            void runDeleteImportBatch(batch);
          },
        },
      ],
    );
  };

  const accountTitle = (acc: OwnerBankAccountStored) => {
    const r = resolveOwnerAccountTitle(acc.label, acc.number, ownerNames);
    if (r.useFallback) {
      return t('bankAccountsAccountFallbackTitle', { last4: r.last4 });
    }
    return r.label;
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t('bankAccountsTitle'),
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.primary,
          headerLeft: ({ tintColor }) => (
            <StackHeaderBackButton tintColor={tintColor ?? colors.primary} />
          ),
          headerTitleStyle: { fontWeight: '700', color: colors.text },
        }}
      />

      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          style={[styles.header, { shadowColor: shadowSoft }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('bankAccountsTitle')}</Text>
          <Text style={[styles.headerSubtitle, { color: colors.text, opacity: 0.92 }]}>
            {t('bankAccountsSubtitle')}
          </Text>
        </LinearGradient>

        <View style={[styles.content, { backgroundColor: colors.background }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t('bankAccountsMyAccounts')}
          </Text>
          <View style={[styles.accountsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {ownerBanks.length === 0 ? (
              <Text style={[styles.settingSubtitle, { color: colors.textSecondary, marginBottom: 12 }]}>
                {t('bankAccountsEmptyBanks')}
              </Text>
            ) : null}
            {ownerBanks.map((bank, bankIndex) => (
              <View key={bank.id} style={bankIndex > 0 ? { marginTop: 20 } : undefined}>
                <View style={styles.bankTitleRow}>
                  <View style={styles.bankTitleLeft}>
                    <BankLogo
                      bankName={bank.bankName === OTHER_BANK_NAME ? t('bankAccountsOtherBank') : bank.bankName}
                      accountNumber={bank.accounts[0]?.number}
                      size={36}
                    />
                    <Text style={[styles.bankTitle, { color: colors.text }]}>
                      {bank.bankName === OTHER_BANK_NAME ? t('bankAccountsOtherBank') : bank.bankName}
                    </Text>
                  </View>
                </View>
                {bank.accounts.map((acc, accIndex) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.accountLineRow, accIndex > 0 ? styles.accountLineRowBorder : null]}
                    onPress={() => openEditAccountModal(acc)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.accountLineText}>
                      <Text style={[styles.accountLabel, { color: colors.text }]}>
                        {accountTitle(acc)}
                      </Text>
                      <Text style={[styles.accountNumber, { color: colors.textSecondary }]}>
                        {acc.number}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ))}

            <TouchableOpacity
              style={[styles.addInlineBtn, { borderColor: colors.primary, marginTop: ownerBanks.length ? 16 : 0 }]}
              onPress={openAddAccountModal}
              activeOpacity={0.85}
            >
              <Text style={[styles.addInlineBtnText, { color: colors.primary }]}>
                {t('bankAccountsAddAccount')}
              </Text>
            </TouchableOpacity>
          </View>

          {BANK_SYNC_ENABLED ? (
            <>
              <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />
              <Text style={[styles.sectionTitle, styles.importsSectionTitle, { color: colors.text }]}>
                {t('bankSyncSectionTitle')}
              </Text>
              <View
                style={[
                  styles.accountsCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                {bankConnectionsLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
                ) : bankConnections.length === 0 ? (
                  <Text
                    style={[
                      styles.settingSubtitle,
                      { color: colors.textSecondary, marginBottom: 12 },
                    ]}
                  >
                    {t('bankSyncEmpty')}
                  </Text>
                ) : (
                  bankConnections.map((conn, idx) => {
                    const days = daysUntilConsentExpiry(conn.consent_expires_at);
                    const busy = bankSyncBusyId === conn.id;
                    return (
                      <View
                        key={conn.id}
                        style={idx > 0 ? { marginTop: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : undefined}
                      >
                        <Text style={[styles.bankTitle, { color: colors.text }]}>
                          {bankConnectionDisplayName(conn)}
                        </Text>
                        <Text style={[styles.importMeta, { color: colors.textSecondary }]}>
                          {t('bankSyncStatus', { status: statusLabel(conn.status) })}
                        </Text>
                        <Text style={[styles.importMeta, { color: colors.textSecondary }]}>
                          {conn.last_sync_at
                            ? t('bankSyncLastSync', { date: formatImportedAt(conn.last_sync_at) })
                            : t('bankSyncLastSyncNever')}
                        </Text>
                        {days != null ? (
                          <Text
                            style={[
                              styles.importMeta,
                              {
                                color:
                                  days <= 14
                                    ? '#DC2626'
                                    : colors.textSecondary,
                              },
                            ]}
                          >
                            {days < 0
                              ? t('bankSyncConsentExpired')
                              : days <= 14
                                ? t('bankSyncConsentSoon', { days })
                                : t('bankSyncConsentDays', { days })}
                          </Text>
                        ) : null}
                        {conn.last_error_message ? (
                          <Text style={[styles.importMeta, { color: '#DC2626' }]}>
                            {conn.last_error_message}
                          </Text>
                        ) : null}
                        <View style={styles.bankSyncActions}>
                          <TouchableOpacity
                            style={[
                              styles.addInlineBtn,
                              styles.bankSyncActionBtn,
                              { borderColor: colors.primary, opacity: busy ? 0.6 : 1 },
                            ]}
                            onPress={() => void runSyncConnection(conn.id)}
                            disabled={busy || bankConnectBusy || conn.status !== 'active'}
                            activeOpacity={0.85}
                          >
                            {busy ? (
                              <ActivityIndicator color={colors.primary} size="small" />
                            ) : (
                              <Text style={[styles.addInlineBtnText, { color: colors.primary }]}>
                                {t('bankSyncButton')}
                              </Text>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.dangerBtn,
                              styles.bankSyncActionBtn,
                              { backgroundColor: '#DC2626', opacity: busy ? 0.6 : 1 },
                            ]}
                            onPress={() => confirmDisconnect(conn)}
                            disabled={busy || bankConnectBusy}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.dangerBtnText}>{t('bankSyncDisconnect')}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
                <TouchableOpacity
                  style={[
                    styles.addInlineBtn,
                    {
                      borderColor: colors.primary,
                      marginTop: bankConnections.length ? 16 : 0,
                      opacity: bankConnectBusy ? 0.7 : 1,
                    },
                  ]}
                  onPress={() => void runConnectBank()}
                  disabled={bankConnectBusy || bankSyncBusyId != null}
                  activeOpacity={0.85}
                >
                  {bankConnectBusy ? (
                    <ActivityIndicator color={colors.primary} size="small" />
                  ) : (
                    <Text style={[styles.addInlineBtnText, { color: colors.primary }]}>
                      {t('bankSyncConnect')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

          <Text style={[styles.sectionTitle, styles.importsSectionTitle, { color: colors.text }]}>
            {t('bankAccountsImportHistory')}
          </Text>
          {importBatchesLoading ? (
            <View style={[styles.importsCard, styles.importsLoadingRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.importMeta, { color: colors.textSecondary, marginTop: 8 }]}>
                {t('bankAccountsImportLoading')}
              </Text>
            </View>
          ) : importBatches.length === 0 ? (
            <View style={[styles.importsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.importMeta, { color: colors.textSecondary }]}>
                {t('bankAccountsImportHistoryEmpty')}
              </Text>
            </View>
          ) : (
            importBatches.map((batch) => (
              <View
                key={batch.key}
                style={[styles.importBatchCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={[styles.importBatchBank, { color: colors.text }]}>{batch.bankLabel}</Text>
                <Text style={[styles.importBatchPeriod, { color: colors.text }]}>{batch.periodLabel}</Text>
                <Text style={[styles.importMeta, { color: colors.textSecondary }]}>
                  {t('bankAccountsImportCount', {
                    count: batch.transactionCount,
                    transactionsWord: pluralTransakce(
                      batch.transactionCount,
                      language === 'en' ? 'en' : 'cs',
                    ),
                  })}
                </Text>
                <Text style={[styles.importMeta, { color: colors.textSecondary }]}>
                  {t('bankAccountsImportedAt', { date: formatImportedAt(batch.importedAt) })}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.dangerBtn,
                    styles.importDeleteBtn,
                    { backgroundColor: '#DC2626', opacity: deletingImportKey === batch.key ? 0.7 : 1 },
                  ]}
                  onPress={() => confirmDeleteImportBatch(batch)}
                  disabled={isDeletingImport || deletingImportKey !== null}
                  activeOpacity={0.85}
                >
                  {deletingImportKey === batch.key ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.dangerBtnText}>{t('bankAccountsDeleteImport')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal
        visible={accountModal !== null}
        transparent
        animationType="fade"
        onRequestClose={closeAccountModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeAccountModal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable
              style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {accountModal?.mode === 'edit'
                  ? t('bankAccountsEditAccountModalTitle')
                  : t('bankAccountsAddAccountModalTitle')}
              </Text>

              <Text style={[styles.inputLabel, { color: colors.text }]}>
                {t('bankAccountsAccountNumberLabel')}
              </Text>
              <TextInput
                value={accountModal?.number ?? ''}
                onChangeText={(number) =>
                  setAccountModal((prev) => (prev ? { ...prev, number } : prev))
                }
                placeholder={t('bankAccountsAccountNumberPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.accountInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
              />

              {liveBankName ? (
                <View style={styles.liveBankRow}>
                  <BankLogo
                    bankName={liveBankName}
                    accountNumber={accountModal?.number}
                    size={28}
                  />
                  <Text style={[styles.liveBankText, { color: colors.textSecondary }]}>
                    {t('bankAccountsDetectedBankLabel')}:{' '}
                    <Text style={{ color: colors.text, fontWeight: '600' }}>{liveBankName}</Text>
                  </Text>
                </View>
              ) : null}

              <Text style={[styles.inputLabel, { color: colors.text, marginTop: 14 }]}>
                {t('bankAccountsNameOptionalLabel')}
              </Text>
              <TextInput
                value={accountModal?.label ?? ''}
                onChangeText={(label) =>
                  setAccountModal((prev) => (prev ? { ...prev, label } : prev))
                }
                placeholder={t('bankAccountsNameOptionalPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="sentences"
                style={[
                  styles.accountInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
              />

              <View style={styles.modalActions}>
                {accountModal?.mode === 'edit' ? (
                  <TouchableOpacity onPress={confirmDeleteAccount} style={styles.modalBtnGhost}>
                    <Text style={{ color: '#DC2626', fontWeight: '700' }}>{t('delete')}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={closeAccountModal} style={styles.modalBtnGhost}>
                    <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>{t('cancel')}</Text>
                  </TouchableOpacity>
                )}
                <View style={{ flex: 1 }} />
                {accountModal?.mode === 'edit' ? (
                  <TouchableOpacity onPress={closeAccountModal} style={styles.modalBtnGhost}>
                    <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>{t('cancel')}</Text>
                  </TouchableOpacity>
                ) : null}
                <AsyncButton
                  variant="solid"
                  solidColor={colors.primary}
                  label={t('bankAccountsSaveAccount')}
                  loadingLabel={t('bankAccountsSaving')}
                  onPress={saveAccountFromModal}
                  style={styles.modalSaveBtn}
                  contentStyle={styles.modalSaveBtnContent}
                  textStyle={styles.saveAccountsBtnText}
                />
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
  },
  content: {
    padding: 20,
    flexGrow: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 16,
    marginTop: 0,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 28,
    marginBottom: 4,
    opacity: 0.65,
  },
  importsSectionTitle: {
    marginTop: 20,
  },
  settingSubtitle: {
    fontSize: 14,
  },
  accountsCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 8,
  },
  accountInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  saveAccountsBtnText: {
    color: 'white',
    fontWeight: '700' as const,
    fontSize: 15,
  },
  bankTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  bankTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  bankTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    flex: 1,
  },
  accountLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  accountLineRowBorder: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.25)',
  },
  accountLineText: {
    flex: 1,
    marginRight: 10,
  },
  accountLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  accountNumber: {
    fontSize: 14,
    marginTop: 2,
  },
  addInlineBtn: {
    borderRadius: 12,
    borderWidth: 2,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addInlineBtnText: {
    fontWeight: '700' as const,
    fontSize: 15,
  },
  liveBankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  liveBankText: {
    fontSize: 14,
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 16,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '88%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
  },
  modalBtnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  modalSaveBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalSaveBtnContent: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  importsCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  importsLoadingRow: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  importBatchCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  importBatchBank: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  importBatchPeriod: {
    fontSize: 15,
    fontWeight: '600' as const,
    marginTop: 2,
  },
  importMeta: {
    fontSize: 13,
    marginTop: 4,
  },
  dangerBtn: {
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  importDeleteBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
  },
  dangerBtnText: {
    color: '#FFFFFF',
    fontWeight: '700' as const,
    fontSize: 14,
  },
  bankSyncActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  bankSyncActionBtn: {
    marginTop: 0,
    paddingHorizontal: 14,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
