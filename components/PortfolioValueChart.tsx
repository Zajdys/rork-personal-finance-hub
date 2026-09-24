import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import type { ThemeColors } from '@/constants/theme-colors';
import type { ChartSeriesMode } from '@/lib/portfolio-chart-series';
import type { PortfolioValuePoint, SnapshotPeriod } from '@/lib/portfolio-snapshots';

const PERIODS: SnapshotPeriod[] = ['1W', '1M', '3M', '6M', '1Y', 'MAX'];

const PERIOD_LABELS: Record<SnapshotPeriod, string> = {
  '1W': '1T',
  '1M': '1M',
  '3M': '3M',
  '6M': '6M',
  '1Y': '1R',
  MAX: 'Max',
};

const GREEN = '#16A34A';
const RED = '#DC2626';

function formatAxisMoney(n: number, locale: string): string {
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 })}M`;
  }
  if (Math.abs(n) >= 10_000) {
    return `${Math.round(n / 1000).toLocaleString(locale)}k`;
  }
  return n.toLocaleString(locale, { maximumFractionDigits: 0 });
}

function formatAxisDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  });
}

export function PortfolioValueChart({
  points,
  period,
  onPeriodChange,
  seriesMode,
  onSeriesModeChange,
  modeValueLabel,
  modeProfitLabel,
  colors,
  locale,
  fillingHint,
  height = 160,
}: {
  points: PortfolioValuePoint[];
  period: SnapshotPeriod;
  onPeriodChange: (p: SnapshotPeriod) => void;
  seriesMode: ChartSeriesMode;
  onSeriesModeChange: (m: ChartSeriesMode) => void;
  modeValueLabel: string;
  modeProfitLabel: string;
  colors: ThemeColors;
  locale: string;
  fillingHint: string;
  height?: number;
}) {
  const width = 320;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 8;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const geometry = useMemo(() => {
    if (points.length < 2) return null;

    const values = points.map((p) => p.value);
    let minV = Math.min(...values);
    let maxV = Math.max(...values);

    // Zisk může jít pod nulu — osa musí zahrnout 0, když křivka mění znaménko.
    if (seriesMode === 'profit') {
      if (minV > 0) minV = 0;
      if (maxV < 0) maxV = 0;
    }

    if (maxV - minV < 1e-6) {
      minV -= 1;
      maxV += 1;
    }
    const span = maxV - minV;

    const coords = points.map((p, i) => {
      const x = padL + (points.length === 1 ? chartW / 2 : (i / (points.length - 1)) * chartW);
      const y = padT + (1 - (p.value - minV) / span) * chartH;
      return { x, y, ...p };
    });

    const d = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
      .join(' ');

    const zeroY =
      minV < 0 && maxV > 0 ? padT + (1 - (0 - minV) / span) * chartH : null;

    return {
      d,
      coords,
      minV,
      maxV,
      zeroY,
      first: points[0]!,
      last: points[points.length - 1]!,
    };
  }, [points, chartW, chartH, seriesMode]);

  const lineColor = useMemo(() => {
    if (!geometry || points.length < 2) return colors.primary;
    if (seriesMode === 'profit') {
      return geometry.last.value >= 0 ? GREEN : RED;
    }
    return geometry.last.value >= geometry.first.value ? GREEN : RED;
  }, [geometry, points.length, colors.primary, seriesMode]);

  const showFilling = points.length < 3;

  return (
    <View>
      <View style={styles.modeRow}>
        {(
          [
            { id: 'value' as const, label: modeValueLabel },
            { id: 'profit' as const, label: modeProfitLabel },
          ] as const
        ).map((m) => {
          const active = seriesMode === m.id;
          return (
            <TouchableOpacity
              key={m.id}
              style={[
                styles.modeChip,
                { backgroundColor: colors.muted, borderColor: colors.border },
                active && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => onSeriesModeChange(m.id)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Text
                style={[
                  styles.modeText,
                  { color: colors.textSecondary },
                  active && { color: colors.onPrimary, fontWeight: '700' },
                ]}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.periodRow}>
        {PERIODS.map((p) => {
          const active = p === period;
          return (
            <TouchableOpacity
              key={p}
              style={[
                styles.periodChip,
                { backgroundColor: colors.muted },
                active && { backgroundColor: colors.primary },
              ]}
              onPress={() => onPeriodChange(p)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Text
                style={[
                  styles.periodText,
                  { color: colors.textSecondary },
                  active && { color: colors.onPrimary, fontWeight: '700' },
                ]}
              >
                {PERIOD_LABELS[p]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {showFilling ? (
        <View style={[styles.fillingBox, { borderColor: colors.border }]}>
          <Text style={[styles.fillingText, { color: colors.textSecondary }]}>{fillingHint}</Text>
          {points.length === 1 ? (
            <Text style={[styles.fillingSub, { color: colors.text }]}>
              {formatAxisMoney(points[0]!.value, locale)} · {formatAxisDate(points[0]!.date, locale)}
            </Text>
          ) : null}
        </View>
      ) : geometry ? (
        <View>
          <View style={styles.chartMeta}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
              {formatAxisMoney(geometry.minV, locale)} – {formatAxisMoney(geometry.maxV, locale)}
            </Text>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>
              {formatAxisDate(geometry.first.date, locale)} →{' '}
              {formatAxisDate(geometry.last.date, locale)}
            </Text>
          </View>
          <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
            <Line
              x1={padL}
              y1={padT + chartH}
              x2={padL + chartW}
              y2={padT + chartH}
              stroke={colors.border}
              strokeWidth={1}
            />
            {geometry.zeroY != null ? (
              <Line
                x1={padL}
                y1={geometry.zeroY}
                x2={padL + chartW}
                y2={geometry.zeroY}
                stroke={colors.border}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ) : null}
            <Path
              d={geometry.d}
              stroke={lineColor}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {geometry.coords.length <= 60
              ? geometry.coords.map((c) => (
                  <Circle key={c.date} cx={c.x} cy={c.y} r={2.5} fill={lineColor} />
                ))
              : null}
          </Svg>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  periodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  periodChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  periodText: {
    fontSize: 12,
    fontWeight: '600',
  },
  fillingBox: {
    minHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 8,
  },
  fillingText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  fillingSub: {
    fontSize: 15,
    fontWeight: '700',
  },
  chartMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 11,
  },
});
