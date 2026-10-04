import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { useDelayedFlag } from '@/hooks/use-delayed-flag';

export type LoadingSkeletonVariant = 'list' | 'cards' | 'summary' | 'invest';

type Props = {
  /** true = právě loading && prázdná data (caller to rozhodne). */
  loading: boolean;
  variant?: LoadingSkeletonVariant;
  /** Anti-blink delay (default 150 ms). */
  delayMs?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function Block({
  height,
  width = '100%',
  color,
}: {
  height: number;
  width?: number | `${number}%`;
  color: string;
}) {
  return (
    <View
      style={{
        height,
        width,
        borderRadius: 8,
        backgroundColor: color,
        marginBottom: 10,
      }}
    />
  );
}

/**
 * Skeleton při načítání. Ukazuje se až po delayMs, ať rychlý fetch neproblikne.
 * Když loading skončí dřív než delay → render null (rovnou data od parenta).
 */
export function LoadingSkeleton({
  loading,
  variant = 'list',
  delayMs = 150,
  style,
  testID = 'loading-skeleton',
}: Props) {
  const { colors } = useTheme();
  const show = useDelayedFlag(loading, delayMs);
  if (!show) return null;

  const muted = colors.muted;
  const cardStyle = [
    styles.card,
    { backgroundColor: colors.card, borderColor: colors.border },
  ];

  if (variant === 'summary') {
    return (
      <View style={[styles.wrap, style]} testID={testID}>
        <View style={cardStyle}>
          <Block height={14} width="40%" color={muted} />
          <Block height={36} width="70%" color={muted} />
          <Block height={16} color={muted} />
          <Block height={16} color={muted} />
        </View>
      </View>
    );
  }

  if (variant === 'invest') {
    return (
      <View style={[styles.wrap, style]} testID={testID}>
        <View style={cardStyle}>
          <Block height={14} width="40%" color={muted} />
          <Block height={36} width="70%" color={muted} />
          <Block height={16} color={muted} />
          <Block height={16} color={muted} />
        </View>
        <View style={cardStyle}>
          <Block height={160} color={muted} />
        </View>
        <View style={cardStyle}>
          <Block height={16} color={muted} />
          <Block height={52} color={muted} />
          <Block height={52} color={muted} />
          <Block height={52} color={muted} />
        </View>
      </View>
    );
  }

  if (variant === 'cards') {
    return (
      <View style={[styles.wrap, style]} testID={testID}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={cardStyle}>
            <Block height={18} width="55%" color={muted} />
            <Block height={12} width="35%" color={muted} />
            <Block height={10} color={muted} />
            <Block height={10} width="80%" color={muted} />
          </View>
        ))}
      </View>
    );
  }

  // list — řádky seznamu (tx, atd.)
  return (
    <View style={[styles.wrap, style]} testID={testID}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[styles.listRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: muted }]} />
          <View style={{ flex: 1 }}>
            <Block height={14} width="60%" color={muted} />
            <Block height={12} width="40%" color={muted} />
          </View>
          <Block height={14} width={56} color={muted} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 4,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
});
