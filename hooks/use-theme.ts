import { useMemo } from 'react';
import { useSettingsStore } from '@/store/settings-store';
import { darkColors, lightColors, type ThemeColors } from '@/constants/theme-colors';

/**
 * App theme: derives from settings (light / dark / auto).
 * Prefer `colors.*` over hardcoded hex in UI.
 */
export function useTheme(): { colors: ThemeColors; isDark: boolean } {
  const isDark = useSettingsStore((s) => s.isDarkMode);
  const colors = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);
  return { colors, isDark };
}
