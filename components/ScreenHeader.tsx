/**
 * Jednotná hlavička: zpět (ChevronLeft) / dismiss (X) + nadpis + volitelný right slot.
 */
import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, X } from 'lucide-react-native';
import { router, type Href } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_BACK_FALLBACK } from '@/lib/safe-back';

const BTN = 40;
const HIT = Math.max(0, (44 - BTN) / 2);

export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  /** Akce vpravo (Upravit / Uložit / …) */
  right?: React.ReactNode;
  /**
   * `default` — flat bar nad obsahem (světlý/tmavý podle tématu).
   * `gradient` — fialová/barevná hlavička (bílé texty).
   */
  variant?: 'default' | 'gradient';
  /** Barvy gradientu; default = theme gradientStart/End */
  gradientColors?: readonly [string, string, ...string[]];
  /** Extra obsah pod řádkem title (částka, badge, …) */
  children?: React.ReactNode;
  fallback?: Href;
  onBack?: () => void;
  /**
   * Modál / sheet: místo šipky ✕ vpravo nahoře (zpětná šipka skrytá).
   */
  dismissible?: boolean;
  onDismiss?: () => void;
  /** Vynutí světlý obsah (bílá šipka/text) i mimo gradient */
  lightContent?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Bez safe-area paddingu nahoře (když už je v native headeru) */
  skipTopInset?: boolean;
  testID?: string;
};

function goBack(fallback: Href) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}

export function ScreenHeader({
  title,
  subtitle,
  right,
  variant = 'default',
  gradientColors,
  children,
  fallback = DEFAULT_BACK_FALLBACK,
  onBack,
  dismissible = false,
  onDismiss,
  lightContent,
  style,
  skipTopInset = false,
  testID,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const isGradient = variant === 'gradient';
  const light = lightContent ?? isGradient;

  const iconColor = light ? '#FFFFFF' : colors.text;
  const titleColor = light ? '#FFFFFF' : colors.text;
  const subtitleColor = light ? 'rgba(255,255,255,0.85)' : colors.textSecondary;
  const btnBg = light ? 'rgba(255,255,255,0.22)' : colors.muted;

  const handleBack = useCallback(() => {
    if (onBack) onBack();
    else goBack(fallback);
  }, [onBack, fallback]);

  const handleDismiss = useCallback(() => {
    if (onDismiss) onDismiss();
    else goBack(fallback);
  }, [onDismiss, fallback]);

  const topPad = skipTopInset ? 8 : Math.max(insets.top, 8);

  const row = (
    <View style={[styles.inner, { paddingTop: topPad }, style]} testID={testID}>
      <View style={styles.row}>
        {dismissible ? (
          <View style={styles.sideSlot} />
        ) : (
          <TouchableOpacity
            onPress={handleBack}
            style={[styles.roundBtn, { backgroundColor: btnBg }]}
            hitSlop={{ top: HIT, bottom: HIT, left: HIT, right: HIT }}
            accessibilityRole="button"
            accessibilityLabel="Zpět"
            testID="screen-header-back"
          >
            <ChevronLeft color={iconColor} size={24} strokeWidth={2.25} />
          </TouchableOpacity>
        )}

        <View style={styles.titleBlock}>
          {title ? (
            <Text style={[styles.title, { color: titleColor }]} numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={[styles.subtitle, { color: subtitleColor }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {dismissible ? (
          <TouchableOpacity
            onPress={handleDismiss}
            style={[styles.roundBtn, { backgroundColor: btnBg }]}
            hitSlop={{ top: HIT, bottom: HIT, left: HIT, right: HIT }}
            accessibilityRole="button"
            accessibilityLabel="Zavřít"
            testID="screen-header-close"
          >
            <X color={iconColor} size={20} strokeWidth={2.25} />
          </TouchableOpacity>
        ) : right ? (
          <View style={styles.rightSlot}>{right}</View>
        ) : (
          <View style={styles.sideSlot} />
        )}
      </View>
      {children ? <View style={styles.extra}>{children}</View> : null}
    </View>
  );

  if (isGradient) {
    const g = gradientColors ?? ([colors.gradientStart, colors.gradientEnd] as const);
    return (
      <LinearGradient colors={[...g]} style={styles.gradientWrap} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        {row}
      </LinearGradient>
    );
  }

  return (
    <View
      style={[
        styles.flatWrap,
        {
          backgroundColor: colors.background,
          borderBottomColor: isDark ? colors.border : 'rgba(0,0,0,0.06)',
        },
      ]}
    >
      {row}
    </View>
  );
}

const styles = StyleSheet.create({
  gradientWrap: {
    paddingBottom: 16,
  },
  flatWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
  },
  inner: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: BTN,
    gap: 12,
  },
  roundBtn: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideSlot: {
    width: BTN,
    height: BTN,
  },
  titleBlock: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  rightSlot: {
    minWidth: BTN,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  extra: {
    marginTop: 12,
  },
});
