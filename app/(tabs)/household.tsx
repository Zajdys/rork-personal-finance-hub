import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  Users,
  Wallet,
  PieChart,
  Target,
} from 'lucide-react-native';
import { useAuth } from '@/store/auth-store';
import { useLanguageStore } from '@/store/language-store';
import { appLocale } from '@/lib/app-locale';
import { useSettingsStore } from '@/store/settings-store';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdRenamePrompt } from '@/hooks/use-household-rename-prompt';
import { useHouseholdActiveStore } from '@/store/household-active-store';
import { ExpenseFormModal } from '@/components/household/ExpenseFormModal';
import { HouseholdHeader } from '@/components/household/HouseholdHeader';
import { HouseholdOverlayModals } from '@/components/household/HouseholdOverlayModals';
import { HouseholdSummaryCard } from '@/components/household/HouseholdSummaryCard';
import { RecurringExpenseCard } from '@/components/household/RecurringExpenseCard';
import { SettlementSection } from '@/components/household/SettlementSection';
import { SharedExpenseFormModal } from '@/components/household/SharedExpenseFormModal';
import { SharedExpenseList } from '@/components/household/SharedExpenseList';
import { householdStyles as styles } from '@/components/household/styles';
import {
  useHouseholdMembers,
} from '@/hooks/household/useHouseholdMembers';
import { useHouseholdSettlements } from '@/hooks/household/useHouseholdSettlements';
import { useHouseholdSummary } from '@/hooks/household/useHouseholdSummary';
import {
  useHouseholdSwitcher,
  type HouseholdFetchBundle,
} from '@/hooks/household/useHouseholdSwitcher';
import { useRecurringExpenses } from '@/hooks/household/useRecurringExpenses';
import { useSharedExpenses } from '@/hooks/household/useSharedExpenses';
import { PremiumGateScreen } from '@/components/PremiumGate';

function HouseholdTabScreenContent() {
  const { colors, isDark } = useTheme();
  const { t, language } = useLanguageStore();
  const { getCurrentCurrency } = useSettingsStore();
  const numberLocale = appLocale(language);
  const currency = getCurrentCurrency();
  const { user } = useAuth();
  const { promptRename, RenameModal } = useHouseholdRenamePrompt();
  const insets = useSafeAreaInsets();

  const householdId = useHouseholdActiveStore((s) => s.activeHouseholdId);

  const mainScrollRef = useRef<ScrollView>(null);
  const scrollContentRef = useRef<View>(null);
  const settlementSectionRef = useRef<View>(null);
  const [activeTab, setActiveTab] = useState<'recurring' | 'shared'>('recurring');

  const loadHouseholdDataRef = useRef<(hid: string, currentUserId: string) => Promise<void>>(
    async () => {},
  );
  const setLoadingRef = useRef<(v: boolean) => void>(() => {});
  const setHouseholdSwitcherOpenRef = useRef<(v: boolean) => void>(() => {});
  const recurringClearRef = useRef<() => void>(() => {});
  const sharedClearRef = useRef<() => void>(() => {});
  const fetchSharedForSettlementRef = useRef<(hid: string) => Promise<void>>(async () => {});

  const clearDependentData = useCallback(() => {
    recurringClearRef.current();
    sharedClearRef.current();
  }, []);

  const membersHook = useHouseholdMembers({
    loadHouseholdDataRef,
    setLoadingRef,
    setHouseholdSwitcherOpenRef,
    clearDependentData,
  });
  const { members, inviteSheetHousehold, householdActionBusy } = membersHook.data;

  const recurring = useRecurringExpenses({ householdId, members });
  recurringClearRef.current = recurring.clearData;

  const fetchSharedForSettlement = useCallback(
    (hid: string) => fetchSharedForSettlementRef.current(hid),
    [],
  );

  const shared = useSharedExpenses({
    householdId,
    members,
    fetchSharedExpensesForSettlement: fetchSharedForSettlement,
  });
  sharedClearRef.current = shared.clearData;

  const settlements = useHouseholdSettlements({
    householdId,
    members,
    recurringSettlementInputs: recurring.data.recurringSettlementInputs,
    sharedHasSinglePayerAny: shared.data.sharedHasSinglePayerAny,
  });
  fetchSharedForSettlementRef.current = settlements.fetchSharedExpensesForSettlement;

  const fetchesRef = useRef<HouseholdFetchBundle>({
    fetchMembers: membersHook.fetchMembers,
    fetchRecurringExpenses: recurring.fetchRecurringExpenses,
    fetchSharedExpenses: shared.fetchSharedExpenses,
    fetchSharedExpensesForSettlement: settlements.fetchSharedExpensesForSettlement,
    fetchHouseholdSettlements: settlements.fetchHouseholdSettlements,
    fetchCustomCategories: recurring.fetchCustomCategories,
    clearMembers: membersHook.clearData,
    clearRecurring: recurring.clearData,
    clearShared: shared.clearData,
    sharedMonth: shared.data.sharedMonth,
    setInviteSheetHousehold: membersHook.setInviteSheetHousehold,
  });
  fetchesRef.current = {
    fetchMembers: membersHook.fetchMembers,
    fetchRecurringExpenses: recurring.fetchRecurringExpenses,
    fetchSharedExpenses: shared.fetchSharedExpenses,
    fetchSharedExpensesForSettlement: settlements.fetchSharedExpensesForSettlement,
    fetchHouseholdSettlements: settlements.fetchHouseholdSettlements,
    fetchCustomCategories: recurring.fetchCustomCategories,
    clearMembers: membersHook.clearData,
    clearRecurring: recurring.clearData,
    clearShared: shared.clearData,
    sharedMonth: shared.data.sharedMonth,
    setInviteSheetHousehold: membersHook.setInviteSheetHousehold,
  };

  const switcher = useHouseholdSwitcher({
    fetchesRef,
    loadingRef: setLoadingRef,
    switcherOpenRef: setHouseholdSwitcherOpenRef,
    loadHouseholdDataRef,
  });

  const summary = useHouseholdSummary({
    recurringExpenses: recurring.data.recurringExpenses,
    sharedExpenses: shared.data.sharedExpenses,
    members,
    sharedMonth: shared.data.sharedMonth,
    numberLocale,
    currentUserId: user?.id,
  });

  const themedInput = useMemo(
    () => [styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }],
    [colors],
  );

  const scrollToSettlementSection = useCallback(() => {
    setActiveTab('shared');
    setTimeout(() => {
      const content = scrollContentRef.current;
      const section = settlementSectionRef.current;
      if (!content || !section) return;
      section.measureLayout(content, (_x, y) => {
        mainScrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
      });
    }, 80);
  }, []);

  const {
    householdId: switcherHouseholdId,
    householdName,
    households,
    householdSwitcherOpen,
    newHouseholdModalOpen,
    newHouseholdName,
    joinModalOpen,
    isJoiningHousehold,
    isCreatingHousehold,
    joinCode,
  } = switcher.data;
  const activeHouseholdId = switcherHouseholdId;

  if (switcher.loading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!activeHouseholdId) {
    const howSteps = [
      t('hhEmptyStep1'),
      t('hhEmptyStep2'),
      t('hhEmptyStep3'),
    ];
    const benefits = [
      { Icon: Wallet, label: t('hhEmptyBenefitExpenses'), color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)' },
      { Icon: PieChart, label: t('hhEmptyBenefitBudget'), color: '#06B6D4', bg: 'rgba(6,182,212,0.15)' },
      { Icon: Target, label: t('hhEmptyBenefitGoals'), color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
    ];

    return (
      <>
        <ScrollView
          style={[styles.container, { backgroundColor: colors.background }]}
          contentContainerStyle={[
            emptyStyles.scrollContent,
            { paddingTop: Math.max(insets.top, 12) + 8, paddingBottom: Math.max(insets.bottom, 16) + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={emptyStyles.hero}>
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              style={emptyStyles.heroIcon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Users color="#FFFFFF" size={32} />
            </LinearGradient>
            <Text style={[emptyStyles.heroTitle, { color: colors.text }]}>{t('hhEmptyHeroTitle')}</Text>
            <Text style={[emptyStyles.heroSubtitle, { color: colors.textSecondary }]}>
              {t('hhEmptyHeroSubtitle')}
            </Text>
          </View>

          <View style={[emptyStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[emptyStyles.cardTitle, { color: colors.text }]}>{t('hhEmptyHowTitle')}</Text>
            {howSteps.map((step, index) => (
              <View key={index} style={emptyStyles.stepRow}>
                <LinearGradient
                  colors={[colors.gradientStart, colors.gradientEnd]}
                  style={emptyStyles.stepBadge}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={emptyStyles.stepBadgeText}>{index + 1}</Text>
                </LinearGradient>
                <Text style={[emptyStyles.stepText, { color: colors.text }]}>{step}</Text>
              </View>
            ))}
          </View>

          <View style={emptyStyles.benefitsRow}>
            {benefits.map(({ Icon, label, color, bg }) => (
              <View
                key={label}
                style={[emptyStyles.benefitCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={[emptyStyles.benefitIcon, { backgroundColor: bg }]}>
                  <Icon color={color} size={18} />
                </View>
                <Text style={[emptyStyles.benefitLabel, { color: colors.text }]} numberOfLines={2}>
                  {label}
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={emptyStyles.primaryBtn}
            onPress={switcher.openCreateHouseholdModal}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              style={emptyStyles.primaryBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={emptyStyles.primaryBtnText}>{t('hhNewHousehold')}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={[emptyStyles.secondaryBtn, { borderColor: colors.primary }]}
            onPress={switcher.openJoinHouseholdModal}
            activeOpacity={0.88}
          >
            <Text style={[emptyStyles.secondaryBtnText, { color: colors.primary }]}>
              {t('hhEmptyHaveCode')}
            </Text>
          </TouchableOpacity>

          <Text style={[emptyStyles.footnote, { color: colors.textSecondary }]}>
            {t('hhEmptyPremiumNote')}
          </Text>
        </ScrollView>
        <HouseholdOverlayModals
          colors={colors}
          themedInput={themedInput}
          t={t}
          settleModal={null}
          setSettleModal={() => {}}
          settleAmountText=""
          setSettleAmountText={() => {}}
          settleNoteText=""
          setSettleNoteText={() => {}}
          isSavingSettlement={false}
          submitHouseholdSettlement={() => {}}
          customCategoryModalOpen={false}
          closeCustomCategoryModal={() => {}}
          newCustomCategoryName=""
          setNewCustomCategoryName={() => {}}
          newCustomCategoryEmoji="🏠"
          setNewCustomCategoryEmoji={() => {}}
          householdId={null}
          userId={user?.id}
          setCustomCategory={() => {}}
          setNewRecurringCategory={() => {}}
          submitCustomCategory={() => {}}
          sharedReceiptFullscreenUri={null}
          setSharedReceiptFullscreenUri={() => {}}
          householdSwitcherOpen={householdSwitcherOpen}
          setHouseholdSwitcherOpen={switcher.setHouseholdSwitcherOpen}
          households={households}
          switchToHousehold={switcher.switchToHousehold}
          openInviteSheet={membersHook.openInviteSheet}
          confirmDeleteOrLeaveHousehold={membersHook.confirmDeleteOrLeaveHousehold}
          householdActionBusy={householdActionBusy}
          openCreateHouseholdModal={switcher.openCreateHouseholdModal}
          openJoinHouseholdModal={switcher.openJoinHouseholdModal}
          inviteSheetHousehold={inviteSheetHousehold}
          setInviteSheetHousehold={membersHook.setInviteSheetHousehold}
          handleShareHouseholdInvite={membersHook.handleShareHouseholdInvite}
          newHouseholdModalOpen={newHouseholdModalOpen}
          setNewHouseholdModalOpen={switcher.setNewHouseholdModalOpen}
          newHouseholdName={newHouseholdName}
          setNewHouseholdName={switcher.setNewHouseholdName}
          setNewHouseholdShowInvite={switcher.setNewHouseholdShowInvite}
          isCreatingHousehold={isCreatingHousehold}
          createHouseholdFromSwitcher={switcher.createHouseholdFromSwitcher}
          joinModalOpen={joinModalOpen}
          setJoinModalOpen={switcher.setJoinModalOpen}
          joinCode={joinCode}
          setJoinCode={switcher.setJoinCode}
          isJoiningHousehold={isJoiningHousehold}
          joinHousehold={switcher.joinHousehold}
        />
        {RenameModal}
      </>
    );
  }

  const s = summary.data;
  const r = recurring.data;
  const sh = shared.data;
  const st = settlements.data;

  return (
    <>
      <ScrollView
        ref={mainScrollRef}
        style={[styles.container, { backgroundColor: colors.background }]}
        showsVerticalScrollIndicator={false}
      >
        <View ref={scrollContentRef} collapsable={false}>
          <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <HouseholdHeader
              title={t('household')}
              householdId={activeHouseholdId}
              householdName={householdName}
              membersCount={members.length}
              language={language}
              householdsLength={households.length}
              membersTitleA11y={t('hhMembersTitle')}
              selectHouseholdA11y={t('hhSelectHousehold')}
              renameTitleA11y={t('hhRenameTitle')}
              prevHouseholdA11y={t('hhPrevHouseholdA11y')}
              nextHouseholdA11y={t('hhNextHouseholdA11y')}
              fallbackHouseholdName={t('household')}
              onOpenSwitcher={() => switcher.setHouseholdSwitcherOpen(true)}
              onPromptRename={() =>
                promptRename(
                  activeHouseholdId,
                  (householdName || '').trim() || t('household'),
                  (newName) => switcher.updateHouseholdNameInStore(activeHouseholdId, newName),
                )
              }
              onCycleHousehold={switcher.cycleHousehold}
            />
            <HouseholdSummaryCard
              colors={colors}
              numberLocale={numberLocale}
              currencySymbol={currency.symbol}
              overviewLabel={t('hhOverview')}
              totalMonthlyCosts={s.totalMonthlyCosts}
              paidLabel={t('hhPaid')}
              unpaidLabel={t('hhUnpaid')}
              householdPaidTotal={s.householdPaidTotal}
              householdUnpaidTotal={s.householdUnpaidTotal}
              overviewProgressTrackW={s.overviewProgressTrackW}
              onOverviewProgressTrackLayout={summary.setOverviewProgressTrackW}
              householdPaidPercent={s.householdPaidPercent}
              recurringTotalCount={s.recurringTotalCount}
              recurringFullyPaidCount={s.recurringFullyPaidCount}
              expensesPaidThisMonthLabel={t('hhExpensesPaidThisMonth', {
                paid: s.recurringFullyPaidCount,
                total: s.recurringTotalCount,
              })}
              noEachOwnRecurringThisMonthLabel={t('hhNoEachOwnRecurringThisMonth')}
              singlePayerDueThisMonthTotal={s.singlePayerDueThisMonthTotal}
              singlePayerOverviewLine={t('hhSinglePayerOverviewLine', {
                amount: s.singlePayerDueThisMonthTotal.toLocaleString(numberLocale),
                symbol: currency.symbol,
              })}
              singlePayerGoSettlementLabel={t('hhSinglePayerGoSettlement')}
              onScrollToSettlement={scrollToSettlementSection}
              yourShareTotalLabel={t('hhYourShareTotalLabel')}
              yourShareTotalKc={s.yourShareTotalKc}
              paidTotal={s.paidTotal}
              sharedExpensesMonthLabel={t('hhSharedExpensesMonthLabel', { month: s.sharedMonthLabel })}
              sharedMonthTotal={s.sharedMonthTotal}
              yourShareLabel={t('hhYourShare')}
              sharedMonthYourShare={s.sharedMonthYourShare}
            />
          </LinearGradient>

          {r.notifPermissionDenied ? (
            <View style={[styles.notifBanner, { backgroundColor: colors.muted }]}>
              <Text style={[styles.notifBannerText, { color: colors.textSecondary }]}>{t('hhEnableNotifications')}</Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <View style={[styles.expenseTabBar, { borderBottomColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.expenseTab, activeTab === 'recurring' && { borderBottomColor: colors.primary }]}
                onPress={() => setActiveTab('recurring')}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.expenseTabText,
                    { color: activeTab === 'recurring' ? colors.primary : colors.textSecondary },
                    activeTab === 'recurring' && styles.expenseTabTextActive,
                  ]}
                >
                  {t('hhRecurringExpenses')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.expenseTab, activeTab === 'shared' && { borderBottomColor: colors.primary }]}
                onPress={() => setActiveTab('shared')}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.expenseTabText,
                    { color: activeTab === 'shared' ? colors.primary : colors.textSecondary },
                    activeTab === 'shared' && styles.expenseTabTextActive,
                  ]}
                >
                  {t('hhSharedExpenses')}
                </Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'recurring' ? (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('hhRecurringExpenses')}</Text>
                  <TouchableOpacity style={styles.sectionAction} onPress={recurring.openRecurringCreate}>
                    <PlusCircle color={colors.primary} size={18} />
                    <Text style={[styles.sectionActionText, { color: colors.primary }]}>{t('addAction')}</Text>
                  </TouchableOpacity>
                </View>
                {r.orderedRecurringExpenses.map((item) => (
                  <RecurringExpenseCard
                    key={item.id}
                    item={item}
                    colors={colors}
                    isDark={isDark}
                    numberLocale={numberLocale}
                    currencySymbol={currency.symbol}
                    memberIds={s.memberIds}
                    members={members}
                    currentUserId={user?.id}
                    customCategories={r.customCategories}
                    expandedMultiOcc={!!r.expandedMultiOccIds[item.id]}
                    onToggleMultiOcc={() =>
                      recurring.setExpandedMultiOccIds((prev) => ({
                        ...prev,
                        [item.id]: !prev[item.id],
                      }))
                    }
                    onLongPressReorder={() => recurring.showRecurringReorderAlert(item.id)}
                    onOpenEdit={() => recurring.openRecurringEdit(item)}
                    onDelete={() => recurring.deleteRecurringExpense(item.id)}
                    onSetMyPaid={(dueDate, next) => void recurring.setRecurringMyPaid(item.id, dueDate, next)}
                    t={t}
                  />
                ))}
              </>
            ) : (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('hhSharedExpenses')}</Text>
                  <TouchableOpacity style={styles.sectionAction} onPress={shared.openSharedCreate}>
                    <PlusCircle color={colors.primary} size={18} />
                    <Text style={[styles.sectionActionText, { color: colors.primary }]}>{t('addAction')}</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.sharedMonthNav, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TouchableOpacity onPress={() => shared.shiftSharedMonth(-1)} hitSlop={12} style={styles.sharedMonthArrow}>
                    <ChevronLeft color={colors.primary} size={22} />
                  </TouchableOpacity>
                  <Text style={[styles.sharedMonthLabel, { color: colors.text }]}>{s.sharedMonthLabel}</Text>
                  <TouchableOpacity onPress={() => shared.shiftSharedMonth(1)} hitSlop={12} style={styles.sharedMonthArrow}>
                    <ChevronRight color={colors.primary} size={22} />
                  </TouchableOpacity>
                </View>
                {st.settlementSectionVisible ? (
                  <SettlementSection
                    colors={colors}
                    numberLocale={numberLocale}
                    currencySymbol={currency.symbol}
                    currentUserId={user?.id}
                    members={members}
                    householdSettled={st.householdSettled}
                    simplifiedHouseholdDebts={st.simplifiedHouseholdDebts}
                    householdSettlements={st.householdSettlements}
                    settlementsHistoryOpen={st.settlementsHistoryOpen}
                    onToggleHistory={() => settlements.setSettlementsHistoryOpen((v) => !v)}
                    onOpenSettleTransfer={settlements.openSettleTransfer}
                    onDeleteSettlement={settlements.deleteHouseholdSettlement}
                    settlementSectionRef={settlementSectionRef}
                    t={t}
                  />
                ) : null}
                <SharedExpenseList
                  sharedExpenses={sh.sharedExpenses}
                  colors={colors}
                  isDark={isDark}
                  numberLocale={numberLocale}
                  currencySymbol={currency.symbol}
                  memberIds={s.memberIds}
                  members={members}
                  currentUserId={user?.id}
                  onOpenCreate={shared.openSharedCreate}
                  onOpenEdit={shared.openSharedEdit}
                  onDelete={shared.deleteSharedExpense}
                  onOpenReceipt={(url) => void shared.openSharedReceiptFullscreen(url)}
                  t={t}
                />
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <ExpenseFormModal
        visible={r.recurringModalOpen}
        colors={colors}
        themedInput={themedInput}
        panHandlers={r.recurringSheetPanResponder.panHandlers}
        editingRecurringId={r.editingRecurringId}
        isSaving={r.isSaving}
        newRecurringName={r.newRecurringName}
        setNewRecurringName={recurring.setNewRecurringName}
        newRecurringAmount={r.newRecurringAmount}
        setNewRecurringAmount={recurring.setNewRecurringAmount}
        newRecurringFrequency={r.newRecurringFrequency}
        setNewRecurringFrequency={recurring.setNewRecurringFrequency}
        newRecurringDueWeekday={r.newRecurringDueWeekday}
        setNewRecurringDueWeekday={recurring.setNewRecurringDueWeekday}
        newRecurringDueDay={r.newRecurringDueDay}
        setNewRecurringDueDay={recurring.setNewRecurringDueDay}
        newRecurringDueMonth={r.newRecurringDueMonth}
        setNewRecurringDueMonth={recurring.setNewRecurringDueMonth}
        newRecurringCategory={r.newRecurringCategory}
        setNewRecurringCategory={recurring.setNewRecurringCategory}
        newRecurringSplitType={r.newRecurringSplitType}
        setNewRecurringSplitType={recurring.setNewRecurringSplitType}
        newRecurringMyShare={r.newRecurringMyShare}
        setNewRecurringMyShare={recurring.setNewRecurringMyShare}
        newRecurringPaymentMode={r.newRecurringPaymentMode}
        setNewRecurringPaymentMode={recurring.setNewRecurringPaymentMode}
        newRecurringPayerUserId={r.newRecurringPayerUserId}
        setNewRecurringPayerUserId={recurring.setNewRecurringPayerUserId}
        frequencyOptions={r.frequencyOptions}
        splitTypeOptions={r.splitTypeOptions}
        sortedCustomCategories={r.sortedCustomCategories}
        customCategory={r.customCategory}
        members={members}
        currentUserId={user?.id}
        onClose={recurring.closeRecurringModal}
        onOpenCustomCategoryModal={recurring.openCustomCategoryModal}
        onSubmit={recurring.upsertRecurringExpense}
        t={t}
      />

      <SharedExpenseFormModal
        visible={sh.sharedModalOpen}
        colors={colors}
        themedInput={themedInput}
        panHandlers={sh.sharedSheetPanResponder.panHandlers}
        editingSharedId={sh.editingSharedId}
        isSavingShared={sh.isSavingShared}
        newSharedName={sh.newSharedName}
        setNewSharedName={shared.setNewSharedName}
        newSharedAmount={sh.newSharedAmount}
        setNewSharedAmount={shared.setNewSharedAmount}
        newSharedCategory={sh.newSharedCategory}
        setNewSharedCategory={shared.setNewSharedCategory}
        newSharedDate={sh.newSharedDate}
        setNewSharedDate={shared.setNewSharedDate}
        showSharedDatePicker={sh.showSharedDatePicker}
        setShowSharedDatePicker={shared.setShowSharedDatePicker}
        newSharedPaidBy={sh.newSharedPaidBy}
        setNewSharedPaidBy={shared.setNewSharedPaidBy}
        newSharedPaymentMode={sh.newSharedPaymentMode}
        setNewSharedPaymentMode={shared.setNewSharedPaymentMode}
        newSharedSplitType={sh.newSharedSplitType}
        setNewSharedSplitType={shared.setNewSharedSplitType}
        newSharedSplitPercent={sh.newSharedSplitPercent}
        setNewSharedSplitPercent={shared.setNewSharedSplitPercent}
        newSharedReceiptUri={sh.newSharedReceiptUri}
        newSharedExistingReceiptUrl={sh.newSharedExistingReceiptUrl}
        setNewSharedReceiptUri={shared.setNewSharedReceiptUri}
        setNewSharedExistingReceiptUrl={shared.setNewSharedExistingReceiptUrl}
        sharedSplitTypeOptions={sh.sharedSplitTypeOptions}
        members={members}
        currentUserId={user?.id}
        numberLocale={numberLocale}
        closeSharedModal={shared.closeSharedModal}
        pickSharedReceipt={shared.pickSharedReceipt}
        upsertSharedExpense={shared.upsertSharedExpense}
        onOpenExistingReceipt={(url) => void shared.openSharedReceiptFullscreen(url)}
        t={t}
      />

      <HouseholdOverlayModals
        colors={colors}
        themedInput={themedInput}
        t={t}
        settleModal={st.settleModal}
        setSettleModal={settlements.setSettleModal}
        settleAmountText={st.settleAmountText}
        setSettleAmountText={settlements.setSettleAmountText}
        settleNoteText={st.settleNoteText}
        setSettleNoteText={settlements.setSettleNoteText}
        isSavingSettlement={st.isSavingSettlement}
        submitHouseholdSettlement={settlements.submitHouseholdSettlement}
        customCategoryModalOpen={r.customCategoryModalOpen}
        closeCustomCategoryModal={recurring.closeCustomCategoryModal}
        newCustomCategoryName={r.newCustomCategoryName}
        setNewCustomCategoryName={recurring.setNewCustomCategoryName}
        newCustomCategoryEmoji={r.newCustomCategoryEmoji}
        setNewCustomCategoryEmoji={recurring.setNewCustomCategoryEmoji}
        householdId={activeHouseholdId}
        userId={user?.id}
        setCustomCategory={recurring.setCustomCategory}
        setNewRecurringCategory={recurring.setNewRecurringCategory}
        submitCustomCategory={recurring.submitCustomCategory}
        sharedReceiptFullscreenUri={sh.sharedReceiptFullscreenUri}
        setSharedReceiptFullscreenUri={shared.setSharedReceiptFullscreenUri}
        householdSwitcherOpen={householdSwitcherOpen}
        setHouseholdSwitcherOpen={switcher.setHouseholdSwitcherOpen}
        households={households}
        switchToHousehold={switcher.switchToHousehold}
        openInviteSheet={membersHook.openInviteSheet}
        confirmDeleteOrLeaveHousehold={membersHook.confirmDeleteOrLeaveHousehold}
        householdActionBusy={householdActionBusy}
        openCreateHouseholdModal={switcher.openCreateHouseholdModal}
        openJoinHouseholdModal={switcher.openJoinHouseholdModal}
        inviteSheetHousehold={inviteSheetHousehold}
        setInviteSheetHousehold={membersHook.setInviteSheetHousehold}
        handleShareHouseholdInvite={membersHook.handleShareHouseholdInvite}
        newHouseholdModalOpen={newHouseholdModalOpen}
        setNewHouseholdModalOpen={switcher.setNewHouseholdModalOpen}
        newHouseholdName={newHouseholdName}
        setNewHouseholdName={switcher.setNewHouseholdName}
        setNewHouseholdShowInvite={switcher.setNewHouseholdShowInvite}
        isCreatingHousehold={isCreatingHousehold}
        createHouseholdFromSwitcher={switcher.createHouseholdFromSwitcher}
        joinModalOpen={joinModalOpen}
        setJoinModalOpen={switcher.setJoinModalOpen}
        joinCode={joinCode}
        setJoinCode={switcher.setJoinCode}
        isJoiningHousehold={isJoiningHousehold}
        joinHousehold={switcher.joinHousehold}
      />
      {RenameModal}
    </>
  );
}

export default function HouseholdTabScreen() {
  return (
    <PremiumGateScreen feature="household">
      <HouseholdTabScreenContent />
    </PremiumGateScreen>
  );
}

const emptyStyles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 22,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  heroSubtitle: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 16,
    gap: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    paddingTop: 4,
  },
  benefitsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
  },
  benefitCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 8,
  },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
  },
  primaryBtnGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtn: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  footnote: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
});
