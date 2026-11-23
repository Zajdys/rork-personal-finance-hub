import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguageStore } from '@/store/language-store';
import { useSettingsStore } from '@/store/settings-store';
import { formatWorkTime } from '@/lib/work-time';
import { uiLocale } from '@/lib/app-locale';

export interface SavedCelebrationData {
  title: string;
  price: number;
  /** Hodiny práce, které by nákup stál (0 = neznámé). */
  hoursNeeded: number;
  /** Budoucí hodnota při odložení (0 = nepočítat). */
  futureValue: number;
  /** Počet let pro budoucí hodnotu (0 = neuvádět). */
  years: number;
  /** Celkem ušetřeno včetně tohoto rozhodnutí. */
  savedTotal: number;
}

interface Props {
  data: SavedCelebrationData | null;
  onClose: () => void;
}

const fmt = (v: number) => Math.round(v).toLocaleString(uiLocale());

/** Celoobrazovková oslava rozhodnutí „Nekoupím“. */
export function SavedCelebration({ data, onClose }: Props) {
  const { tr } = useLanguageStore();
  const currency = useSettingsStore((s) => s.getCurrentCurrency());
  const insets = useSafeAreaInsets();

  const emojiScale = useRef(new Animated.Value(0.3)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentShift = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    if (!data) return;
    emojiScale.setValue(0.3);
    contentOpacity.setValue(0);
    contentShift.setValue(24);
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    Animated.sequence([
      Animated.spring(emojiScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(contentOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(contentShift, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]),
    ]).start();
  }, [data, emojiScale, contentOpacity, contentShift]);

  if (!data) return null;

  const sym = currency.symbol;
  const showFuture = data.futureValue > data.price && data.years > 0;
  const yearsLabel = tr(
    `${data.years} ${data.years === 1 ? 'rok' : data.years >= 2 && data.years <= 4 ? 'roky' : 'let'}`,
    `${data.years} ${data.years === 1 ? 'year' : 'years'}`,
  );

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <LinearGradient
        colors={['#10B981', '#059669', '#047857']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.fill, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
      >
        <View style={styles.center}>
          <Animated.Text style={[styles.emoji, { transform: [{ scale: emojiScale }] }]}>🎉</Animated.Text>

          <Animated.View
            style={{ opacity: contentOpacity, transform: [{ translateY: contentShift }], alignItems: 'center' }}
          >
            <Text style={styles.kicker}>{tr('SKVĚLÉ ROZHODNUTÍ', 'GREAT DECISION')}</Text>
            <Text style={styles.amount}>
              +{fmt(data.price)} {sym}
            </Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {data.title
                ? tr(`zůstává ti v kapse místo „${data.title}“`, `stays in your pocket instead of “${data.title}”`)
                : tr('zůstává ti v kapse', 'stays in your pocket')}
            </Text>

            <View style={styles.stats}>
              {data.hoursNeeded > 0 ? (
                <View style={styles.statRow}>
                  <Text style={styles.statIcon}>⏱️</Text>
                  <Text style={styles.statText}>
                    {tr('Ušetřil sis ', 'You saved ')}
                    <Text style={styles.statStrong}>{formatWorkTime(data.hoursNeeded, tr)}</Text>
                    {tr(' práce', ' of work')}
                  </Text>
                </View>
              ) : null}
              {showFuture ? (
                <View style={styles.statRow}>
                  <Text style={styles.statIcon}>📈</Text>
                  <Text style={styles.statText}>
                    {tr(`Za ${yearsLabel} by z toho mohlo být `, `In ${yearsLabel} it could grow to `)}
                    <Text style={styles.statStrong}>
                      {fmt(data.futureValue)} {sym}
                    </Text>
                  </Text>
                </View>
              ) : null}
              <View style={styles.statRow}>
                <Text style={styles.statIcon}>🐷</Text>
                <Text style={styles.statText}>
                  {tr('Celkem ušetřeno: ', 'Saved in total: ')}
                  <Text style={styles.statStrong}>
                    {fmt(data.savedTotal)} {sym}
                  </Text>
                </Text>
              </View>
            </View>
          </Animated.View>
        </View>

        <Animated.View style={{ opacity: contentOpacity }}>
          <TouchableOpacity style={styles.button} onPress={onClose} activeOpacity={0.9} testID="saved-celebration-done">
            <Text style={styles.buttonText}>{tr('Hotovo', 'Done')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emoji: { fontSize: 96, marginBottom: 20 },
  kicker: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  amount: {
    color: '#fff',
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: -1.5,
    marginTop: 8,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  stats: { marginTop: 32, gap: 10, alignSelf: 'stretch', width: '100%' },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statIcon: { fontSize: 22, marginRight: 12 },
  statText: { color: '#fff', fontSize: 16, flex: 1, lineHeight: 22 },
  statStrong: { fontWeight: '800' },
  button: { backgroundColor: '#fff', borderRadius: 18, paddingVertical: 17, alignItems: 'center' },
  buttonText: { color: '#047857', fontSize: 17, fontWeight: '800' },
});
