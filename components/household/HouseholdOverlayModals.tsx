import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { Image } from 'expo-image';
import {
  Check,
  KeyRound,
  LogOut,
  PlusCircle,
  Share2,
  Trash2,
  UserPlus,
} from 'lucide-react-native';
import { householdEmoji, type UserHousehold } from '@/store/household-active-store';
import type { ThemeColors } from '@/constants/theme-colors';
import { useLanguageStore } from '@/store/language-store';
import { CUSTOM_CATEGORY_EMOJI_OPTIONS } from '@/hooks/household/utils';
import { householdStyles as styles } from './styles';

type TranslateFn = ReturnType<typeof useLanguageStore.getState>['t'];

export type HouseholdOverlayModalsProps = {
  colors: ThemeColors;
  themedInput: StyleProp<TextStyle>;
  t: TranslateFn;
  // settle
  settleModal: { fromUserId: string; toUserId: string; amountExact: number; prefillDisplayKc: number } | null;
  setSettleModal: (v: { fromUserId: string; toUserId: string; amountExact: number; prefillDisplayKc: number } | null) => void;
  settleAmountText: string;
  setSettleAmountText: (v: string) => void;
  settleNoteText: string;
  setSettleNoteText: (v: string) => void;
  isSavingSettlement: boolean;
  submitHouseholdSettlement: () => void;
  // custom category
  customCategoryModalOpen: boolean;
  closeCustomCategoryModal: () => void;
  newCustomCategoryName: string;
  setNewCustomCategoryName: (v: string) => void;
  newCustomCategoryEmoji: string;
  setNewCustomCategoryEmoji: (v: string) => void;
  householdId: string | null;
  userId: string | undefined;
  setCustomCategory: (v: { name: string; emoji: string } | null) => void;
  setNewRecurringCategory: (v: string) => void;
  submitCustomCategory: () => void;
  // receipt fullscreen
  sharedReceiptFullscreenUri: string | null;
  setSharedReceiptFullscreenUri: (v: string | null) => void;
  // switcher
  householdSwitcherOpen: boolean;
  setHouseholdSwitcherOpen: (v: boolean) => void;
  households: UserHousehold[];
  switchToHousehold: (id: string) => void;
  openInviteSheet: (item: UserHousehold) => void;
  confirmDeleteOrLeaveHousehold: (item: UserHousehold) => void;
  householdActionBusy: boolean;
  openCreateHouseholdModal: () => void;
  openJoinHouseholdModal: () => void;
  // invite
  inviteSheetHousehold: UserHousehold | null;
  setInviteSheetHousehold: (v: UserHousehold | null) => void;
  handleShareHouseholdInvite: () => void;
  // create
  newHouseholdModalOpen: boolean;
  setNewHouseholdModalOpen: (v: boolean) => void;
  newHouseholdName: string;
  setNewHouseholdName: (v: string) => void;
  setNewHouseholdShowInvite: (v: boolean) => void;
  isCreatingHousehold: boolean;
  createHouseholdFromSwitcher: () => void;
  // join
  joinModalOpen: boolean;
  setJoinModalOpen: (v: boolean) => void;
  joinCode: string;
  setJoinCode: (v: string) => void;
  isJoiningHousehold: boolean;
  joinHousehold: () => void;
};

export function HouseholdOverlayModals(p: HouseholdOverlayModalsProps) {
  const {
    colors,
    themedInput,
    t,
    settleModal,
    setSettleModal,
    settleAmountText,
    setSettleAmountText,
    settleNoteText,
    setSettleNoteText,
    isSavingSettlement,
    submitHouseholdSettlement,
    customCategoryModalOpen,
    closeCustomCategoryModal,
    newCustomCategoryName,
    setNewCustomCategoryName,
    newCustomCategoryEmoji,
    setNewCustomCategoryEmoji,
    householdId,
    userId: userIdProp,
    setCustomCategory,
    setNewRecurringCategory,
    submitCustomCategory,
    sharedReceiptFullscreenUri,
    setSharedReceiptFullscreenUri,
    householdSwitcherOpen,
    setHouseholdSwitcherOpen,
    households,
    switchToHousehold,
    openInviteSheet,
    confirmDeleteOrLeaveHousehold,
    householdActionBusy,
    openCreateHouseholdModal,
    openJoinHouseholdModal,
    inviteSheetHousehold,
    setInviteSheetHousehold,
    handleShareHouseholdInvite,
    newHouseholdModalOpen,
    setNewHouseholdModalOpen,
    newHouseholdName,
    setNewHouseholdName,
    setNewHouseholdShowInvite,
    isCreatingHousehold,
    createHouseholdFromSwitcher,
    joinModalOpen,
    setJoinModalOpen,
    joinCode,
    setJoinCode,
    isJoiningHousehold,
    joinHousehold,
  } = p;

  const user = userIdProp ? { id: userIdProp } : null;

  return (
    <>
    <Modal
      visible={settleModal != null}
      transparent
      animationType="fade"
      onRequestClose={() => setSettleModal(null)}
    >
      <View style={styles.modalRoot}>
        <Pressable
          style={[styles.modalBackdropPressable, { backgroundColor: colors.overlay }]}
          onPress={() => setSettleModal(null)}
        />
        <View style={[styles.settleConfirmCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.modalTitleInHeader, { color: colors.text, marginBottom: 12 }]}>
            {t('hhSettlementConfirmTitle')}
          </Text>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('hhAmountCzk')}</Text>
          <TextInput
            style={themedInput}
            value={settleAmountText}
            onChangeText={setSettleAmountText}
            keyboardType="decimal-pad"
            placeholderTextColor={colors.textSecondary}
          />
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('hhSettlementNoteOptional')}</Text>
          <TextInput
            style={themedInput}
            value={settleNoteText}
            onChangeText={setSettleNoteText}
            placeholder={t('hhSettlementNotePlaceholder')}
            placeholderTextColor={colors.textSecondary}
          />
          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: colors.primary, marginTop: 8 },
              isSavingSettlement && { opacity: 0.6 },
            ]}
            onPress={() => void submitHouseholdSettlement()}
            disabled={isSavingSettlement}
          >
            <Text style={styles.primaryButtonText}>{t('hhSettlementSettle')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: colors.muted }]}
            onPress={() => setSettleModal(null)}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    <Modal
      visible={customCategoryModalOpen}
      transparent
      animationType="fade"
      onRequestClose={closeCustomCategoryModal}
      onDismiss={closeCustomCategoryModal}
    >
      <View style={[styles.customCategoryOverlay, { backgroundColor: colors.background }]}>
        <Pressable
          style={[styles.customCategoryBackdrop, { backgroundColor: colors.overlay }]}
          onPress={closeCustomCategoryModal}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        />
        <View style={[styles.customCategoryDialog, { backgroundColor: colors.card }]}>
          <Text style={[styles.modalTitleInHeader, { color: colors.text, marginBottom: 16 }]} numberOfLines={2}>
            {t('hhCustomCategoryTitle')}
          </Text>
          <TextInput
            style={themedInput}
            placeholder={t('hhCategoryNamePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={newCustomCategoryName}
            onChangeText={setNewCustomCategoryName}
          />
          <Text style={[styles.fieldLabel, { color: colors.text }]}>{t('hhIcon')}</Text>
          <ScrollView
            style={styles.emojiGridScroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.emojiGrid}>
              {CUSTOM_CATEGORY_EMOJI_OPTIONS.map((em) => {
                const selected = newCustomCategoryEmoji === em;
                return (
                  <TouchableOpacity
                    key={em}
                    style={[
                      styles.emojiCell,
                      { backgroundColor: colors.muted, borderColor: colors.border },
                      selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => setNewCustomCategoryEmoji(em)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.emojiCellText}>{em}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: colors.primary },
              !newCustomCategoryName.trim() && { opacity: 0.5 },
            ]}
            onPress={() => {
              const name = newCustomCategoryName.trim();
              if (!name) return;
              if (!householdId || !user) {
                setCustomCategory({ name, emoji: newCustomCategoryEmoji });
                setNewRecurringCategory(name);
                closeCustomCategoryModal();
                return;
              }
              void submitCustomCategory();
            }}
            disabled={!newCustomCategoryName.trim()}
          >
            <Text style={styles.primaryButtonText}>{t('confirm')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: colors.muted }]} onPress={closeCustomCategoryModal}>
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    <Modal
      visible={sharedReceiptFullscreenUri != null}
      transparent
      animationType="fade"
      onRequestClose={() => setSharedReceiptFullscreenUri(null)}
    >
      <View style={styles.receiptFsRoot}>
        <TouchableOpacity
          style={styles.receiptFsClose}
          onPress={() => setSharedReceiptFullscreenUri(null)}
          hitSlop={12}
          activeOpacity={0.85}
        >
          <Text style={styles.receiptFsCloseText}>{t('close')}</Text>
        </TouchableOpacity>
        {sharedReceiptFullscreenUri ? (
          <Image
            source={{ uri: sharedReceiptFullscreenUri }}
            style={styles.receiptFsImage}
            contentFit="contain"
          />
        ) : null}
      </View>
    </Modal>
  <Modal
    visible={householdSwitcherOpen}
    transparent
    animationType="fade"
    onRequestClose={() => setHouseholdSwitcherOpen(false)}
  >
    <View style={styles.switcherBackdrop}>
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={() => setHouseholdSwitcherOpen(false)}
        accessibilityRole="button"
        accessibilityLabel={t('close')}
      />
      <View style={[styles.switcherSheet, { backgroundColor: colors.card }]}>
        <Text style={[styles.switcherSheetTitle, { color: colors.text }]}>{t('hhSelectHousehold')}</Text>
        <ScrollView style={styles.switcherList} keyboardShouldPersistTaps="handled">
          {households.map((item) => {
            const selected = item.id === householdId;
            const isCreator = !!user?.id && item.createdBy === user.id;
            return (
              <View
                key={item.id}
                style={[
                  styles.switcherRow,
                  { borderColor: colors.border },
                  selected && { backgroundColor: colors.muted },
                ]}
              >
                <TouchableOpacity
                  style={styles.switcherRowMain}
                  onPress={() => void switchToHousehold(item.id)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.switcherRowEmoji}>{householdEmoji(item.id)}</Text>
                  <Text style={[styles.switcherRowLabel, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {selected ? <Check color={colors.primary} size={20} strokeWidth={2.5} /> : null}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.switcherIconBtn}
                  onPress={() => {
                    // Stejná openInviteSheet(household) jako v headeru — řádek `item`, ne aktivní HH.
                    // Nejdřív zavřít switcher: na iOS/Android nejde spolehlivě stackovat 2 Modal najednou.
                    const household = item;
                    setHouseholdSwitcherOpen(false);
                    requestAnimationFrame(() => {
                      void openInviteSheet(household);
                    });
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('hhInvite')}
                  disabled={householdActionBusy}
                >
                  <UserPlus color={colors.primary} size={20} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.switcherIconBtn}
                  onPress={() => confirmDeleteOrLeaveHousehold(item)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={isCreator ? t('hhDeleteHousehold') : t('hhLeaveHousehold')}
                  disabled={householdActionBusy}
                >
                  {isCreator ? (
                    <Trash2 color={colors.error} size={20} />
                  ) : (
                    <LogOut color={colors.error} size={20} />
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
          <TouchableOpacity
            style={[styles.switcherCreateRow, { borderColor: colors.primary }]}
            onPress={openCreateHouseholdModal}
            activeOpacity={0.85}
          >
            <PlusCircle color={colors.primary} size={20} />
            <Text style={[styles.switcherCreateText, { color: colors.primary }]}>{t('hhNewHousehold')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.switcherCreateRow, { borderColor: colors.border, marginTop: 8 }]}
            onPress={openJoinHouseholdModal}
            activeOpacity={0.85}
          >
            <KeyRound color={colors.text} size={20} />
            <Text style={[styles.switcherCreateText, { color: colors.text }]}>{t('hhJoinByCode')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  </Modal>

  <Modal
    visible={inviteSheetHousehold != null}
    transparent
    animationType="slide"
    onRequestClose={() => setInviteSheetHousehold(null)}
  >
    <Pressable style={styles.inviteSheetBackdrop} onPress={() => setInviteSheetHousehold(null)}>
      <Pressable
        style={[styles.inviteSheet, { backgroundColor: colors.card }]}
        onPress={() => {}}
      >
        <View style={styles.inviteSheetHandle} />
        <Text style={[styles.switcherSheetTitle, { color: colors.text }]}>{t('hhInvitePartnerTitle')}</Text>
        <Text style={[styles.inviteSheetHint, { color: colors.textSecondary }]}>
          {t('hhInviteCodeHint')}
        </Text>
        <Text style={[styles.inviteSheetCode, { color: colors.text }]} selectable>
          {inviteSheetHousehold?.inviteCode ?? '——'}
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, styles.inviteShareBtn, { backgroundColor: colors.primary }]}
          onPress={() => void handleShareHouseholdInvite()}
          disabled={!inviteSheetHousehold?.inviteCode}
        >
          <Share2 color={colors.onPrimary} size={18} />
          <Text style={styles.primaryButtonText}>{t('hhShare')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryButton, { backgroundColor: colors.muted }]}
          onPress={() => setInviteSheetHousehold(null)}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>{t('close')}</Text>
        </TouchableOpacity>
      </Pressable>
    </Pressable>
  </Modal>

  <Modal
    visible={newHouseholdModalOpen}
    transparent
    animationType="slide"
    onRequestClose={() => setNewHouseholdModalOpen(false)}
  >
    <Pressable style={styles.switcherBackdrop} onPress={() => setNewHouseholdModalOpen(false)}>
      <Pressable style={[styles.switcherSheet, { backgroundColor: colors.card }]} onPress={() => {}}>
        <Text style={[styles.switcherSheetTitle, { color: colors.text }]}>{t('hhCreateNewHousehold')}</Text>
        <TextInput
          style={themedInput}
          placeholder={t('hhHouseholdNamePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={newHouseholdName}
          onChangeText={setNewHouseholdName}
        />
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 12 }, (!newHouseholdName.trim() || isCreatingHousehold) && { opacity: 0.5 }]}
          onPress={() => void createHouseholdFromSwitcher()}
          disabled={!newHouseholdName.trim() || isCreatingHousehold}
        >
          {isCreatingHousehold ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>{t('hhCreate')}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryButton, { backgroundColor: colors.muted }]}
          onPress={() => {
            setNewHouseholdModalOpen(false);
            setNewHouseholdName('');
            setNewHouseholdShowInvite(false);
          }}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>{t('cancel')}</Text>
        </TouchableOpacity>
      </Pressable>
    </Pressable>
  </Modal>

  <Modal
    visible={joinModalOpen}
    transparent
    animationType="slide"
    onRequestClose={() => setJoinModalOpen(false)}
  >
    <Pressable style={styles.switcherBackdrop} onPress={() => setJoinModalOpen(false)}>
      <Pressable style={[styles.switcherSheet, { backgroundColor: colors.card }]} onPress={() => {}}>
        <Text style={[styles.switcherSheetTitle, { color: colors.text }]}>{t('hhJoinModalTitle')}</Text>
        <TextInput
          style={themedInput}
          placeholder={t('hhJoinCodePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={joinCode}
          onChangeText={setJoinCode}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 12 }, (!joinCode || isJoiningHousehold) && { opacity: 0.5 }]}
          onPress={() => void joinHousehold()}
          disabled={!joinCode || isJoiningHousehold}
        >
          {isJoiningHousehold ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>{t('hhJoin')}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryButton, { backgroundColor: colors.muted }]}
          onPress={() => {
            setJoinModalOpen(false);
            setJoinCode('');
          }}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>{t('cancel')}</Text>
        </TouchableOpacity>
      </Pressable>
    </Pressable>
  </Modal>

    </>
  );
}
