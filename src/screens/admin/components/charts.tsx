import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Line, Rect } from 'react-native-svg';

import type { AdminDashboard } from '../../../api/types';
import { useI18n } from '../../../i18n';
import { AppText, useTheme } from '../../../ui';
import { formatNumber, formatPercent } from '../lib/format';

// Admin charts (ui-direction-a 2.1 "Chart colours"): the chart palette only, never status colours,
// and every chart has a legend with numbers, so colour is never the only cue.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-11" (a UTC day) → "11 Oct". */
function shortDay(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : day;
}

const CHART_HEIGHT = 140;

/** Sign-ups per UTC day as stacked bars: guests below, accounts on top, with a scale and a legend. */
export function SignupChart({ days }: { days: AdminDashboard['signupsByDay'] }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...days.map((d) => d.guests + d.accounts));
  const scaleMax = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const guests = days.reduce((n, d) => n + d.guests, 0);
  const accounts = days.reduce((n, d) => n + d.accounts, 0);
  const slot = days.length ? width / days.length : 0;
  const gap = slot > 8 ? 2 : slot > 4 ? 1 : 0;
  const bar = Math.max(1, slot - gap);
  const y = (v: number) => CHART_HEIGHT - (v / scaleMax) * CHART_HEIGHT;
  const summary = tr('admin.home.signups.a11y', { days: days.length, guests, accounts });

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      <View style={styles.chartRow}>
        <View style={styles.flex} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 ? (
            <Svg width={width} height={CHART_HEIGHT}>
              {[0, 0.5, 1].map((f) => (
                <Line
                  key={f}
                  x1={0}
                  x2={width}
                  y1={y(scaleMax * f)}
                  y2={y(scaleMax * f)}
                  stroke={t.color.border}
                  strokeWidth={1}
                  strokeDasharray={f === 0 ? undefined : '3 3'}
                />
              ))}
              {days.map((d, i) => {
                const x = i * slot + gap / 2;
                const gh = (d.guests / scaleMax) * CHART_HEIGHT;
                const ah = (d.accounts / scaleMax) * CHART_HEIGHT;
                return (
                  <G key={d.date}>
                    {gh > 0 ? <Rect x={x} y={CHART_HEIGHT - gh} width={bar} height={gh} fill={t.chart.guests} rx={bar > 6 ? 2 : 0} /> : null}
                    {ah > 0 ? (
                      <Rect x={x} y={CHART_HEIGHT - gh - ah - (gh > 0 ? 1 : 0)} width={bar} height={ah} fill={t.chart.accounts} rx={bar > 6 ? 2 : 0} />
                    ) : null}
                  </G>
                );
              })}
            </Svg>
          ) : (
            <View style={{ height: CHART_HEIGHT }} />
          )}
        </View>
        <View style={styles.scale}>
          <AppText variant="labelS" color="textTertiary" tabular>
            {formatNumber(scaleMax)}
          </AppText>
          <AppText variant="labelS" color="textTertiary" tabular>
            {formatNumber(scaleMax / 2)}
          </AppText>
          <AppText variant="labelS" color="textTertiary" tabular>
            0
          </AppText>
        </View>
      </View>
      {days.length > 1 ? (
        <View style={styles.axis}>
          <AppText variant="labelS" color="textTertiary">
            {shortDay(days[0].date)}
          </AppText>
          <AppText variant="labelS" color="textTertiary">
            {shortDay(days[Math.floor(days.length / 2)].date)}
          </AppText>
          <AppText variant="labelS" color="textTertiary">
            {shortDay(days[days.length - 1].date)}
          </AppText>
        </View>
      ) : null}
      <View style={styles.legendInline}>
        <LegendDot color={t.chart.guests} label={tr('admin.home.signups.guests')} value={formatNumber(guests)} />
        <LegendDot color={t.chart.accounts} label={tr('admin.home.signups.accounts')} value={formatNumber(accounts)} />
      </View>
    </View>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <AppText variant="bodyS" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="labelM" tabular>
        {value}
      </AppText>
    </View>
  );
}

export type Segment = { key: string; label: string; value: number; color: string };

/**
 * A 12 dp stacked bar (radius pill, 2 dp gaps in the surface colour) and a legend row per segment:
 * dot, name, count and share.
 */
export function StackedBar({ segments, total, emptyLabel }: { segments: Segment[]; total?: number; emptyLabel: string }) {
  const t = useTheme();
  const sum = total ?? segments.reduce((n, s) => n + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  return (
    <View style={styles.stack}>
      <View
        style={[styles.bar, { backgroundColor: t.color.fill, borderRadius: t.radius.pill }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {sum > 0
          ? visible.map((s, i) => (
              <View
                key={s.key}
                style={{
                  flex: s.value,
                  backgroundColor: s.color,
                  borderLeftWidth: i === 0 ? 0 : 2,
                  borderLeftColor: t.color.surface1,
                }}
              />
            ))
          : null}
      </View>
      {sum === 0 ? (
        <AppText variant="bodyS" color="textTertiary">
          {emptyLabel}
        </AppText>
      ) : null}
      <View>
        {segments.map((s) => (
          <View key={s.key} style={styles.legendRow} accessible accessibilityLabel={`${s.label}: ${s.value}, ${formatPercent(sum ? s.value / sum : 0)}`}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <AppText variant="bodyM" style={styles.flex}>
              {s.label}
            </AppText>
            <AppText variant="labelM" tabular>
              {formatNumber(s.value)}
            </AppText>
            <AppText variant="bodyS" color="textTertiary" tabular style={styles.pct}>
              {formatPercent(sum ? s.value / sum : 0)}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

/** A 4 dp primary bar sized to a share (top countries, app versions). */
export function ShareBar({ share }: { share: number }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(1, share));
  return (
    <View style={[styles.share, { backgroundColor: t.color.fill, borderRadius: t.radius.pill }]}>
      <View style={{ width: `${pct * 100}%`, height: 4, backgroundColor: t.color.primary, borderRadius: t.radius.pill }} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chartRow: { flexDirection: 'row', gap: 8 },
  scale: { height: CHART_HEIGHT, justifyContent: 'space-between', alignItems: 'flex-end', minWidth: 24, marginTop: -6, marginBottom: -6 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, marginRight: 32 },
  legendInline: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  stack: { gap: 12 },
  bar: { height: 12, flexDirection: 'row', overflow: 'hidden' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  pct: { minWidth: 48, textAlign: 'right' },
  share: { height: 4, overflow: 'hidden', marginTop: 6 },
});
