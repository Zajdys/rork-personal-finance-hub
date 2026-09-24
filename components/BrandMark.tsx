import React from 'react';
import Svg, { G, Circle, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

type Props = {
  size?: number;
  variant?: 'gradient' | 'white' | 'dark';
};

export default function BrandMark({ size = 40, variant = 'gradient' }: Props) {
  const fill =
    variant === 'white' ? '#FFFFFF' :
    variant === 'dark' ? '#181433' :
    'url(#mbGrad)';

  return (
    <Svg width={size} height={size} viewBox="0 0 240 240">
      {variant === 'gradient' && (
        <Defs>
          <LinearGradient id="mbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#8B5CF6" />
            <Stop offset="100%" stopColor="#4F46E5" />
          </LinearGradient>
        </Defs>
      )}
      <G transform="rotate(10 76 214)" fill={fill}>
        <Circle cx="76" cy="82" r="26" />
        <Rect x="50" y="118" width="52" height="96" rx="26" />
      </G>
      <G fill={fill}>
        <Circle cx="164" cy="42" r="26" />
        <Rect x="138" y="78" width="52" height="136" rx="26" />
      </G>
    </Svg>
  );
}
