/**
 * Central theme palette for MoneyBuddy (light / dark).
 * Use via `useTheme()` — avoid hardcoding these hex values in screens.
 */
export const brand = {
  violet: '#8B5CF6',
  indigo: '#4F46E5',
  violetLight: '#A78BFA',
  ink: '#181433',
  gradient: ['#8B5CF6', '#4F46E5'] as const,
};

export type ThemeColors = {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  card: string;
  /** Tab bar background */
  tabBar: string;
  /** Secondary surfaces (chips, inactive pills) */
  muted: string;
  /** Text on primary-colored buttons */
  onPrimary: string;
  success: string;
  error: string;
  warning: string;
  /** Header gradients (brand) */
  gradientStart: string;
  gradientEnd: string;
  /** Modal overlay scrim */
  overlay: string;
  /** Inverse surface (e.g. light text on dark badge) */
  inverseText: string;
};

export const lightColors: ThemeColors = {
  background: '#f5f5f5',
  surface: '#ffffff',
  text: '#1a1a1a',
  textSecondary: '#666666',
  border: '#e0e0e0',
  primary: brand.violet,
  card: '#ffffff',
  tabBar: '#ffffff',
  muted: '#f3f4f6',
  onPrimary: '#ffffff',
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  gradientStart: brand.violet,
  gradientEnd: brand.indigo,
  overlay: 'rgba(0,0,0,0.45)',
  inverseText: '#ffffff',
};

export const darkColors: ThemeColors = {
  background: '#0f0f0f',
  surface: '#1c1c1e',
  text: '#ffffff',
  textSecondary: '#ababab',
  border: '#2c2c2e',
  primary: brand.violet,
  card: '#1c1c1e',
  tabBar: '#1c1c1e',
  muted: '#2c2c2e',
  onPrimary: '#ffffff',
  success: '#34d399',
  error: '#f87171',
  warning: '#fbbf24',
  gradientStart: brand.violet,
  gradientEnd: brand.indigo,
  overlay: 'rgba(0,0,0,0.65)',
  inverseText: '#0f0f0f',
};

export function themeColorsForDark(isDark: boolean): ThemeColors {
  return isDark ? darkColors : lightColors;
}
