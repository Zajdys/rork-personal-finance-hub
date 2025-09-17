import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { useAuthStore } from '@/store/auth-store';

export default function LoginScreen() {
  const router = useRouter();
  const { setToken } = useAuthStore();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  const loginMutation = trpc.auth.login.mutate.useMutation();

  const canSubmit = useMemo(() => email.length > 3 && password.length >= 6, [email, password]);

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    try {
      const res = await loginMutation.mutateAsync({ email, password });
      await setToken(res.token);
      router.replace('/');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      if (Platform.OS === 'web') {
        console.error('login error', e);
        alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    }
  }, [canSubmit, email, password, loginMutation, setToken, router]);

  return (
    <View style={styles.container} testID="login-screen">
      <Stack.Screen options={{ title: 'Login', headerBackTitle: 'Back' }} />
      <Text style={styles.title} testID="login-title">Welcome back</Text>
      <View style={styles.field}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          testID="login-email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
          style={styles.input}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          testID="login-password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          style={styles.input}
        />
      </View>
      <TouchableOpacity
        testID="login-submit"
        style={[styles.button, !canSubmit || loginMutation.isPending ? styles.buttonDisabled : undefined]}
        disabled={!canSubmit || loginMutation.isPending}
        onPress={onSubmit}
      >
        <Text style={styles.buttonText}>{loginMutation.isPending ? 'Signing in…' : 'Sign in'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16 as const, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700' as const, marginBottom: 8 },
  field: { gap: 8 as const },
  label: { fontSize: 14, color: '#6b7280' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: Platform.OS === 'web' ? 10 : 12, fontSize: 16 },
  button: { backgroundColor: '#111827', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: 'white', fontWeight: '600' as const, fontSize: 16 },
});