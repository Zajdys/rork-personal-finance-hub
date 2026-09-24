import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { householdEmoji } from '@/store/household-active-store';
import { formatHouseholdMemberCountLabel } from '@/lib/plural-cs';

type HouseholdHeaderProps = {
  title: string;
  householdId: string | null;
  householdName: string;
  membersCount: number;
  language: string;
  householdsLength: number;
  membersTitleA11y: string;
  selectHouseholdA11y: string;
  renameTitleA11y: string;
  prevHouseholdA11y: string;
  nextHouseholdA11y: string;
  fallbackHouseholdName: string;
  onOpenSwitcher: () => void;
  onPromptRename: () => void;
  onCycleHousehold: (delta: -1 | 1) => void;
};

export function HouseholdHeader({
  title,
  householdId,
  householdName,
  membersCount,
  language,
  householdsLength,
  membersTitleA11y,
  selectHouseholdA11y,
  renameTitleA11y,
  prevHouseholdA11y,
  nextHouseholdA11y,
  fallbackHouseholdName,
  onOpenSwitcher,
  onPromptRename,
  onCycleHousehold,
}: HouseholdHeaderProps) {
  const router = useRouter();

  return (
    <>
      <View style={styles.headerTop}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>{title}</Text>
          {householdId ? (
            <View style={styles.headerTitleActions}>
              <TouchableOpacity
                style={styles.headerRenameBtn}
                onPress={() =>
                  router.push({
                    pathname: '/household-members',
                    params: { householdId },
                  })
                }
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={membersTitleA11y}
              >
                <Users color="white" size={20} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerRenameBtn}
                onPress={onOpenSwitcher}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={selectHouseholdA11y}
              >
                <Plus color="white" size={20} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerRenameBtn}
                onPress={onPromptRename}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={renameTitleA11y}
              >
                <Pencil color="white" size={20} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>

      <View
        style={[
          styles.householdNavRow,
          { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.28)' },
        ]}
      >
        <TouchableOpacity
          onPress={() => onCycleHousehold(-1)}
          style={[styles.householdNavHit, householdsLength <= 1 && styles.householdNavHitDisabled]}
          hitSlop={8}
          disabled={householdsLength <= 1}
          accessibilityRole="button"
          accessibilityLabel={prevHouseholdA11y}
        >
          <ChevronLeft color="white" size={24} />
        </TouchableOpacity>
        <View style={styles.householdNavCenter}>
          <TouchableOpacity
            style={styles.householdNavTitleHit}
            onPress={() => {
              if (!householdId) return;
              router.push({
                pathname: '/household-members',
                params: { householdId },
              });
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={membersTitleA11y}
          >
            <Text style={styles.householdNavTitle} numberOfLines={1}>
              {householdEmoji(householdId ?? '')}{' '}
              {formatHouseholdMemberCountLabel(
                (householdName || '').trim().toLowerCase() === 'idk' || !(householdName || '').trim()
                  ? fallbackHouseholdName
                  : householdName,
                membersCount,
                language === 'en' ? 'en' : 'cs',
              )}
            </Text>
            <ChevronDown color="rgba(255,255,255,0.9)" size={18} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => onCycleHousehold(1)}
          style={[styles.householdNavHit, householdsLength <= 1 && styles.householdNavHitDisabled]}
          hitSlop={8}
          disabled={householdsLength <= 1}
          accessibilityRole="button"
          accessibilityLabel={nextHouseholdA11y}
        >
          <ChevronRight color="white" size={24} />
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  headerTop: { flexDirection: 'row', alignItems: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerTitleActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerRenameBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: 'white', flexShrink: 1 },
  householdNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  householdNavHit: {
    padding: 4,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  householdNavHitDisabled: { opacity: 0.35 },
  householdNavCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  householdNavTitleHit: {
    flexShrink: 1,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  householdNavTitle: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
