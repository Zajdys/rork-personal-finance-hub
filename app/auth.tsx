import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
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
} from 'lucide-react-native';
import { useSettingsStore } from '@/store/settings-store';
import { useAuth } from '@/store/auth-store';
import { useRouter } from 'expo-router';

// ---------- INPUT FIELD ----------
interface InputFieldProps {
  icon: React.ComponentType<any>;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  isDarkMode: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
}

const InputField = React.memo<InputFieldProps>(({
  icon: Icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry = false,
  keyboardType = 'default',
  isDarkMode,
  showPassword,
  onTogglePassword,
}) => {
  const isPassword = placeholder.toLowerCase().includes('heslo');
  const isEmail = placeholder.toLowerCase().includes('email');

  return (
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
        autoCapitalize={isEmail ? 'none' : 'words'}
        autoCorrect={false}
      />
      {isPassword && onTogglePassword && (
        <TouchableOpacity onPress={onTogglePassword}>
          {showPassword ? (
            <EyeOff color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
          ) : (
            <Eye color={isDarkMode ? '#9CA3AF' : '#6B7280'} size={20} />
          )}
        </TouchableOpacity>
      )}
    </View>
  );
});

InputField.displayName = 'InputField';

// ---------- AUTH SCREEN ----------
export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { isDarkMode } = useSettingsStore();
  const { login, register } = useAuth();
  const router = useRouter();

  const handleSubmit = async () => {
    if (!email || !password || (!isLogin && !name)) {
      setError('Vyplňte všechna pole');
      return;
    }

    if (!email.includes('@')) {
      setError('Neplatný email');
      return;
    }

    if (password.length < 6) {
      setError('Heslo musí mít alespoň 6 znaků');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const success = await login(email, password);
        if (success) {
          router.replace('/');
        } else {
          setError('Nesprávné přihlašovací údaje');
        }
      } else {
        const success = await register(email, password, name);
        if (success) {
          router.replace('/onboarding');
        } else {
          setError('Registrace selhala');
        }
      }
    } catch {
      setError('Nastala chyba');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: isDarkMode ? '#111827' : '#F8FAFC' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>

        <LinearGradient colors={['#667eea', '#764ba2']} style={styles.header}>
          <Text style={styles.headerTitle}>MoneyBuddy</Text>
          <Text style={styles.headerSubtitle}>
            {isLogin ? 'Přihlášení' : 'Registrace'}
          </Text>
        </LinearGradient>

        <View style={styles.content}>

          {!isLogin && (
            <InputField
              icon={User}
              placeholder="Celé jméno"
              value={name}
              onChangeText={setName}
              isDarkMode={isDarkMode}
            />
          )}

          <InputField
            icon={Mail}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            isDarkMode={isDarkMode}
          />

          <InputField
            icon={Lock}
            placeholder="Heslo"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword(p => !p)}
            isDarkMode={isDarkMode}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity onPress={handleSubmit} disabled={loading}>
            <LinearGradient colors={['#667eea', '#764ba2']} style={styles.submit}>
              <Text style={styles.submitText}>
                {loading ? 'Načítání…' : isLogin ? 'Přihlásit se' : 'Registrovat se'}
              </Text>
              <ArrowRight color="white" size={20} />
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
          >
            <Text style={styles.switch}>
              {isLogin ? 'Nemáš účet? Registrace' : 'Máš účet? Přihlášení'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.codeButton, { backgroundColor: isDarkMode ? '#374151' : 'white' }]}
            onPress={() => router.push('/redeem-code')}
          >
            <Text style={[styles.codeButtonText, { color: isDarkMode ? 'white' : '#667eea' }]}>
              Mám kód
            </Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------- STYLES ----------
const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  header: { padding: 60, alignItems: 'center' },
  headerTitle: { color: 'white', fontSize: 28, fontWeight: 'bold' },
  headerSubtitle: { color: 'white', opacity: 0.9 },
  content: { padding: 20, gap: 16 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    gap: 12,
  },
  input: { flex: 1, fontSize: 16 },
  submit: {
    padding: 18,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  submitText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  error: { color: '#DC2626', textAlign: 'center' },
  switch: { textAlign: 'center', marginTop: 16, color: '#667eea' },
  codeButton: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#667eea',
    marginTop: 8,
  },
  codeButtonText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
});
