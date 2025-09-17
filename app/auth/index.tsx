import React from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, StyleSheet, ImageBackground, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

export default function AuthLanding() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />
      <ImageBackground
        source={{ uri: 'https://images.unsplash.com/photo-1553729459-efe14ef6055d?q=80&w=2070&auto=format&fit=crop' }}
        style={styles.bg}
        resizeMode="cover"
      >
        <LinearGradient colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.75)"]} style={styles.overlay}>
          <View style={styles.header}>
            <Text style={styles.appName} testID="auth-title">Finance Buddy</Text>
            <Text style={styles.tagline} testID="auth-subtitle">Chytrý přehled peněz, účty a předplatné na jednom místě</Text>
          </View>

          <View style={styles.card} testID="auth-actions">
            <TouchableOpacity
              testID="go-login"
              accessibilityRole="button"
              style={[styles.button, styles.buttonPrimary]}
              onPress={() => router.push('/login')}
            >
              <Text style={styles.buttonPrimaryText}>Přihlásit se</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="go-register"
              accessibilityRole="button"
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => router.push('/login?mode=register')}
            >
              <Text style={styles.buttonSecondaryText}>Vytvořit účet</Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity
              testID="go-subscription"
              accessibilityRole="button"
              style={[styles.button, styles.buttonOutline]}
              onPress={() => router.push('/subscription')}
            >
              <Text style={styles.buttonOutlineText}>Předplatné</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer} testID="auth-footer">Pokračováním souhlasíte s podmínkami a zásadami ochrany osobních údajů</Text>
        </LinearGradient>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000000' },
  bg: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'space-between', padding: 24 },
  header: { paddingTop: Platform.OS === 'web' ? 32 : 12 },
  appName: { color: 'white', fontSize: 34, fontWeight: '800' as const, letterSpacing: 0.5 },
  tagline: { color: 'rgba(255,255,255,0.85)', marginTop: 8, fontSize: 16, lineHeight: 22 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 16, gap: 12 as const, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  button: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonPrimary: { backgroundColor: '#0ea5e9' },
  buttonPrimaryText: { color: 'white', fontSize: 16, fontWeight: '700' as const },
  buttonSecondary: { backgroundColor: '#111827' },
  buttonSecondaryText: { color: 'white', fontSize: 16, fontWeight: '700' as const },
  separator: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 4 },
  buttonOutline: { borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: 'white' },
  buttonOutlineText: { color: '#111827', fontSize: 16, fontWeight: '700' as const },
  footer: { color: 'rgba(255,255,255,0.7)', textAlign: 'center', fontSize: 12 }
});