import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/store/auth-store';

export default function RegisterScreen() {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const { register } = useAuth();
  const router = useRouter();

  const handleRegister = async () => {
    setError('');

    if (!email.trim() || !password.trim() || !name.trim()) {
      setError('Vyplňte všechna pole');
      return;
    }

    setLoading(true);
    try {
      console.log('[register-screen] submitting register');
      const result = await register(email, password, name);
      console.log('[register-screen] register result', result);

      if (result.success) {
        console.log('[register-screen] register success -> / (root gating decides next)');
        router.replace('/');
      } else {
        setError(result.error || 'Registrace selhala');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Nelze spojit se serverem';
      console.error('[register-screen] register error', e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container} testID="register-container">
      <Text style={styles.title}>Registrace</Text>
      <TextInput
        style={styles.input}
        placeholder="Jméno"
        placeholderTextColor="#888"
        value={name}
        onChangeText={setName}
        testID="register-name"
        editable={!loading}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#888"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        testID="register-email"
        editable={!loading}
      />
      <TextInput
        style={styles.input}
        placeholder="Heslo"
        placeholderTextColor="#888"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        testID="register-password"
        editable={!loading}
      />
      
      {error ? <Text style={styles.error}>{error}</Text> : null}
      
      <TouchableOpacity 
        style={[styles.button, loading && styles.buttonDisabled]} 
        onPress={handleRegister}
        disabled={loading}
        testID="register-submit"
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Registrovat</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#0B0F14' },
  title: { fontSize: 24, fontWeight: '700' as const, color: '#fff', marginBottom: 30, textAlign: 'center' },
  input: { backgroundColor: '#fff', padding: 14, marginBottom: 12, borderRadius: 8, fontSize: 16 },
  error: { color: '#ff4444', fontSize: 14, marginBottom: 12, textAlign: 'center' },
  button: { backgroundColor: '#007AFF', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { backgroundColor: '#555' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' as const },
});
