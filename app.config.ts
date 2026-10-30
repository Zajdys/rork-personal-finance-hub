import type { ExpoConfig, ConfigContext } from 'expo/config';

type AppVariant = 'development' | 'production';

const variant = (process.env.APP_VARIANT as AppVariant | undefined) ?? 'development';
const isProd = variant === 'production';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isProd ? 'MoneyBuddy' : 'MoneyBuddy Dev',
  slug: 'personal-finance-hub-gfsbvu1',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/app-icon-1024.png',
  scheme: 'moneybuddy',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/images/app-icon-1024.png',
    resizeMode: 'contain',
    backgroundColor: '#8B5CF6',
  },
  ios: {
    icon: './assets/images/app-icon-1024.png',
    supportsTablet: false,
    bundleIdentifier: isProd ? 'cz.moneybuddy.app' : 'cz.moneybuddy.app.dev',
    usesIcloudStorage: true,
    infoPlist: {
      NSFaceIDUsageDescription:
        'MoneyBuddy použije Face ID k ochraně aplikace po návratu z pozadí.',
      NSPhotoLibraryUsageDescription:
        'MoneyBuddy potřebuje přístup k fotkám pro nahrání účtenek a avatara.',
      NSCameraUsageDescription:
        'MoneyBuddy potřebuje kameru pro focení účtenek.',
      NSUserNotificationsUsageDescription:
        'MoneyBuddy ti pošle připomínky na splatnosti, předplatné a sdílené výdaje.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/app-icon-512.png',
      backgroundColor: '#8B5CF6',
    },
    package: isProd ? 'cz.moneybuddy.app' : 'cz.moneybuddy.app.dev',
    permissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.INTERNET',
      'android.permission.CAMERA',
      'android.permission.POST_NOTIFICATIONS',
    ],
  },
  web: {
    favicon: './assets/images/favicon-32.png',
  },
  plugins: [
    [
      'expo-router',
      {
        origin: 'https://moneybuddy.cz/',
      },
    ],
    [
      'expo-document-picker',
      {
        iCloudContainerEnvironment: 'Production',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'MoneyBuddy potřebuje přístup k fotkám pro nahrání účtenek a avatara.',
        cameraPermission: 'MoneyBuddy potřebuje kameru pro focení účtenek.',
        // Mikrofon se v appce nepoužívá — nevynucovat RECORD_AUDIO.
        microphonePermission: false,
      },
    ],
    '@react-native-community/datetimepicker',
    [
      'expo-notifications',
      {
        sounds: [],
      },
    ],
    'expo-secure-store',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {
      origin: 'https://moneybuddy.cz/',
    },
    eas: {
      projectId: '963a849f-979e-4af6-b328-9d8d6364a293',
    },
    appVariant: variant,
  },
});
