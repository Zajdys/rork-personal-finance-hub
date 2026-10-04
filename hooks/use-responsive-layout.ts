import { useWindowDimensions, Platform } from 'react-native';

export function useResponsiveLayout() {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isDesktop = isWeb && width >= 1024;
  const isTablet = isWeb && width >= 768 && width < 1024;
  const contentMaxWidth = isDesktop ? 1400 : isTablet ? 900 : width;

  return { isWeb, isDesktop, isTablet, width, contentMaxWidth };
}
