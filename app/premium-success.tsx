import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Sparkles, Users, Target, Upload } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';

const HIGHLIGHTS = [
  { key: 'premiumSuccess.invitePartner' as const, Icon: Users, color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)' },
  { key: 'premiumSuccess.setGoal' as const, Icon: Target, color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  { key: 'premiumSuccess.importUnlimited' as const, Icon: Upload, color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
];

export default function PremiumSuccessScreen() {
  const { colors } = useTheme();
  const { t } = useLanguageStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();

    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [opacity, scale]);

  const onContinue = () => {
    router.replace('/(tabs)');
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View
        style={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 16) + 24,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
          },
        ]}
      >
        <View style={styles.centerBlock}>
          <Animated.View style={{ transform: [{ scale }], opacity }}>
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              style={styles.iconCircle}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Sparkles color="#FFFFFF" size={36} />
            </LinearGradient>
          </Animated.View>

          <Text style={[styles.title, { color: colors.text }]}>{t('premiumSuccess.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('premiumSuccess.subtitle')}
          </Text>

          <View style={styles.list}>
            {HIGHLIGHTS.map(({ key, Icon, color, bg }) => (
              <View key={key} style={styles.row}>
                <View style={[styles.rowIcon, { backgroundColor: bg }]}>
                  <Icon color={color} size={18} />
                </View>
                <Text style={[styles.rowText, { color: colors.text }]}>{t(key)}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.cta} onPress={onContinue} activeOpacity={0.9}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            style={styles.ctaGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.ctaText}>{t('premiumSuccess.cta')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  centerBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  list: {
    width: '100%',
    marginTop: 28,
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  cta: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  ctaGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
});
