import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useLifeEvent } from '@/store/life-event-store';
import { LifeEventMode } from '@/types/life-event';

export function LifeEventModeIndicator() {
  const router = useRouter();
  const { state, getModeInfo, getDaysSinceActivation } = useLifeEvent();

  if (state.activeMode === LifeEventMode.NONE) {
    return null;
  }

  const modeInfo = getModeInfo();
  const daysActive = getDaysSinceActivation();

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => router.push('/life-event')}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={[modeInfo.color, modeInfo.color + 'DD']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View style={styles.content}>
          <Text style={styles.emoji}>{modeInfo.emoji}</Text>
          <View style={styles.textContainer}>
            <Text style={styles.title}>{modeInfo.title}</Text>
            <Text style={styles.subtitle}>
              Aktivní {daysActive} {daysActive === 1 ? 'den' : daysActive < 5 ? 'dny' : 'dní'}
            </Text>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  gradient: {
    padding: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emoji: {
    fontSize: 32,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: 'white',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: 'white',
    opacity: 0.9,
  },
});
