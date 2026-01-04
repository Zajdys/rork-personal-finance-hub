import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';

export default function RegisterScreen() {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');

  const handleRegister = async () => {
    try {
      const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '') || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
      const res = await fetch(`${apiBaseUrl}/api/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();
      console.log('[Register] response:', data);

      if (res.ok) {
        Alert.alert('✅ Registrace proběhla', `Email: ${data?.user?.email ?? ''}`);
      } else {
        Alert.alert('❌ Chyba registrace', data?.error || 'Unknown error');
      }
    } catch (e: unknown) {
      const err = e as Error;
      console.error('[Register] error:', err);
      Alert.alert('❌ Chyba', err.message || 'Neznámá chyba');
    }
  };

  return (
    <View style={styles.container} testID="register-container">
      <Text style={styles.title}>Registrace</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        testID="register-email"
      />
      <TextInput
        style={styles.input}
        placeholder="Heslo"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        testID="register-password"
      />
      <TextInput
        style={styles.input}
        placeholder="Jméno"
        value={name}
        onChangeText={setName}
        testID="register-name"
      />
      <TextInput
        style={styles.input}
        placeholder="Telefon"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        testID="register-phone"
      />
      <Button title="Registrovat" onPress={handleRegister} testID="register-submit" accessibilityLabel="Registrovat" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#0B0F14' },
  title: { fontSize: 22, color: '#fff', marginBottom: 20, textAlign: 'center' },
  input: { backgroundColor: '#fff', padding: 10, marginBottom: 10, borderRadius: 6 },
});
