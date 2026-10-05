import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { resolveSubscriptionBrand } from '@/lib/subscription-brands';
import { SUBSCRIPTION_ICON_BY_SLUG } from '@/lib/subscription-brand-icons';

type Props = {
  merchantKey: string;
  size?: number;
  /** Ztlumení (např. pozastavené předplatné) */
  isDimmed?: boolean;
};

/** 8 tlumených barev appky pro monogram fallback */
const MONOGRAM_PALETTE = [
  '#7C6FBF',
  '#5B6BC7',
  '#6B8FCE',
  '#5A9A8E',
  '#8B7E6A',
  '#A67C7C',
  '#7A8B6E',
  '#6E7A8B',
] as const;

function hashToPaletteIndex(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % MONOGRAM_PALETTE.length;
}

function normalizeHex(color: string): string {
  const c = color.trim();
  if (c.startsWith('#')) return c;
  return `#${c}`;
}

/**
 * Logo předplatného: simple-icons SVG na brandColor, nebo monogram.
 * Pouze pro UI předplatného — ne pro kategorie / běžné transakce.
 */
export function BrandIcon({ merchantKey, size = 48, isDimmed }: Props) {
  const resolved = resolveSubscriptionBrand(merchantKey);
  const displayName = resolved?.brand.displayName ?? (merchantKey.trim() || '?');
  const slug = resolved?.brand.slug;
  const icon = slug ? SUBSCRIPTION_ICON_BY_SLUG[slug] : undefined;
  const brandColor = resolved?.brand.brandColor
    ? normalizeHex(resolved.brand.brandColor)
    : undefined;

  const radius = size <= 40 ? 10 : 12;
  const pad = size * 0.22;
  const iconSize = Math.max(1, size - pad * 2);

  if (icon && brandColor) {
    return (
      <View style={{ opacity: isDimmed ? 0.55 : 1 }}>
        <View
          style={[
            styles.box,
            {
              width: size,
              height: size,
              borderRadius: radius,
              backgroundColor: brandColor,
              padding: pad,
            },
          ]}
        >
          <Svg width={iconSize} height={iconSize} viewBox="0 0 24 24">
            <Path d={icon.path} fill="#FFFFFF" />
          </Svg>
        </View>
      </View>
    );
  }

  const letter = (displayName.charAt(0) || '?').toUpperCase();
  const bg = MONOGRAM_PALETTE[hashToPaletteIndex(displayName)];

  return (
    <View style={{ opacity: isDimmed ? 0.55 : 1 }}>
      <View
        style={[
          styles.box,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: bg,
          },
        ]}
      >
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: size * 0.42,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          {letter}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

export default BrandIcon;
