import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  User,
  Mail,
  Lock,
  ArrowRight,
  Wallet,
  TrendingUp,
  PiggyBank,
  Landmark,
  Sparkles,
} from 'lucide-react-native';
import { useAuth } from '@/store/auth-store';
import { useLanguageStore } from '@/store/language-store';
import { useRouter, useLocalSearchParams } from 'expo-router';
import BrandLogo from '@/components/BrandLogo';
import { useAsyncAction } from '@/hooks/use-async-action';

const GRADIENT_BG: [string, string, string] = ['#1a0533', '#120a3d', '#0d1b4b'];
const TEXT_PRIMARY = '#FFFFFF';
const TEXT_MUTED = 'rgba(255,255,255,0.55)';

function FloatingIcon({
  Icon,
  top,
  left,
  right,
  bottom,
  size,
  rotate,
}: {
  Icon: React.ComponentType<{ color: string; size: number }>;
  top?: `${number}%`;
  left?: `${number}%`;
  right?: `${number}%`;
  bottom?: `${number}%`;
  size: number;
  rotate?: string;
}) {
  return (
    <View
      style={[
        styles.floatIcon,
        {
          top,
          left,
          right,
          bottom,
          transform: rotate ? [{ rotate }] : undefined,
        },
      ]}
      pointerEvents="none"
    >
      <Icon color="rgba(255,255,255,0.1)" size={size} />
    </View>
  );
}

function PremiumInput({
  icon: Icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoCorrect,
}: {
  icon: React.ComponentType<{ color: string; size: number }>;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
}) {
  return (
    <View style={styles.inputOuter}>
      <Icon color="rgba(255,255,255,0.4)" size={20} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={TEXT_MUTED}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
      />
    </View>
  );
}

export default function AuthScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [isLogin, setIsLogin] = useState(() => mode !== 'register');

  useEffect(() => {
    if (mode === 'register') setIsLogin(false);
  }, [mode]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const { login, register } = useAuth();
  const { t } = useLanguageStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { run: handleSubmit, isRunning: loading } = useAsyncAction(async () => {
    if (!email || !password || (!isLogin && !name)) {
      setError(t('auth.fillAllFields'));
      return;
    }

    if (!email.includes('@')) {
      setError(t('auth.invalidEmail'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.passwordMinLength'));
      return;
    }

    setError('');

    try {
      if (isLogin) {
        const result = await login(email, password);
        if (!result.success) {
          setError(result.error || t('auth.invalidCredentials'));
        }
        // Po úspěšném loginu NEnavigovat — root _layout gate rozhodne (welcome-tour / Přehled / onboarding).
      } else {
        const result = await register(email, password, name);
        if (result.success) {
          router.replace('/onboarding');
        } else {
          setError(result.error || t('auth.registrationFailed'));
        }
      }
    } catch {
      setError(t('auth.genericError'));
    }
  });

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient colors={GRADIENT_BG} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />

      {/* Subtle vignette */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.35)']}
        style={[StyleSheet.absoluteFill, { opacity: 0.9 }]}
        pointerEvents="none"
      />

      {/* Decorative grid lines */}
      <View style={styles.gridOverlay} pointerEvents="none">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={`v-${i}`} style={[styles.gridLineV, { left: `${16.66 * i}%` }]} />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={`h-${i}`} style={[styles.gridLineH, { top: `${20 * i}%` }]} />
        ))}
      </View>

      <FloatingIcon Icon={Wallet} top="8%" left="6%" size={56} rotate="-12deg" />
      <FloatingIcon Icon={TrendingUp} top="18%" right="8%" size={44} rotate="8deg" />
      <FloatingIcon Icon={PiggyBank} bottom="32%" left="4%" size={48} rotate="6deg" />
      <FloatingIcon Icon={Landmark} bottom="22%" right="6%" size={52} rotate="-6deg" />
      <FloatingIcon Icon={Sparkles} top="42%" left="10%" size={28} rotate="15deg" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={[
            styles.scrollContent,
            { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 28) },
          ]}
        >
          {/* Logo */}
          <View style={styles.hero}>
            <BrandLogo theme="dark" size={48} />
            <Text style={styles.tagline}>{t('auth.tagline')}</Text>
            <Text style={styles.modeLabel}>{isLogin ? t('auth.login') : t('auth.register')}</Text>
          </View>

          <View style={styles.form}>
            {!isLogin && (
              <PremiumInput
                key="fullName"
                icon={User}
                placeholder={t('auth.fullName')}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            )}

            <PremiumInput
              key="email"
              icon={Mail}
              placeholder={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <PremiumInput
              key="password"
              icon={Lock}
              placeholder={t('auth.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={true}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              onPress={() => {
                void handleSubmit();
              }}
              disabled={loading}
              activeOpacity={0.9}
              style={styles.primaryBtnWrap}
            >
              <LinearGradient
                colors={['#a855f7', '#7c3aed', '#6d28d9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryBtn}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : null}
                <Text style={styles.primaryBtnText}>
                  {loading ? t('loading') : isLogin ? t('auth.signIn') : t('auth.createAccount')}
                </Text>
                {!loading && <ArrowRight color="#FFFFFF" size={22} />}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              style={styles.switchBtn}
            >
              <Text style={styles.switchText}>
                {isLogin ? t('auth.noAccount') : t('auth.haveAccount')}
                <Text style={styles.switchAccent}>{isLogin ? t('auth.register') : t('auth.login')}</Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.codeButton}
              onPress={() => router.push('/redeem-code')}
              activeOpacity={0.85}
            >
              <Text style={styles.codeButtonText}>{t('auth.haveCode')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0d1b4b',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.15,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  floatIcon: {
    position: 'absolute',
    zIndex: 0,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 36,
    zIndex: 1,
    gap: 12,
  },
  tagline: {
    fontSize: 16,
    color: TEXT_MUTED,
    fontWeight: '500',
    textAlign: 'center',
  },
  modeLabel: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(196, 181, 253, 0.95)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  form: {
    gap: 14,
    zIndex: 1,
  },
  inputOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  inputOuterFocused: {
    borderColor: 'rgba(167, 139, 250, 0.85)',
    shadowColor: '#a855f7',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: TEXT_PRIMARY,
  },
  error: {
    color: '#fca5a5',
    textAlign: 'center',
    fontSize: 14,
    marginTop: 4,
  },
  primaryBtnWrap: {
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  primaryBtn: {
    paddingVertical: 18,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryBtnText: {
    color: TEXT_PRIMARY,
    fontSize: 17,
    fontWeight: '700',
  },
  switchBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  switchText: {
    color: TEXT_MUTED,
    fontSize: 15,
  },
  switchAccent: {
    color: '#c4b5fd',
    fontWeight: '700',
  },
  codeButton: {
    marginTop: 4,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  codeButtonText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '600',
  },
});
