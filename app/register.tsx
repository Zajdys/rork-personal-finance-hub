import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';

export default function RegisterScreen() {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleRegister = async () => {
    setError('');
    
    if (!email.trim() || !password.trim() || !name.trim()) {
      setError('Vyplňte všechna pole');
      return;
    }

    setLoading(true);
    try {
      const apiBaseUrl = process.env.EXPO_PUBLIC_RORK_API_BASE_URL ?? process.env.EXPO_PUBLIC_API_URL ?? '';
      const url = `${apiBaseUrl}/api/register`;
      
      console.log('[Register] Calling:', url);
      console.log('[Register] Data:', { email: email.slice(0,3) + '***', hasPassword: !!password, name });
      
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();
      console.log('[Register] Response status:', res.status);
      console.log('[Register] Response data:', data);

      if (res.ok && data.success) {
        Alert.alert('✅ Registrace proběhla', `Úspěšně zaregistrováno: ${email}`);
        setEmail('');
        setPassword('');
        setName('');
      } else {
        const errorMsg = data?.error || `Chyba: ${res.status}`;
        setError(errorMsg);
        Alert.alert('❌ Registrace selhala', errorMsg);
      }
    } catch (e: unknown) {
      const err = e as Error;
      console.error('[Register] error:', err);
      const errorMsg = err.message || 'Nelze spojit se serverem';
      setError(errorMsg);
      Alert.alert('❌ Chyba', errorMsg);
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
