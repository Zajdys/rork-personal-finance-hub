import { Platform } from 'react-native';

/** Obchod, přes který se platí předplatné (Apple / Google Play). */
export const IS_ANDROID_STORE = Platform.OS === 'android';

/** Odkaz na správu předplatných v obchodě. */
export const MANAGE_SUBSCRIPTIONS_URL = IS_ANDROID_STORE
  ? 'https://play.google.com/store/account/subscriptions'
  : 'https://apps.apple.com/account/subscriptions';
