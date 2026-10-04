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
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFocusRefresh } from '@/hooks/useFocusRefresh';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, UsersRound, ChevronRight, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { useAuth } from '@/store/auth-store';
import { useSplitGroupsStore } from '@/store/split-groups-store';
import { BackButton } from '@/components/BackButton';
import { pluralClen } from '@/lib/plural-cs';

const GROUP_ICONS = ['👥', '✈️', '🏠', '🎉', '🍕', '⛰️', '🍻', '🏖️'];
const BALANCE_EPS = 0.005;

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

function formatSignedBalance(amount: number, currency: string): string {
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const num = rounded.toLocaleString('cs-CZ', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  const sign = amount > 0 ? '+' : '-';
  return `${sign}${num} ${currencySymbol(currency)}`;
}

export default function SplitGroupsListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguageStore();
  const lang = language === 'en' ? 'en' : 'cs';
  const { user } = useAuth();
  const groups = useSplitGroupsStore((s) => s.groups);
  const members = useSplitGroupsStore((s) => s.members);
  const isLoading = useSplitGroupsStore((s) => s.isLoading);
  const fetchGroups = useSplitGroupsStore((s) => s.fetchGroups);
  const fetchExpensesForGroups = useSplitGroupsStore((s) => s.fetchExpensesForGroups);
  const computeBalances = useSplitGroupsStore((s) => s.computeBalances);
  const createGroup = useSplitGroupsStore((s) => s.createGroup);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('CZK');
  const [icon, setIcon] = useState('👥');
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  useFocusRefresh(
    useCallback(async () => {
      await fetchGroups();
      const ids = useSplitGroupsStore.getState().groups.map((g) => g.id);
      if (ids.length) await fetchExpensesForGroups(ids);
    }, [fetchGroups, fetchExpensesForGroups]),
  );

  const myBalanceByGroupId = useMemo(() => {
    const map: Record<string, number | null> = {};
    if (!user?.id) return map;

    for (const g of groups) {
      const myMember = members.find((m) => m.group_id === g.id && m.user_id === user.id);
      if (!myMember) {
        map[g.id] = null;
        continue;
      }
      const balances = computeBalances(g.id);
      const mine = balances.find((b) => b.memberId === myMember.id);
      map[g.id] = mine?.balance ?? 0;
    }
    return map;
  }, [groups, members, user?.id, computeBalances]);

  const balanceLabel = useCallback(
    (groupId: string, currency: string) => {
      const balance = myBalanceByGroupId[groupId];
      if (balance == null) return null;

      if (Math.abs(balance) <= BALANCE_EPS) {
        return { text: t('hhOverviewSettled'), color: colors.textSecondary };
      }
      if (balance > 0) {
        return { text: formatSignedBalance(balance, currency), color: colors.success };
      }
      return { text: formatSignedBalance(balance, currency), color: colors.error };
    },
    [colors.error, colors.success, colors.textSecondary, myBalanceByGroupId, t],
  );

  const memberCount = (groupId: string) => members.filter((m) => m.group_id === groupId).length;

  const archivedCount = useMemo(() => groups.filter((g) => g.is_archived).length, [groups]);

  const visibleGroups = useMemo(() => {
    if (showArchived) return groups;
    return groups.filter((g) => !g.is_archived);
  }, [groups, showArchived]);

  const handleCreate = async () => {
    if (!user?.id) {
      Alert.alert(t('error'), t('splitGroupsNeedLogin'));
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert(t('error'), t('splitGroupsNameRequired'));
      return;
    }
    setSaving(true);
    const { group, error } = await createGroup({
      userId: user.id,
      name: trimmed,
      currency: currency.trim() || 'CZK',
      icon,
      creatorDisplayName: user.name?.trim() || t('splitGroupsMe'),
    });
    setSaving(false);
    if (error || !group) {
      Alert.alert(t('error'), error ?? t('splitGroupsCreateFailed'));
      return;
    }
    setCreateOpen(false);
    setName('');
    router.push({ pathname: '/split-group-detail', params: { id: group.id } });
  };

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
          <BackButton color="white" size={24} style={styles.headerBtn} />
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>{t('splitGroups')}</Text>
            <Text style={styles.headerSubtitle}>{t('splitGroupsListSubtitle')}</Text>
          </View>
          <View style={styles.headerBtn} />
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {archivedCount > 0 ? (
          <TouchableOpacity
            style={[styles.archiveToggle, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => setShowArchived((v) => !v)}
            activeOpacity={0.85}
          >
            <Text style={[styles.archiveToggleText, { color: colors.primary }]}>
              {showArchived ? t('splitGroupsHideArchived') : t('splitGroupsShowArchived')}
            </Text>
            {!showArchived ? (
              <Text style={[styles.archiveToggleMeta, { color: colors.textSecondary }]}>
                ({archivedCount})
              </Text>
            ) : null}
          </TouchableOpacity>
        ) : null}

        {isLoading && groups.length === 0 ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : visibleGroups.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <UsersRound color={colors.textSecondary} size={36} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {groups.length > 0 && archivedCount > 0 && !showArchived
                ? t('splitGroupsEmptyArchivedHint')
                : t('splitGroupsEmptyTitle')}
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
              {groups.length > 0 && archivedCount > 0 && !showArchived
                ? t('splitGroupsShowArchived')
                : t('splitGroupsEmptyBody')}
            </Text>
          </View>
        ) : (
          visibleGroups.map((g) => {
            const balance = balanceLabel(g.id, g.currency);
            return (
            <TouchableOpacity
              key={g.id}
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: g.is_archived ? 0.72 : 1,
                },
              ]}
              onPress={() => router.push({ pathname: '/split-group-detail', params: { id: g.id } })}
              activeOpacity={0.85}
            >
              <View style={[styles.iconBubble, { backgroundColor: colors.muted }]}>
                <Text style={styles.iconEmoji}>{g.icon || '👥'}</Text>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                    {g.name}
                  </Text>
                  {balance ? (
                    <Text
                      style={[styles.cardBalance, { color: balance.color }]}
                      numberOfLines={1}
                    >
                      {balance.text}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                  {g.is_archived ? `${t('splitGroupsArchivedBadge')} · ` : ''}
                  {t('splitGroupsMemberCount', {
                    n: memberCount(g.id),
                    membersWord: pluralClen(memberCount(g.id), lang),
                  })}{' '}
                  · {g.currency}
                </Text>
              </View>
              <ChevronRight color={colors.textSecondary} size={20} />
            </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <View style={[styles.bottomActions, { bottom: insets.bottom + 16, paddingHorizontal: 16 }]}>
        <TouchableOpacity
          style={[styles.bottomBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push('/join-split-group')}
          activeOpacity={0.85}
        >
          <Plus color={colors.primary} size={18} />
          <Text style={[styles.bottomBtnText, { color: colors.primary }]}>{t('splitGroupsJoinByCode')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bottomBtn, styles.bottomBtnPrimary, { backgroundColor: colors.primary }]}
          onPress={() => setCreateOpen(true)}
          activeOpacity={0.9}
        >
          <Plus color={colors.onPrimary} size={18} />
          <Text style={[styles.bottomBtnText, { color: colors.onPrimary }]}>{t('splitGroupsNewGroup')}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setCreateOpen(false)}>
          <Pressable
            style={[styles.modalSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('splitGroupsNew')}</Text>
              <TouchableOpacity onPress={() => setCreateOpen(false)}>
                <X color={colors.textSecondary} size={22} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('splitGroupsName')}</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: isDark ? colors.muted : colors.background, color: colors.text, borderColor: colors.border },
              ]}
              value={name}
              onChangeText={setName}
              placeholder={t('splitGroupsNamePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              autoFocus
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('splitGroupsCurrency')}</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: isDark ? colors.muted : colors.background, color: colors.text, borderColor: colors.border },
              ]}
              value={currency}
              onChangeText={setCurrency}
              autoCapitalize="characters"
              maxLength={6}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>{t('splitGroupsIcon')}</Text>
            <View style={styles.iconRow}>
              {GROUP_ICONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.iconPick,
                    { backgroundColor: colors.muted, borderColor: icon === emoji ? colors.primary : 'transparent' },
                  ]}
                  onPress={() => setIcon(emoji)}
                >
                  <Text style={styles.iconEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
              onPress={() => void handleCreate()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}>{t('splitGroupsCreate')}</Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitles: { flex: 1, alignItems: 'center' },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: '700' },
  headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  archiveToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  archiveToggleText: { fontSize: 14, fontWeight: '700' },
  archiveToggleMeta: { fontSize: 13, fontWeight: '600' },
  emptyCard: {
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: { fontSize: 22 },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  cardBalance: { fontSize: 14, fontWeight: '700', flexShrink: 0 },
  cardMeta: { fontSize: 13, marginTop: 2 },
  bottomActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 10,
  },
  bottomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  bottomBtnPrimary: { borderWidth: 0 },
  bottomBtnText: { fontSize: 14, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  iconPick: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  primaryBtn: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
});
