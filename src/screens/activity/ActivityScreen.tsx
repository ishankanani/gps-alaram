import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { formatCount, formatDistance } from '../../lib/format';
import {
  addMonths,
  compareMonths,
  firstMonth,
  groupByDay,
  HISTORY_FILTERS,
  inMonth,
  matchesFilter,
  monthOf,
  monthStats,
  tripBadge,
  useHistory,
  type HistoryFilter,
  type MonthKey,
  type TripRecord,
} from '../../lib/history';
import type { TabScreenProps } from '../../navigation/types';
import { useSavedData } from '../../state/saved';
import {
  AppText,
  Badge,
  Chip,
  ChipRow,
  EmptyState,
  IconButton,
  KindIcon,
  ListItem,
  Screen,
  Section,
  SkeletonTile,
  StatTile,
  useSkeletonDelay,
} from '../../ui';
import { BADGE_LOOK, dayLabel, formatClock, formatPercent, formatSpan, monthLabel, monthOnly, nbsp, plural } from './format';
import { useNow, uses24HourClock } from './time';

const FILTER_KEY = {
  all: 'activity.filter.all',
  woke: 'activity.filter.woke',
  ended: 'activity.filter.ended',
  problems: 'activity.filter.problems',
  demo: 'activity.filter.demo',
} as const satisfies Record<HistoryFilter, string>;

/** "184 km" as value "184" and unit "km" for a StatTile. */
function splitUnit(text: string): { value: string; unit?: string } {
  const i = text.lastIndexOf(' ');
  return i > 0 ? { value: text.slice(0, i), unit: text.slice(i + 1) } : { value: text };
}

/** Time on board for a tile: "23 min", or "6:40 h". */
function onBoardValue(ms: number): { value: string; unit: string } {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return { value: String(minutes), unit: 'min' };
  const rest = minutes % 60;
  return { value: `${Math.floor(minutes / 60)}:${rest < 10 ? '0' : ''}${rest}`, unit: 'h' };
}

/**
 * The Activity tab (ui-direction-a 4.3): the month's numbers (demo rides left out), filters, and
 * every trip of the month grouped by day with how it went. The history never leaves the phone.
 */
export function ActivityScreen({ navigation }: TabScreenProps<'ActivityTab'>) {
  const { t: tr, lang } = useI18n();
  const { data } = useSavedData();
  const history = useHistory();
  const now = useNow();
  const h24 = uses24HourClock();
  const showSkeleton = useSkeletonDelay(!history.loaded);
  const [picked, setPicked] = useState<MonthKey | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const useMiles = data.preferences.useMiles;

  const current = monthOf(now);
  const month = picked && compareMonths(picked, current) <= 0 ? picked : current;
  const trips = history.trips;
  const first = firstMonth(trips);
  const canGoBack = !!first && compareMonths(month, first) > 0;
  const canGoForward = compareMonths(month, current) < 0;
  const ofMonth = trips.filter((t) => inMonth(t.startedAt, month));
  const listed = ofMonth.filter((t) => matchesFilter(t, filter));
  const stats = monthStats(trips, month);

  const planTrip = () => navigation.navigate('MapTab');

  if (history.loaded && trips.length === 0) {
    return (
      <Screen largeTitle={tr('nav.tab.activity')} testID="screen-ActivityTab">
        <EmptyState
          icon="timeline-clock-outline"
          title={tr('activity.empty.title')}
          body={tr('activity.empty.body')}
          action={{ label: tr('activity.empty.action'), onPress: planTrip }}
        />
      </Screen>
    );
  }

  const distance = splitUnit(formatDistance(stats.distanceM, useMiles, lang));
  const onBoard = onBoardValue(stats.onBoardMs);
  const tripRow = (trip: TripRecord) => {
    const look = BADGE_LOOK[tripBadge(trip)];
    const times = trip.endedAt != null ? `${formatClock(trip.startedAt, h24, tr)} → ${formatClock(trip.endedAt, h24, tr)}` : formatClock(trip.startedAt, h24, tr);
    const parts = [times];
    if (trip.distanceM > 0) parts.push(formatDistance(trip.distanceM, useMiles, lang));
    if (trip.endedAt != null) parts.push(formatSpan(trip.endedAt - trip.startedAt));
    const meta = nbsp(parts.join(' · '));
    const badge = tr(look.label);
    return (
      <ListItem
        key={trip.id}
        title={trip.place.name}
        leading={<KindIcon kind={trip.place.kind} />}
        meta={
          <AppText variant="bodyS" color="textTertiary" tabular numberOfLines={1}>
            {meta}
          </AppText>
        }
        trailing={<Badge label={badge} tone={look.tone} />}
        onPress={() => navigation.navigate('TripDetail', { tripId: trip.id })}
        accessibilityLabel={`${trip.place.name}, ${meta}, ${badge}`}
        testID={`activity-trip-${trip.id}`}
      />
    );
  };

  return (
    <Screen largeTitle={tr('nav.tab.activity')} testID="screen-ActivityTab">
      <View style={styles.monthRow}>
        <IconButton
          icon="chevron-left"
          accessibilityLabel={tr('activity.previousMonth')}
          disabled={!canGoBack}
          onPress={() => setPicked(addMonths(month, -1))}
          testID="activity-month-previous"
        />
        <AppText variant="labelL" align="center" style={styles.monthLabel} accessibilityLiveRegion="polite">
          {monthLabel(month, tr)}
        </AppText>
        <IconButton
          icon="chevron-right"
          accessibilityLabel={tr('activity.nextMonth')}
          disabled={!canGoForward}
          onPress={() => setPicked(addMonths(month, 1))}
          testID="activity-month-next"
        />
      </View>

      {!history.loaded ? (
        showSkeleton ? (
          <>
            <View style={styles.grid}>
              <View style={styles.gridRow}>
                <SkeletonTile style={styles.tile} />
                <SkeletonTile style={styles.tile} />
              </View>
              <View style={styles.gridRow}>
                <SkeletonTile style={styles.tile} />
                <SkeletonTile style={styles.tile} />
              </View>
            </View>
            <Section loading style={styles.firstSection} />
          </>
        ) : null
      ) : (
        <>
          <View style={styles.grid}>
            <View style={styles.gridRow}>
              <StatTile label={tr('activity.stat.trips')} value={formatCount(stats.trips, lang)} icon="map-marker-path" style={styles.tile} />
              <StatTile label={tr('activity.stat.distance')} value={distance.value} unit={distance.unit} icon="map-marker-distance" style={styles.tile} />
            </View>
            <View style={styles.gridRow}>
              <StatTile
                label={tr('activity.stat.onTime')}
                value={stats.rated > 0 ? formatPercent((stats.onTime / stats.rated) * 100, lang) : '–'}
                caption={
                  stats.rated > 0
                    ? plural(tr, lang, 'activity.stat.onTimeCaption', stats.onTime, { total: stats.rated })
                    : tr('activity.stat.noAlarms')
                }
                icon="alarm-check"
                style={styles.tile}
              />
              <StatTile label={tr('activity.stat.onBoard')} value={onBoard.value} unit={onBoard.unit} icon="clock-outline" style={styles.tile} />
            </View>
          </View>

          {ofMonth.length > 0 ? (
            <ChipRow radio accessibilityLabel={tr('activity.filters')} style={styles.filters}>
              {HISTORY_FILTERS.map((f) => (
                <Chip
                  key={f}
                  label={tr(FILTER_KEY[f])}
                  selected={filter === f}
                  onPress={() => setFilter(f)}
                  testID={`activity-filter-${f}`}
                />
              ))}
            </ChipRow>
          ) : null}

          {ofMonth.length === 0 ? (
            <Section style={styles.firstSection}>
              <EmptyState variant="inline" icon="calendar-blank-outline" title={tr('activity.emptyMonth', { month: monthOnly(month, tr) })} />
            </Section>
          ) : listed.length === 0 ? (
            <Section style={styles.firstSection}>
              <EmptyState
                variant="inline"
                icon="filter-variant-remove"
                title={tr('activity.emptyFilter', { month: monthOnly(month, tr) })}
                action={{ label: tr('activity.showAll'), onPress: () => setFilter('all') }}
              />
            </Section>
          ) : (
            groupByDay(listed).map((group) => (
              <Section key={group.day} title={dayLabel(group.day, now, tr)}>
                {group.trips.map(tripRow)}
              </Section>
            ))
          )}

          <AppText variant="bodyS" color="textTertiary" align="center" style={styles.footer}>
            {tr('activity.footer')}
          </AppText>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 4, paddingBottom: 8 },
  monthLabel: { flex: 1 },
  grid: { paddingHorizontal: 16, gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1 },
  filters: { marginTop: 16 },
  firstSection: { marginTop: 16 },
  footer: { paddingHorizontal: 32, paddingTop: 24 },
});
