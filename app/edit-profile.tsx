import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/store/auth-store';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { updateUserProfileFields, updateUserMonthlyIncome } from '@/lib/user-profile-supabase';
import { Image } from 'expo-image';
import { safeGoBack } from '@/lib/safe-back';
import { parseMoneyInput } from '@/lib/parse-money-input';

async function resizeAvatarUri(uri: string, width?: number, height?: number): Promise<string> {
  const w = width ?? 1024;
  const h = height ?? 1024;
  const actions: ImageManipulator.Action[] = [];
  if (w > 500 || h > 500) {
    if (w >= h) {
      actions.push({ resize: { width: 500 } });
    } else {
      actions.push({ resize: { height: 500 } });
    }
  }
  const out = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return out.uri;
}

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t } = useLanguageStore();
  const userProfile = useSettingsStore((s) => s.userProfile);
  const setUserProfile = useSettingsStore((s) => s.setUserProfile);

  const [firstName, setFirstName] = useState(userProfile.firstName);
  const [lastName, setLastName] = useState(userProfile.lastName);
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [localPreviewUri, setLocalPreviewUri] = useState<string | null>(null);
  const [pendingUploadUri, setPendingUploadUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFirstName(userProfile.firstName);
    setLastName(userProfile.lastName);
  }, [userProfile.firstName, userProfile.lastName]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void supabase
      .from('users')
      .select('monthly_income')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const v = data?.monthly_income;
        setMonthlyIncome(v == null || v === '' ? '' : String(v));
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const pickImage = useCallback(async (source: 'library' | 'camera') => {
    if (source === 'library') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('editProfile.accessDenied'), t('editProfile.photosPermission'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: Platform.OS !== 'web',
        aspect: [1, 1],
        quality: 1,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      try {
        const uri = await resizeAvatarUri(asset.uri, asset.width, asset.height);
        setLocalPreviewUri(uri);
        setPendingUploadUri(uri);
      } catch (e) {
        console.error(e);
        Alert.alert(t('error'), t('editProfile.photoEditFailed'));
      }
    } else {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('editProfile.accessDenied'), t('editProfile.cameraPermission'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: Platform.OS !== 'web',
        aspect: [1, 1],
        quality: 1,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      try {
        const uri = await resizeAvatarUri(asset.uri, asset.width, asset.height);
        setLocalPreviewUri(uri);
        setPendingUploadUri(uri);
      } catch (e) {
        console.error(e);
        Alert.alert(t('error'), t('editProfile.photoEditFailed'));
      }
    }
  }, [t]);

  const onChoosePhoto = useCallback(() => {
    if (Platform.OS === 'web') {
      void pickImage('library');
      return;
    }
    Alert.alert(t('editProfile.profilePhoto'), t('editProfile.chooseSource'), [
      { text: t('editProfile.gallery'), onPress: () => void pickImage('library') },
      { text: t('editProfile.camera'), onPress: () => void pickImage('camera') },
      { text: t('cancel'), style: 'cancel' },
    ]);
  }, [pickImage, t]);

  const save = useCallback(async () => {
    if (!user?.id) {
      Alert.alert(t('error'), t('editProfile.notLoggedIn'));
      return;
    }
    setSaving(true);
    try {
      let nextAvatarUrl = userProfile.avatarUrl;
      const fields: {
        first_name: string | null;
        last_name: string | null;
        avatar_url?: string | null;
      } = {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
      };

      if (pendingUploadUri) {
        const path = `${user.id}/avatar.jpg`;
        let uploadBody: Blob | ArrayBuffer;
        if (Platform.OS === 'web') {
          const response = await fetch(pendingUploadUri);
          uploadBody = await response.blob();
        } else {
          const base64 = await FileSystem.readAsStringAsync(pendingUploadUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          uploadBody = decode(base64);
        }
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, uploadBody, {
          contentType: 'image/jpeg',
          upsert: true,
        });
        if (upErr) {
          throw new Error(upErr.message);
        }
        const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
        nextAvatarUrl = pub.publicUrl;
        fields.avatar_url = nextAvatarUrl;
      }

      const monthlyIncomeDb: string | null =
        monthlyIncome.trim() === ''
          ? null
          : (() => {
              const n = parseMoneyInput(monthlyIncome);
              return n == null ? null : String(n);
            })();

      const [profileRes, incomeRes] = await Promise.all([
        updateUserProfileFields(user.id, fields),
        updateUserMonthlyIncome(user.id, monthlyIncomeDb),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (incomeRes.error) throw incomeRes.error;

      setUserProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        avatarUrl: nextAvatarUrl,
      });
      setPendingUploadUri(null);
      safeGoBack();
    } catch (e) {
      console.error(e);
      Alert.alert(t('editProfile.saveFailed'), e instanceof Error ? e.message : t('editProfile.tryAgain'));
    } finally {
      setSaving(false);
    }
  }, [
    user?.id,
    pendingUploadUri,
    firstName,
    lastName,
    monthlyIncome,
    userProfile.avatarUrl,
    setUserProfile,
    t,
  ]);

  const preview = localPreviewUri ?? userProfile.avatarUrl;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('editProfile.firstName')}</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
          value={firstName}
          onChangeText={setFirstName}
          placeholder={t('editProfile.firstNamePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('editProfile.lastName')}</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
          value={lastName}
          onChangeText={setLastName}
          placeholder={t('editProfile.lastNamePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.block}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('editProfile.monthlyIncome')}</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
          value={monthlyIncome}
          onChangeText={setMonthlyIncome}
          placeholder={t('editProfile.incomePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          keyboardType="decimal-pad"
          inputMode="decimal"
        />
      </View>

      <View style={styles.block}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('editProfile.profilePhotoSection')}</Text>
        {preview ? (
          <Image source={{ uri: preview }} style={styles.preview} contentFit="cover" />
        ) : null}
        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: colors.primary }]}
          onPress={onChoosePhoto}
          disabled={saving}
        >
          <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>{t('editProfile.choosePhoto')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: colors.primary }]}
        onPress={() => void save()}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>{t('editProfile.saveChanges')}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  block: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 16,
  },
  preview: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignSelf: 'center',
    marginBottom: 16,
  },
  secondaryBtn: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
