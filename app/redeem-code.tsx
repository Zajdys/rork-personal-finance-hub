import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Gift,
  Check,
} from 'lucide-react-native';
import { useRouter, Stack } from 'expo-router';
import { useSettingsStore } from '@/store/settings-store';

export default function RedeemCodeScreen() {
  const { isDarkMode } = useSettingsStore();
  const router = useRouter();
  const [code, setCode] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const handleRedeem = async () => {
    if (!code.trim()) {
      Alert.alert('Chyba', 'Zadejte prosím kód');
      return;
    }

    setIsProcessing(true);

    setTimeout(() => {
      setIsProcessing(false);
      
      Alert.alert(
        'Úspěch!',
        `Váš kód "${code}" byl úspěšně uplatněn. Předplatné je nyní aktivní!`,
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    }, 1500);
  };

  return (
    <View style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft color="white" size={24} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Uplatnit kód</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={[styles.card, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
            <View style={styles.iconContainer}>
              <Gift color="#667eea" size={48} />
            </View>
            
            <Text style={[styles.title, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Máte slevový kód?
            </Text>
            <Text style={[styles.description, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              Zadejte váš kód níže pro aktivaci předplatného nebo speciální nabídky
            </Text>

            <View style={styles.inputGroup}>
              <TextInput
                style={[styles.input, { 
                  backgroundColor: isDarkMode ? '#374151' : '#F3F4F6',
                  color: isDarkMode ? 'white' : '#1F2937'
                }]}
                value={code}
                onChangeText={(text) => setCode(text.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX"
                placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={20}
              />
            </View>

            <TouchableOpacity
              style={[styles.redeemButton, isProcessing && styles.redeemButtonDisabled]}
              onPress={handleRedeem}
              disabled={isProcessing}
            >
              <LinearGradient
                colors={isProcessing ? ['#9CA3AF', '#6B7280'] : ['#10B981', '#059669']}
                style={styles.redeemButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Check color="white" size={20} />
                <Text style={styles.redeemButtonText}>
                  {isProcessing ? 'Zpracovávám...' : 'Uplatnit kód'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={[styles.infoCard, { backgroundColor: isDarkMode ? '#1F2937' : 'white' }]}>
            <Text style={[styles.infoTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              Kde získat kód?
            </Text>
            <Text style={[styles.infoText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
              • Propagační kampaně{'\n'}
              • Dárkové poukazy{'\n'}
              • Partnerské akce{'\n'}
              • Věrnostní program
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  headerGradient: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: 'white',
  },
  content: {
    padding: 20,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#667eea20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  inputGroup: {
    width: '100%',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: '#1F2937',
    textAlign: 'center',
    fontWeight: '600' as const,
    letterSpacing: 2,
  },
  redeemButton: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  redeemButtonDisabled: {
    opacity: 0.6,
  },
  redeemButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  redeemButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: 'white',
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 24,
  },
});
