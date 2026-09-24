import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { PortfolioPositionCalc } from '@/lib/investment-portfolio-calc';
import type { ThemeColors } from '@/constants/theme-colors';

const SLICE_COLORS = ['#3B82F6', '#EAB308', '#8B5CF6', '#10B981', '#EC4899', '#F97316', '#06B6D4'];

export type PieSlice = {
  label: string;
  value: number;
  pct: number;
  color: string;
};

export function buildAllocationSlices(
  positions: PortfolioPositionCalc[],
  otherLabel: string,
  maxSlices = 6,
  minPctForOwnSlice = 3,
): PieSlice[] {
  const withValue = positions.filter((p) => (p.current_value ?? 0) > 0);
  const total = withValue.reduce((s, p) => s + (p.current_value ?? 0), 0);
  if (total <= 0) return [];

  const sorted = [...withValue].sort(
    (a, b) => (b.current_value ?? 0) - (a.current_value ?? 0),
  );

  const slices: PieSlice[] = [];
  let otherValue = 0;

  for (const p of sorted) {
    const v = p.current_value ?? 0;
    const pct = (v / total) * 100;
    if (slices.length < maxSlices - 1 && pct >= minPctForOwnSlice) {
      slices.push({
        label: p.ticker,
        value: v,
        pct: Math.round(pct),
        color: SLICE_COLORS[slices.length % SLICE_COLORS.length]!,
      });
    } else {
      otherValue += v;
    }
  }

  if (otherValue > 0) {
    slices.push({
      label: otherLabel,
      value: otherValue,
      pct: Math.round((otherValue / total) * 100),
      color: '#94A3B8',
    });
  }

  return slices;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** SVG arc path for a pie wedge. Sweep must be in (0, 360) — full circle uses Circle. */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

type PiePath =
  | { kind: 'circle'; label: string; color: string; pct: number }
  | { kind: 'arc'; label: string; color: string; pct: number; d: string };

export function PortfolioAllocationPie({
  slices,
  size = 160,
  colors,
}: {
  slices: PieSlice[];
  size?: number;
  colors: ThemeColors;
}) {
  const paths = useMemo((): PiePath[] => {
    const total = slices.reduce((s, sl) => s + sl.value, 0);
    if (total <= 0 || slices.length === 0) return [];

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 2;

    // Jedna položka / ~100 % — plný kruh (SVG arc 360° má start=end a nic nevykreslí).
    const dominant = slices.find((sl) => sl.value / total >= 0.999);
    if (slices.length === 1 || dominant) {
      const sl = dominant ?? slices[0]!;
      return [{ kind: 'circle', label: sl.label, color: sl.color, pct: Math.max(sl.pct, 100) }];
    }

    let angle = 0;
    return slices.map((sl) => {
      const sweep = (sl.value / total) * 360;
      const start = angle;
      const end = angle + sweep;
      angle = end;
      if (sweep >= 359.9) {
        return { kind: 'circle' as const, label: sl.label, color: sl.color, pct: sl.pct };
      }
      return {
        kind: 'arc' as const,
        label: sl.label,
        color: sl.color,
        pct: sl.pct,
        d: describeArc(cx, cy, r, start, end),
      };
    });
  }, [slices, size]);

  if (paths.length === 0) {
    return (
      <View style={[styles.emptyRing, { width: size, height: size, borderColor: colors.border }]}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>—</Text>
      </View>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size}>
        {paths.map((p) =>
          p.kind === 'circle' ? (
            <Circle key={p.label} cx={cx} cy={cy} r={r} fill={p.color} />
          ) : (
            <Path key={p.label} d={p.d} fill={p.color} />
          ),
        )}
      </Svg>
      <View style={styles.legend}>
        {paths.map((p) => (
          <View key={p.label} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: p.color }]} />
            <Text style={[styles.legendLabel, { color: colors.text }]} numberOfLines={1}>
              {p.label}
            </Text>
            <Text style={[styles.legendPct, { color: colors.textSecondary }]}>{p.pct}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  emptyRing: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 18,
  },
  legend: {
    flex: 1,
    gap: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  legendPct: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 36,
    textAlign: 'right',
  },
});
