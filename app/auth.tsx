import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  UserPlus,
  LogIn,
} from 'lucide-react-native';
import { useSettingsStore } from '@/store/settings-store';
import { useLanguageStore } from '@/store/language-store';
import { useRouter } from 'expo-router';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  
  const { isDarkMode } = useSettingsStore();
  const { t } = useLanguageStore();
  const router = useRouter();

  const handleSubmit = async () => {
    if (!email || !password || (!isLogin && !name)) {
      setError('Vyplňte všechna povinná pole');
      return;
    }

    if (!email.includes('@')) {
      setError('Zadejte platnou emailovou adresu');
      return;
    }

    if (password.length < 6) {
      setError('Heslo musí mít alespoň 6 znaků');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Simulace API volání
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      if (isLogin) {
        // Simulace přihlášení
        if (email === 'test@test.com' && password === 'test123') {
          Alert.alert('Úspěch', 'Přihlášení proběhlo úspěšně!');
          router.replace('/(tabs)');
        } else {
          setError('Nesprávné přihlašovací údaje');
        }
      } else {
        // Simulace registrace
        Alert.alert('Úspěch', 'Registrace proběhla úspěšně! Nyní se můžete přihlásit.');
        setIsLogin(true);
        setName('');
        setPassword('');
      }
    } catch (err) {
      setError('Nastala chyba. Zkuste to prosím znovu.');
    } finally {
      setLoading(false);
    }
  };

  const InputField = ({ 
    icon: Icon, 
    placeholder, 
    value, 
    onChangeText, 
    secureTextEntry = false,
    keyboardType = 'default' as any
  }: any) => (
    <View style={[styles.inputContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
      <Icon color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
      <TextInput
        style={[styles.input, { color: isDarkMode ? 'white' : '#1F2937' }]}
        placeholder={placeholder}
        placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize="none"
      />
      {placeholder.toLowerCase().includes('heslo') && (
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
          {showPassword ? (
            <EyeOff color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
          ) : (
            <Eye color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerContent}>
            <View style={styles.logoContainer}>
              <User color="white" size={32} />
            </View>
            <Text style={styles.headerTitle}>MoneyBuddy</Text>
            <Text style={styles.headerSubtitle}>
              {isLogin ? 'Vítejte zpět!' : 'Začněte svou finanční cestu'}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {/* Toggle Buttons */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                isLogin && styles.toggleButtonActive,
                { backgroundColor: isDarkMode ? '#374151' : 'white' }
              ]}
              onPress={() => {
                setIsLogin(true);
                setError('');
              }}
            >
              {isLogin && (
                <LinearGradient
                  colors={['#667eea', '#764ba2']}
                  style={styles.toggleGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <LogIn color="white" size={20} />
                  <Text style={[styles.toggleText, { color: 'white' }]}>Přihlášení</Text>
                </LinearGradient>
              )}
              {!isLogin && (
                <View style={styles.toggleContent}>
                  <LogIn color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
                  <Text style={[styles.toggleText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>Přihlášení</Text>
                </View>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.toggleButton,
                !isLogin && styles.toggleButtonActive,
                { backgroundColor: isDarkMode ? '#374151' : 'white' }
              ]}
              onPress={() => {
                setIsLogin(false);
                setError('');
              }}
            >
              {!isLogin && (
                <LinearGradient
                  colors={['#667eea', '#764ba2']}
                  style={styles.toggleGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <UserPlus color="white" size={20} />
                  <Text style={[styles.toggleText, { color: 'white' }]}>Registrace</Text>
                </LinearGradient>
              )}
              {isLogin && (
                <View style={styles.toggleContent}>
                  <UserPlus color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
                  <Text style={[styles.toggleText, { color: isDarkMode ? '#9CA3AF' : '#6B7280' }]}>Registrace</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {!isLogin && (
              <InputField
                icon={User}
                placeholder="Celé jméno"
                value={name}
                onChangeText={setName}
              />
            )}
            
            <InputField
              icon={Mail}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
            
            <InputField
              icon={Lock}
              placeholder="Heslo"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />

            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity 
              style={styles.submitButton} 
              onPress={handleSubmit}
              disabled={loading}
            >
              <LinearGradient
                colors={['#667eea', '#764ba2']}
                style={styles.submitGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {loading ? (
                  <Text style={styles.submitText}>Načítání...</Text>
                ) : (
                  <>
                    <Text style={styles.submitText}>
                      {isLogin ? 'Přihlásit se' : 'Registrovat se'}
                    </Text>
                    <ArrowRight color="white" size={20} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Demo Credentials */}
          {isLogin && (
            <View style={[styles.demoContainer, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}>
              <Text style={[styles.demoTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>Demo přístup:</Text>
              <Text style={[styles.demoText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Email: test@test.com</Text>
              <Text style={[styles.demoText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>Heslo: test123</Text>
            </View>
          )}

          {/* Features */}
          <View style={styles.featuresContainer}>
            <Text style={[styles.featuresTitle, { color: isDarkMode ? 'white' : '#1F2937' }]}>
              {isLogin ? 'Proč MoneyBuddy?' : 'Co získáte?'}
            </Text>
            
            <View style={styles.featuresList}>
              <View style={styles.featureItem}>
                <View style={styles.featureBullet} />
                <Text style={[styles.featureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Sledování příjmů a výdajů
                </Text>
              </View>
              
              <View style={styles.featureItem}>
                <View style={styles.featureBullet} />
                <Text style={[styles.featureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  AI asistent pro finanční poradenství
                </Text>
              </View>
              
              <View style={styles.featureItem}>
                <View style={styles.featureBullet} />
                <Text style={[styles.featureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Investiční portfolio tracking
                </Text>
              </View>
              
              <View style={styles.featureItem}>
                <View style={styles.featureBullet} />
                <Text style={[styles.featureText, { color: isDarkMode ? '#D1D5DB' : '#6B7280' }]}>
                  Finanční vzdělávání a tipy
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  headerContent: {
    alignItems: 'center',
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'white',
    opacity: 0.9,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  toggleContainer: {
    flexDirection: 'row',
    marginBottom: 32,
    gap: 12,
    marginTop: -20,
  },
  toggleButton: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  toggleButtonActive: {
    transform: [{ scale: 1.02 }],
  },
  toggleGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  toggleContent: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '600',
  },
  form: {
    gap: 16,
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '500',
  },
  submitButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
  },
  submitGradient: {
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  demoContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  demoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  demoText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  featuresContainer: {
    marginBottom: 32,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  featuresList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#667eea',
  },
  featureText: {
    fontSize: 16,
    color: '#6B7280',
    flex: 1,
  },
});