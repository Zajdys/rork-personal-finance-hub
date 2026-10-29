import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Stack } from 'expo-router';
import { safePush } from '@/lib/safe-navigate';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, Settings, PiggyBank, Pencil } from 'lucide-react-native';
import { useHousehold } from '@/store/household-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useHouseholdRenamePrompt } from '@/hooks/use-household-rename-prompt';
import { ScreenHeader } from '@/components/ScreenHeader';

/**
 * Orphan stack screen — bez mock dat.
 * Reálný přehled sdílených výdajů/vyrovnání je na záložce Domácnost.
 */
export default function HouseholdOverviewScreen() {
  const { currentHousehold, isInHousehold, renameHousehold, refetch } = useHousehold();
  const { getCurrentCurrency } = useSettingsStore();
  const { t } = useLanguageStore();
  const { promptRename, RenameModal } = useHouseholdRenamePrompt();
  const currency = getCurrentCurrency();

  if (!isInHousehold || !currentHousehold) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader title={t('screenHouseholdOverview')} fallback="/(tabs)/household" />
        <View style={styles.emptyState}>
          <Users size={80} color="#8B5CF6" strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>{t('hhEmptyHeroTitle')}</Text>
          <Text style={styles.emptySubtitle}>{t('hhOverviewNotInHousehold')}</Text>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => safePush('/(tabs)/household')}
          >
            <Text style={styles.settingsButtonText}>{t('hhOverviewCreateHousehold')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const totalBudget = currentHousehold.categoryBudgets
    ? Object.values(currentHousehold.categoryBudgets).reduce(
        (sum, b) => sum + (b.monthlyLimit || 0),
        0,
      )
    : 0;

  const memberNames = currentHousehold.members.map((m) => m.userName).filter(Boolean);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title={currentHousehold.name}
        subtitle={t('household')}
        variant="gradient"
        gradientColors={['#8B5CF6', '#7C3AED']}
        fallback="/(tabs)/household"
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              style={styles.headerRenameBtn}
              onPress={() =>
                promptRename(currentHousehold.id, currentHousehold.name, (newName) => {
                  renameHousehold(currentHousehold.id, newName);
                  refetch();
                })
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={t('hhRenameTitle')}
            >
              <Pencil color="#FFF" size={18} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => safePush('/(tabs)/household')}
            >
              <Settings size={24} color="#FFF" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        }
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <View style={styles.budgetCard}>
            <PiggyBank size={28} color="#8B5CF6" strokeWidth={2} />
            <Text style={styles.budgetLabel}>{t('hhOverviewTotalBudget')}</Text>
            <Text style={styles.budgetValue}>
              {totalBudget.toLocaleString('cs-CZ')} {currency.symbol}
            </Text>
            <Text style={styles.budgetSubtext}>{t('hhOverviewSharedBudget')}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('hhOverviewMemberBalances')}</Text>
          {memberNames.length === 0 ? (
            <Text style={styles.hint}>{t('hhMembersEmpty')}</Text>
          ) : (
            <View style={styles.memberList}>
              {currentHousehold.members.map((m) => (
                <View key={m.userId} style={styles.memberRow}>
                  <View style={styles.balanceAvatar}>
                    <Text style={styles.balanceAvatarText}>
                      {m.userName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.balanceName}>{m.userName}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.hint}>{t('hhOverviewGoToTabHint')}</Text>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.advancedButton}
            onPress={() => safePush('/(tabs)/household')}
          >
            <Settings size={18} color="#8B5CF6" strokeWidth={2} />
            <Text style={styles.advancedButtonText}>{t('hhOverviewAdvancedSettings')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      {RenameModal}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  settingsButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  settingsButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  headerRenameBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#1F2937',
    marginBottom: 12,
  },
  budgetCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  budgetLabel: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
  },
  budgetValue: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '700' as const,
    color: '#1F2937',
  },
  budgetSubtext: {
    marginTop: 4,
    fontSize: 13,
    color: '#9CA3AF',
  },
  memberList: {
    gap: 10,
    marginBottom: 12,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
  },
  balanceAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceAvatarText: {
    color: '#FFF',
    fontWeight: '700' as const,
  },
  balanceName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#1F2937',
  },
  hint: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  advancedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F3E8FF',
    borderRadius: 12,
    paddingVertical: 14,
  },
  advancedButtonText: {
    color: '#8B5CF6',
    fontSize: 15,
    fontWeight: '600' as const,
  },
});
