import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EyeOff } from 'lucide-react-native';
import { useLanguageStore } from '@/store/language-store';
import { safePush } from '@/lib/safe-navigate';

/** Policies nemají Supabase tabulku — žádný mock, jen poctivý empty state. */
export default function HouseholdPoliciesScreen() {
  const { t } = useLanguageStore();

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title={t('screenSharingRules')} fallback="/(tabs)/household" />
      <View style={styles.empty}>
        <EyeOff size={56} color="#9CA3AF" strokeWidth={1.5} />
        <Text style={styles.title}>{t('hhFeatureUnavailableTitle')}</Text>
        <Text style={styles.body}>{t('hhPoliciesUnavailableBody')}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => safePush('/(tabs)/household')}>
          <Text style={styles.btnText}>{t('household')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  title: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  body: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: '#6B7280',
    textAlign: 'center',
  },
  btn: {
    marginTop: 24,
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 15 },
});
