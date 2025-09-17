import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, SafeAreaView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { useAuthStore } from '@/store/auth-store';

export default function LoginScreen() {
  const router = useRouter();
  const { setToken } = useAuthStore();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  React.useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const mode = url.searchParams.get('mode');
      if (mode === 'register') setIsRegistering(true);
    } catch {}
  }, []);

  const loginMutation = trpc.auth.login.mutate.useMutation();
  const registerMutation = trpc.auth.register.mutate.useMutation();

  const canSubmit = useMemo(() => email.length > 3 && password.length >= 6, [email, password]);

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    try {
      console.log('Attempting', isRegistering ? 'registration' : 'login', 'with email:', email);
      const mutation = isRegistering ? registerMutation : loginMutation;
      const res = await mutation.mutateAsync({ email, password });
      console.log('Auth successful, setting token');
      await setToken(res.token);
      console.log('Token set, redirecting to /');
      router.replace('/');
    } catch (e) {
      console.error(isRegistering ? 'register error' : 'login error', e);
      const msg = e instanceof Error ? e.message : (isRegistering ? 'Registration failed' : 'Login failed');
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    }
  }, [canSubmit, email, password, isRegistering, loginMutation, registerMutation, setToken, router]);

  const isPending = loginMutation.isPending || registerMutation.isPending;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container} testID="login-screen">
        <Stack.Screen options={{ title: isRegistering ? 'Register' : 'Login', headerBackTitle: 'Back' }} />
        <Text style={styles.title} testID="login-title">{isRegistering ? 'Create Account' : 'Welcome back'}</Text>
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
          style={[styles.button, !canSubmit || isPending ? styles.buttonDisabled : undefined]}
          disabled={!canSubmit || isPending}
          onPress={onSubmit}
        >
          <Text style={styles.buttonText}>
            {isPending ? (isRegistering ? 'Creating account…' : 'Signing in…') : (isRegistering ? 'Create account' : 'Sign in')}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => setIsRegistering(!isRegistering)}
          testID="switch-mode"
        >
          <Text style={styles.switchText}>
            {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Register"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  container: { flex: 1, padding: 24, gap: 16 as const, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700' as const, marginBottom: 8 },
  field: { gap: 8 as const },
  label: { fontSize: 14, color: '#6b7280' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: Platform.OS === 'web' ? 10 : 12, fontSize: 16 },
  button: { backgroundColor: '#111827', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: 'white', fontWeight: '600' as const, fontSize: 16 },
  switchButton: { alignItems: 'center', paddingVertical: 12 },
  switchText: { color: '#0ea5e9', fontSize: 14, fontWeight: '500' as const },
});