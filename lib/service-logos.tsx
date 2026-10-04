import React from 'react';
import { View, Text, Image } from 'react-native';

const SERVICE_LOCAL_LOGOS: Record<string, any> = {
  'netflix': require('../assets/logos/netflix.png'),
  'spotify': require('../assets/logos/spotify.png'),
  'patreon': require('../assets/logos/patreon.png'),
  'youtube': require('../assets/logos/youtube.png'),
  'disney': require('../assets/logos/disney.png'),
  'apple': require('../assets/logos/apple.png'),
  'google': require('../assets/logos/google.png'),
  'microsoft': require('../assets/logos/microsoft.png'),
};

const SERVICE_BRANDS: Record<string, { bg: string; color: string; letter: string }> = {
  'netflix': { bg: '#E50914', color: '#ffffff', letter: 'N' },
  'spotify': { bg: '#1DB954', color: '#ffffff', letter: 'S' },
  'youtube': { bg: '#FF0000', color: '#ffffff', letter: '▶' },
  'youtube premium': { bg: '#FF0000', color: '#ffffff', letter: '▶' },
  'patreon': { bg: '#FF424D', color: '#ffffff', letter: 'P' },
  'disney': { bg: '#113CCF', color: '#ffffff', letter: 'D+' },
  'disney+': { bg: '#113CCF', color: '#ffffff', letter: 'D+' },
  'apple': { bg: '#000000', color: '#ffffff', letter: '🍎' },
  'icloud': { bg: '#147EFB', color: '#ffffff', letter: '☁' },
  'adobe': { bg: '#FF0000', color: '#ffffff', letter: 'Ai' },
  'microsoft': { bg: '#00A4EF', color: '#ffffff', letter: 'M' },
  'deezer': { bg: '#A238FF', color: '#ffffff', letter: 'D' },
  'google': { bg: '#4285F4', color: '#ffffff', letter: 'G' },
  'hbo': { bg: '#8B5CF6', color: '#ffffff', letter: 'HBO' },
  'amazon': { bg: '#FF9900', color: '#000000', letter: 'a' },
  'tidal': { bg: '#000000', color: '#ffffff', letter: 'T' },
  'duolingo': { bg: '#58CC02', color: '#ffffff', letter: '🦉' },
  'chatgpt': { bg: '#10A37F', color: '#ffffff', letter: 'AI' },
  'claude': { bg: '#D97757', color: '#ffffff', letter: 'C' },
  'vodafone': { bg: '#ffffff', color: '#E60000', letter: 'V' },
};

/** Písmeno / značka na barevném pozadí (bez lokálních PNG) — např. fallback po selhání Clearbit. */
export function ServiceLogoLetterPlaceholder({
  name,
  size = 48,
  isDimmed,
}: {
  name: string;
  size?: number;
  isDimmed?: boolean;
}) {
  const key = name.toLowerCase().trim();
  const brandMatch = Object.entries(SERVICE_BRANDS).find(([k]) => key.includes(k));
  const brand = brandMatch?.[1];
  const bg = brand?.bg ?? '#6c47ff';
  const letter = brand?.letter ?? name.charAt(0).toUpperCase();
  const color = brand?.color ?? '#ffffff';

  return (
    <View style={{ opacity: isDimmed ? 0.55 : 1 }}>
      <View style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Text style={{
          color,
          fontSize: letter.length > 1 ? size * 0.28 : size * 0.45,
          fontWeight: 'bold',
          textAlign: 'center',
        }}>
          {letter}
        </Text>
      </View>
    </View>
  );
}

export function ServiceLogo({
  name,
  size = 48,
  isDimmed,
}: {
  name: string;
  size?: number;
  isDimmed?: boolean;
}) {
  const key = name.toLowerCase().trim();
  const logoMatch = Object.entries(SERVICE_LOCAL_LOGOS).find(([k]) => key.includes(k));

  if (logoMatch) {
    return (
      <View style={{ opacity: isDimmed ? 0.55 : 1 }}>
        <View style={{
          width: size,
          height: size,
          borderRadius: size * 0.22,
          backgroundColor: '#ffffff',
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 2,
        }}>
          <Image
            source={logoMatch[1]}
            style={{ width: size - 8, height: size - 8 }}
            resizeMode="contain"
          />
        </View>
      </View>
    );
  }

  return <ServiceLogoLetterPlaceholder name={name} size={size} isDimmed={isDimmed} />;
}
