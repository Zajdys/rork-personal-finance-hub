import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Share,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Plus,
  Scale,
  X,
  Check,
  Share2,
  MoreVertical,
  Archive,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { SwipeableSplitExpenseRow } from '@/components/SwipeableSplitExpenseRow';
import { pluralClen } from '@/lib/plural-cs';
import { safeGoBack } from '@/lib/safe-back';
import { BackButton } from '@/components/BackButton';
import {
  useSplitGroupsStore,
  type SplitExpense,
} from '@/store/split-groups-store';

const MEMBER_AVATARS = ['😀', '🧑', '👩', '🧔', '👱', '👩‍🦱'] as const;

/** Stabilní emoji avatar podle member.id (stejné napříč reloady). */
function memberAvatarEmoji(memberId: string): string {
  let hash = 0;
  for (let i = 0; i < memberId.length; i += 1) {
    hash = (hash * 31 + memberId.charCodeAt(i)) >>> 0;
  }
  return MEMBER_AVATARS[hash % MEMBER_AVATARS.length];
}

function currencySymbol(code: string): string {
  switch (code.toUpperCase()) {
    case 'CZK':
      return 'Kč';
    case 'EUR':
      return '€';
    case 'USD':
      return '$';
    case 'GBP':
      return '£';
    default:
      return code;
  }
}

function formatMoney(amount: number, currency: string) {
  const rounded = Math.round(amount * 100) / 100;
  const num = rounded.toLocaleString('cs-CZ', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${num} ${currencySymbol(currency)}`;
}

export default function SplitGroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguageStore();

  const groups = useSplitGroupsStore((s) => s.groups);
  const fetchGroups = useSplitGroupsStore((s) => s.fetchGroups);
  const fetchExpensesForGroup = useSplitGroupsStore((s) => s.fetchExpensesForGroup);
  const membersForGroup = useSplitGroupsStore((s) => s.membersForGroup);
  const expensesByGroupId = useSplitGroupsStore((s) => s.expensesByGroupId);
  const settlementsByGroupId = useSplitGroupsStore((s) => s.settlementsByGroupId);
  const computeBalances = useSplitGroupsStore((s) => s.computeBalances);
  const simplifyDebts = useSplitGroupsStore((s) => s.simplifyDebts);
  const addMember = useSplitGroupsStore((s) => s.addMember);
  const addSettlement = useSplitGroupsStore((s) => s.addSettlement);
  const deleteExpense = useSplitGroupsStore((s) => s.deleteExpense);
  const setGroupArchived = useSplitGroupsStore((s) => s.setGroupArchived);
  const isLoading = useSplitGroupsStore((s) => s.isLoading);

  const group = groups.find((g) => g.id === groupId);
  const isArchived = group?.is_archived === true;
  const members = useMemo(
    () => (groupId ? membersForGroup(groupId) : []),
    [groupId, membersForGroup],
  );
  const expenses = groupId ? expensesByGroupId[groupId] ?? [] : [];
  const settlements = groupId ? settlementsByGroupId[groupId] ?? [] : [];
  const balances = useMemo(
    () => (groupId ? computeBalances(groupId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupId, computeBalances, members, expenses, settlements],
  );
  const debts = useMemo(() => simplifyDebts(balances), [balances, simplifyDebts]);

  const memberCountLabel = `${members.length} ${pluralClen(members.length, language)}`;

  const [settleOpen, setSettleOpen] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberTab, setMemberTab] = useState<'guest' | 'code'>('guest');
  const [memberName, setMemberName] = useState('');
  const [busy, setBusy] = useState(false);
  const [settlingKey, setSettlingKey] = useState<string | null>(null);

  useFocusRefresh(
    useCallback(async () => {
      if (!groups.length) await fetchGroups();
      if (groupId) await fetchExpensesForGroup(groupId);
    }, [groupId, fetchGroups, fetchExpensesForGroup, groups.length]),
    { focusKey: groupId ?? '' },
  );

  const memberNameById = useCallback(
    (memberId: string) => members.find((m) => m.id === memberId)?.display_name ?? '—',
    [members],
  );

  const openAddExpense = () => {
    if (!groupId || isArchived) return;
    router.push({ pathname: '/add-split-expense', params: { groupId } });
  };

  const openEditExpense = (expense: SplitExpense) => {
    if (!groupId || isArchived) return;
    router.push({
      pathname: '/add-split-expense',
      params: { groupId, expenseId: expense.id },
    });
  };

  const openAddMember = () => {
    setMemberTab('guest');
    setMemberName('');
    setMemberOpen(true);
  };

  const closeAddMember = () => {
    setMemberOpen(false);
    setMemberTab('guest');
    setMemberName('');
  };

  const handleShareInviteCode = async () => {
    if (!group?.invite_code) return;
    const message = t('splitGroupsShareInviteMessage', {
      name: group.name,
      code: group.invite_code,
    });
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(message);
        Alert.alert(t('monthlyReportCopied'), t('monthlyReportCopiedMessage'));
        return;
      }
      await Share.share({ message, title: t('splitGroupsShareInvite') });
    } catch (e) {
      console.warn('[split-group-detail] share invite', e);
    }
  };

  const handleShareSettlements = async () => {
    if (!group || debts.length === 0) return;
    const currency = group.currency ?? 'CZK';
    const lines = [
      t('splitGroupsShareSettleHeader', { name: group.name }),
      '',
      ...debts.map((d) =>
        t('splitGroupsDebtLine', {
          from: d.fromDisplayName,
          to: d.toDisplayName,
          amount: formatMoney(d.amount, currency),
        }),
      ),
    ];
    const message = lines.join('\n');
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(message);
        Alert.alert(t('monthlyReportCopied'), t('monthlyReportCopiedMessage'));
        return;
      }
      await Share.share({ message, title: t('splitGroupsShareSettleTitle', { name: group.name }) });
    } catch (e) {
      console.warn('[split-group-detail] share settlements', e);
    }
  };

  const handleAddMember = async () => {
    if (!groupId) return;
    const trimmed = memberName.trim();
    if (!trimmed) {
      Alert.alert(t('error'), t('splitGroupsMemberNameRequired'));
      return;
    }
    setBusy(true);
    const { error } = await addMember({ groupId, displayName: trimmed, userId: null });
    setBusy(false);
    if (error) {
      Alert.alert(t('error'), error);
      return;
    }
    closeAddMember();
  };

  const handleMarkSettled = async (fromMemberId: string, toMemberId: string, amount: number) => {
    if (!groupId) return;
    const key = `${fromMemberId}-${toMemberId}-${amount}`;
    setSettlingKey(key);
    setBusy(true);
    const { error } = await addSettlement({ groupId, fromMemberId, toMemberId, amount });
    setBusy(false);
    setSettlingKey(null);
    if (error) Alert.alert(t('error'), error);
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!groupId) return;
    const { error } = await deleteExpense({ expenseId, groupId });
    if (error) Alert.alert(t('error'), error);
  };

  const handleSetArchived = async (archived: boolean) => {
    if (!groupId) return;
    setBusy(true);
    const { error } = await setGroupArchived(groupId, archived);
    setBusy(false);
    if (error) {
      Alert.alert(t('error'), error ?? (archived ? t('splitGroupsArchiveFailed') : t('splitGroupsUnarchiveFailed')));
      return;
    }
    if (archived) {
      safeGoBack();
    }
  };

  const openGroupMenu = () => {
    if (!group) return;
    if (group.is_archived) {
      Alert.alert(group.name, undefined, [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('splitGroupsUnarchive'),
          onPress: () => void handleSetArchived(false),
        },
      ]);
      return;
    }
    Alert.alert(group.name, undefined, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('splitGroupsAddMember'),
        onPress: openAddMember,
      },
      {
        text: t('splitGroupsArchive'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(t('splitGroupsArchiveConfirmTitle'), t('splitGroupsArchiveConfirmBody'), [
            { text: t('cancel'), style: 'cancel' },
            {
              text: t('splitGroupsArchive'),
              style: 'destructive',
              onPress: () => void handleSetArchived(true),
            },
          ]);
        },
      },
    ]);
  };

  if (!groupId) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text, margin: 24 }}>{t('splitGroupsNotFound')}</Text>
      </View>
    );
  }

  const sheetBg = colors.card;
  const inputBg = isDark ? colors.muted : colors.background;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerRow}>
          <BackButton color="white" size={24} style={styles.headerBtn} hitSlop={12} />
          <View style={styles.headerTitles} pointerEvents="none">
            <Text style={styles.headerTitle} numberOfLines={1}>
              {group?.icon ? `${group.icon} ` : ''}
              {group?.name ?? t('splitGroups')}
            </Text>
            <Text style={styles.headerSubtitle}>
              {memberCountLabel} · {group?.currency ?? 'CZK'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={openGroupMenu}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            accessibilityRole="button"
            accessibilityLabel={t('splitGroupsGroupMenu')}
          >
            <MoreVertical color="white" size={22} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {isArchived ? (
        <View style={[styles.archivedBanner, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Archive color={colors.textSecondary} size={16} />
          <Text style={[styles.archivedBannerText, { color: colors.textSecondary }]}>
            {t('splitGroupsArchivedBadge')}
          </Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('splitGroupsBalances')}</Text>
          <TouchableOpacity
            style={[styles.settleChip, { backgroundColor: colors.primary }]}
            onPress={() => setSettleOpen(true)}
          >
            <Scale color={colors.onPrimary} size={16} />
            <Text style={[styles.settleChipText, { color: colors.onPrimary }]}>{t('splitGroupsSettle')}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {isLoading && balances.length === 0 ? (
            <ActivityIndicator color={colors.primary} />
          ) : balances.length === 0 ? (
            <Text style={{ color: colors.textSecondary }}>{t('splitGroupsNoMembers')}</Text>
          ) : (
            balances.map((b) => {
              const positive = b.balance > 0.005;
              const negative = b.balance < -0.005;
              const tone = positive ? colors.success : negative ? colors.error : colors.textSecondary;
              return (
                <View key={b.memberId} style={styles.balanceRow}>
                  <View style={styles.balanceNameRow}>
                    <Text style={styles.balanceAvatar}>{memberAvatarEmoji(b.memberId)}</Text>
                    <Text style={[styles.balanceName, { color: colors.text }]} numberOfLines={1}>
                      {b.displayName}
                    </Text>
                  </View>
                  <Text style={[styles.balanceAmount, { color: tone }]}>
                    {positive ? '+' : ''}
                    {formatMoney(b.balance, group?.currency ?? 'CZK')}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 8 }]}>
          {t('splitGroupsExpenses')}
        </Text>

        {expenses.length === 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ color: colors.textSecondary }}>{t('splitGroupsNoExpenses')}</Text>
          </View>
        ) : (
          expenses.map((e) => (
            <SwipeableSplitExpenseRow
              key={e.id}
              expense={e}
              currencyLabel={currencySymbol(group?.currency ?? 'CZK')}
              paidByLabel={t('splitGroupsPaidBy', { name: memberNameById(e.paid_by) })}
              onEdit={() => openEditExpense(e)}
              onDelete={() => void handleDeleteExpense(e.id)}
            />
          ))
        )}
      </ScrollView>

      {!isArchived ? (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 24 }]}
          onPress={openAddExpense}
          activeOpacity={0.9}
        >
          <Plus color={colors.onPrimary} size={22} />
          <Text style={[styles.fabLabel, { color: colors.onPrimary }]}>{t('splitGroupsNewExpense')}</Text>
        </TouchableOpacity>
      ) : null}

      {/* Settle modal */}
      <Modal visible={settleOpen} animationType="slide" transparent onRequestClose={() => setSettleOpen(false)}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[styles.modalScrim, { backgroundColor: colors.overlay }]} onPress={() => setSettleOpen(false)} />
          <View style={[styles.modalSheet, { backgroundColor: sheetBg, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('splitGroupsSettleTitle')}</Text>
              <TouchableOpacity onPress={() => setSettleOpen(false)} hitSlop={12}>
                <X color={colors.textSecondary} size={22} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.settleHint, { color: colors.textSecondary }]}>{t('splitGroupsSettleHint')}</Text>
            {debts.length === 0 ? (
              <View style={[styles.settledBox, { backgroundColor: inputBg }]}>
                <Text style={[styles.settledText, { color: colors.success }]}>{t('splitGroupsSettledUp')}</Text>
              </View>
            ) : (
              <ScrollView style={styles.debtList} showsVerticalScrollIndicator={false}>
                {debts.map((d) => {
                  const key = `${d.fromMemberId}-${d.toMemberId}-${d.amount}`;
                  const isSettling = settlingKey === key;
                  return (
                    <View
                      key={key}
                      style={[styles.debtCard, { backgroundColor: inputBg, borderColor: colors.border }]}
                    >
                      <Text style={[styles.debtText, { color: colors.text }]}>
                        {`${d.fromDisplayName} → ${d.toDisplayName}: ${formatMoney(d.amount, group?.currency ?? 'CZK')}`}
                      </Text>
                      <TouchableOpacity
                        style={[styles.markSettledBtn, { backgroundColor: colors.success, opacity: busy && !isSettling ? 0.5 : 1 }]}
                        disabled={busy}
                        onPress={() => void handleMarkSettled(d.fromMemberId, d.toMemberId, d.amount)}
                      >
                        {isSettling ? (
                          <ActivityIndicator color="white" size="small" />
                        ) : (
                          <>
                            <Check color="white" size={16} />
                            <Text style={styles.markSettledBtnText}>{t('splitGroupsMarkSettled')}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}
            {debts.length > 0 ? (
              <TouchableOpacity
                style={[styles.shareSettleBtn, { backgroundColor: colors.primary }]}
                onPress={() => void handleShareSettlements()}
              >
                <Share2 color={colors.onPrimary} size={18} />
                <Text style={[styles.shareSettleBtnText, { color: colors.onPrimary }]}>
                  {t('splitGroupsShareSettle')}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add member sheet */}
      <Modal visible={memberOpen} animationType="slide" transparent onRequestClose={closeAddMember}>
        <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[styles.modalScrim, { backgroundColor: colors.overlay }]} onPress={closeAddMember} />
          <View style={[styles.modalSheet, { backgroundColor: sheetBg, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('splitGroupsAddMember')}</Text>
              <TouchableOpacity onPress={closeAddMember} hitSlop={12}>
                <X color={colors.textSecondary} size={22} />
              </TouchableOpacity>
            </View>

            <View style={[styles.tabRow, { backgroundColor: inputBg }]}>
              <TouchableOpacity
                style={[
                  styles.tabBtn,
                  memberTab === 'guest' && { backgroundColor: colors.card },
                ]}
                onPress={() => setMemberTab('guest')}
              >
                <Text
                  style={[
                    styles.tabBtnText,
                    { color: memberTab === 'guest' ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {t('splitGroupsInviteTabGuest')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tabBtn,
                  memberTab === 'code' && { backgroundColor: colors.card },
                ]}
                onPress={() => setMemberTab('code')}
              >
                <Text
                  style={[
                    styles.tabBtnText,
                    { color: memberTab === 'code' ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {t('splitGroupsInviteTabCode')}
                </Text>
              </TouchableOpacity>
            </View>

            {memberTab === 'guest' ? (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{t('splitGroupsMemberName')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: inputBg, color: colors.text, borderColor: colors.border }]}
                  value={memberName}
                  onChangeText={setMemberName}
                  placeholder={t('splitGroupsMemberNamePlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => void handleAddMember()}
                />
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]}
                  onPress={() => void handleAddMember()}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
                      {t('splitGroupsAddMemberConfirm')}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.inviteHint, { color: colors.textSecondary }]}>
                  {t('splitGroupsInviteCodeHint')}
                </Text>
                <Text style={[styles.inviteCode, { color: colors.text }]}>
                  {group?.invite_code ?? '——'}
                </Text>
                <TouchableOpacity
                  style={[styles.primaryBtn, styles.shareBtn, { backgroundColor: colors.primary }]}
                  onPress={() => void handleShareInviteCode()}
                  disabled={!group?.invite_code}
                >
                  <Share2 color={colors.onPrimary} size={18} />
                  <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>
                    {t('splitGroupsShare')}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  archivedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  archivedBannerText: { fontSize: 13, fontWeight: '600' },
  headerTitles: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: '700' },
  headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 10 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  settleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  settleChipText: { fontSize: 13, fontWeight: '700' },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  balanceNameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  balanceAvatar: { fontSize: 18 },
  balanceName: { flex: 1, fontSize: 15, fontWeight: '600' },
  balanceAmount: { fontSize: 15, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    height: 52,
    borderRadius: 26,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabLabel: { fontSize: 15, fontWeight: '700' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalScrim: { ...StyleSheet.absoluteFillObject },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  tabRow: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabBtnText: { fontSize: 14, fontWeight: '700' },
  inviteHint: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  inviteCode: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 6,
    textAlign: 'center',
    marginBottom: 8,
  },
  shareBtn: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  primaryBtn: {
    marginTop: 20,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
  debtList: { maxHeight: 420 },
  debtCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  debtText: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  markSettledBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  markSettledBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },
  shareSettleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 14,
  },
  shareSettleBtnText: { fontSize: 15, fontWeight: '700' },
  settleHint: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  settledBox: { borderRadius: 14, padding: 16, alignItems: 'center' },
  settledText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
