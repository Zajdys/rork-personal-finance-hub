import React from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import type { DailyTipArticle } from '@/constants/daily-tip-articles';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';

type Props = {
  visible: boolean;
  onClose: () => void;
  article: DailyTipArticle | null;
};

export default function DailyTipArticleModal({
  visible,
  onClose,
  article,
}: Props) {
  const { colors } = useTheme();
  const { t } = useLanguageStore();
  const insets = useSafeAreaInsets();
  const sheetBg = colors.surface;
  const overlay = colors.overlay;
  const titleColor = colors.text;
  const bodyColor = colors.textSecondary;
  const borderColor = colors.border;
  const closeBg = colors.muted;

  if (!article) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        style={[styles.overlay, { backgroundColor: overlay }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('close')}
      >
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: sheetBg,
              borderColor,
              maxHeight: '88%',
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView
            showsVerticalScrollIndicator
            bounces
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 24) },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.header}>
              <Text
                style={[styles.title, { color: titleColor }]}
                accessibilityRole="header"
              >
                {article.title}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.closeBtn, { backgroundColor: closeBg }]}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t('dailyTipCloseArticle')}
              >
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {article.paragraphs.map((p, i) => (
              <Text
                key={i}
                style={[styles.paragraph, { color: bodyColor }]}
              >
                {p}
              </Text>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 22,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 26,
    marginBottom: 16,
  },
});
