import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, X } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { resolveSplitReceiptDisplayUrl } from '@/lib/split-receipt-upload';

type Props = {
  receiptPath: string | null;
  pendingLocalUri: string | null;
  onPendingLocalUriChange: (uri: string | null) => void;
  onRemoveStored?: () => void;
  disabled?: boolean;
};

export function SplitExpenseReceiptField({
  receiptPath,
  pendingLocalUri,
  onPendingLocalUriChange,
  onRemoveStored,
  disabled,
}: Props) {
  const { colors, isDark } = useTheme();
  const { t } = useLanguageStore();
  const [storedPreviewUrl, setStoredPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (pendingLocalUri || !receiptPath) {
      setStoredPreviewUrl(null);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    void resolveSplitReceiptDisplayUrl(receiptPath).then((url) => {
      if (!cancelled) {
        setStoredPreviewUrl(url);
        setLoadingPreview(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pendingLocalUri, receiptPath]);

  const previewUri = pendingLocalUri ?? storedPreviewUrl;
  const hasReceipt = Boolean(previewUri);

  const pickFromCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('errorMessage'), t('cameraPermissionNeeded'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      onPendingLocalUriChange(result.assets[0].uri);
    }
  }, [onPendingLocalUriChange, t]);

  const pickFromGallery = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('errorMessage'), t('galleryPermissionNeeded'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      onPendingLocalUriChange(result.assets[0].uri);
    }
  }, [onPendingLocalUriChange, t]);

  const pickReceipt = useCallback(() => {
    if (disabled) return;
    Alert.alert(t('splitExpenseAddReceipt'), undefined, [
      { text: t('takePhoto'), onPress: () => void pickFromCamera() },
      { text: t('editProfile.gallery'), onPress: () => void pickFromGallery() },
      { text: t('cancel'), style: 'cancel' },
    ]);
  }, [disabled, pickFromCamera, pickFromGallery, t]);

  const clearReceipt = useCallback(() => {
    if (pendingLocalUri) {
      onPendingLocalUriChange(null);
      return;
    }
    if (receiptPath && onRemoveStored) {
      onRemoveStored();
    }
  }, [onPendingLocalUriChange, onRemoveStored, pendingLocalUri, receiptPath]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('splitExpenseReceipt')}</Text>
      {hasReceipt ? (
        <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Image source={{ uri: previewUri! }} style={styles.previewImage} resizeMode="cover" />
          {!disabled ? (
            <TouchableOpacity
              style={[styles.removeBtn, { backgroundColor: colors.overlay }]}
              onPress={clearReceipt}
              hitSlop={8}
            >
              <X color="white" size={16} />
            </TouchableOpacity>
          ) : null}
          {loadingPreview && !pendingLocalUri ? (
            <View style={styles.previewLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
        </View>
      ) : null}
      {!disabled ? (
        <TouchableOpacity
          style={[
            styles.addBtn,
            {
              backgroundColor: isDark ? colors.muted : colors.card,
              borderColor: colors.border,
            },
          ]}
          onPress={pickReceipt}
          activeOpacity={0.85}
        >
          <Camera color={colors.primary} size={18} />
          <Text style={[styles.addBtnText, { color: colors.primary }]}>
            {hasReceipt ? t('splitExpenseChangeReceipt') : t('splitExpenseAddReceipt')}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  previewCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
    position: 'relative',
  },
  previewImage: { width: '100%', height: 180 },
  previewLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  addBtnText: { fontSize: 14, fontWeight: '700' },
});
