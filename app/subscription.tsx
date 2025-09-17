import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, SafeAreaView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { trpc } from '@/lib/trpc';

export default function SubscriptionScreen() {
  const router = useRouter();
  const mutation = trpc.auth.subscribe.mutate.useMutation();

  const onSubscribe = async () => {
    try {
      await mutation.mutateAsync({ plan: 'pro' });
      router.replace('/');
    } catch (e) {
      if (Platform.OS === 'web') console.error('subscribe error', e);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container} testID="subscription-screen">
        <Stack.Screen options={{ title: 'Subscription' }} />
        <Text style={styles.title}>Unlock Pro</Text>
        <Text style={styles.subtitle}>Access all features with a simple monthly plan.</Text>
        <TouchableOpacity style={styles.button} onPress={onSubscribe} testID="subscribe-button">
          <Text style={styles.buttonText}>{mutation.isPending ? 'Activating…' : 'Start subscription'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  container: { flex: 1, padding: 24, gap: 16 as const, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700' as const },
  subtitle: { color: '#6b7280' },
  button: { backgroundColor: '#0ea5e9', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: '600' as const, fontSize: 16 },
});