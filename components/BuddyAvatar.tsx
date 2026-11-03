import React from 'react';
import { Image, View } from 'react-native';

/** Profilovka AI průvodce — logo MoneyBuddy v kolečku. */
export function BuddyAvatar({ size = 28 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
      <Image
        source={require('@/assets/images/app-icon-180.png')}
        style={{ width: size, height: size }}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}
