import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TripAlarm } from '../../../modules/trip-alarm/src';
import { useI18n, type Key } from '../../i18n';
import { formatDistance } from '../../lib/format';
import {
  deleteTrip,
  restoreTrip,
  setTripFeedback,
  tripBadge,
  useHistory,
  type TripFeedback,
  type TripRecord,
} from '../../lib/history';
import { openSheet } from '../../navigation/sheet';
import type { RootScreenProps } from '../../navigation/types';
import {
  AppText,
  Banner,
  Button,
  Card,
  Chip,
  ChipWrap,
  EmptyState,
  IconButton,
  KeyValueRow,
  Screen,
  Section,
  SkeletonCard,
  StickyFooter,
  useDialogs,
  useSkeletonDelay,
  useToast,
  type BannerTone,
} from '../../ui';
import { formatClock, formatSpan, fullDate, nbsp } from './format';
import { RouteSketch } from './RouteSketch';
import { uses24HourClock } from './time';

const FEEDBACK: { id: TripFeedback; label: Key }[] = [
  { id: 'right', label: 'activity.feedback.right' },
  { id: 'early', label: 'activity.feedback.early' },
  { id: 'late', label: 'activity.feedback.late' },
];

/** GPS lost for less than this is not worth mentioning. */
const GPS_NOTEWORTHY_MS = 60_000;

/**
 * TripDetail (ui-direction-a 4.3): one finished trip from the history: the way travelled, how it
 * ended, when the alarm rang, the rider's feedback, and "Ride again".
 */
export function TripDetailScreen({ navigation, route }: RootScreenProps<'TripDetail'>) {
  const { t: tr } = useI18n();
  const history = useHistory();
  const showSkeleton = useSkeletonDelay(!history.loaded);
  const trip = history.trips.find((t) => t.id === route.params.tripId) ?? null;

  if (!history.loaded) {
    return (
      <Screen topBar={{ title: tr('activity.trip.title') }} testID="screen-TripDetail">
        {showSkeleton ? <SkeletonCard style={styles.skeleton} /> : null}
      </Screen>
    );
  }
  if (!trip) {
    return (
      <Screen topBar={{ title: tr('activity.trip.title') }} testID="screen-TripDetail">
        <EmptyState
          icon="timeline-remove-outline"
          title={tr('activity.trip.missing.title')}
          body={tr('activity.trip.missing.body')}
          action={{ label: tr('common.back'), onPress: () => navigation.goBack() }}
        />
      </Screen>
    );
  }
  return <TripDetail trip={trip} navigation={navigation} />;
}

function TripDetail({ trip, navigation }: { trip: TripRecord; navigation: RootScreenProps<'TripDetail'>['navigation'] }) {
  const { t: tr, lang } = useI18n();
  const toast = useToast();
  const dialogs = useDialogs();
  const h24 = uses24HourClock();
  // The native log exists only on the phone that ran the trip, and only until it is cleaned up.
  const [hasLog] = useState(() => {
    try {
      return !!trip.logName && !!TripAlarm?.listTripLogs().some((f) => f.name === trip.logName);
    } catch {
      return false;
    }
  });
  const badge = tripBadge(trip);
  const distance = (m: number) => nbsp(formatDistance(m, trip.useMiles, lang));
  const clock = (ts: number) => formatClock(ts, h24, tr);
  const strength = tr(`strength.${trip.strength}` as Key);

  async function more() {
    const choice = await openSheet({
      options: [
        ...(hasLog
          ? [{ id: 'share', label: tr('activity.trip.share'), description: tr('activity.trip.shareBody'), icon: 'share-variant-outline' as const }]
          : []),
        { id: 'delete', label: tr('activity.trip.delete'), icon: 'delete-outline', destructive: true },
      ],
    });
    if (choice === 'share' && trip.logName) {
      await TripAlarm?.shareTripLog(trip.logName).catch(() => toast.show({ message: tr('ui.failed') }));
    } else if (choice === 'delete') {
      const confirmed = await dialogs.confirm({
        title: tr('activity.trip.deleteTitle'),
        message: tr('activity.trip.deleteBody'),
        confirmLabel: tr('activity.trip.delete'),
        tone: 'danger',
      });
      if (!confirmed) return;
      deleteTrip(trip.id);
      navigation.goBack();
      toast.show({
        id: 'trip-deleted',
        message: tr('activity.trip.deleted'),
        icon: 'delete-outline',
        action: { label: tr('saved.undo'), onPress: () => restoreTrip(trip) },
      });
    }
  }

  // How it ended, in one Banner.
  let banner: { tone: BannerTone; title?: string; body: string; action?: { label: string; onPress: () => void } };
  switch (badge) {
    case 'onTime': {
      const r = trip.rang;
      let body: string | null = null;
      if (trip.mode === 'leave') body = tr('activity.trip.outcome.wokeLeave');
      else if (r?.etaSec != null && r.distanceM != null)
        body = tr('activity.trip.outcome.wokeAt', { eta: formatSpan(r.etaSec * 1000), distance: distance(r.distanceM) });
      else if (r?.distanceM != null) body = tr('activity.trip.outcome.wokeAtDistance', { distance: distance(r.distanceM) });
      banner = body
        ? { tone: 'success', title: tr('activity.trip.outcome.woke'), body }
        : { tone: 'success', body: tr('activity.trip.outcome.woke') };
      break;
    }
    case 'tooEarly':
      banner = { tone: 'warning', title: tr('activity.trip.outcome.early'), body: tr('activity.trip.outcome.earlyBody') };
      break;
    case 'tooLate':
      banner = { tone: 'warning', title: tr('activity.trip.outcome.late'), body: tr('activity.trip.outcome.lateBody') };
      break;
    case 'ended':
      banner = { tone: 'neutral', body: tr('activity.trip.outcome.ended') };
      break;
    case 'stoppedByPhone':
      banner = {
        tone: 'danger',
        title: tr('activity.trip.outcome.stopped'),
        body: tr('activity.trip.outcome.stoppedBody'),
        action: {
          label: tr('activity.trip.outcome.fixBattery'),
          onPress: () => navigation.navigate('Setup', { entry: 'arrived', focus: 'battery' }),
        },
      };
      break;
    case 'didntStart':
      banner = {
        tone: 'danger',
        title: tr('activity.trip.outcome.error'),
        body: trip.message || tr('activity.trip.outcome.errorBody'),
        action: { label: tr('activity.trip.outcome.checkPermissions'), onPress: () => navigation.navigate('Setup', { entry: 'arrived' }) },
      };
      break;
    case 'demo':
      banner = { tone: 'info', body: tr('activity.trip.outcome.demo') };
      break;
  }

  let alarm: string;
  if (trip.mode === 'leave') alarm = tr('activity.trip.alarmLeave', { distance: distance(trip.radiusM), strength });
  else if (trip.minutesBefore != null) alarm = tr('activity.trip.alarmTime', { minutes: trip.minutesBefore, strength });
  else alarm = tr('activity.trip.alarmDistance', { distance: distance(trip.radiusM), strength });

  let rang: string;
  if (!trip.rang) rang = tr('activity.trip.notRang');
  else if (trip.rang.at == null) rang = tr('activity.trip.rangUnseen');
  else if (trip.rang.etaSec != null && trip.rang.distanceM != null)
    rang = tr('activity.trip.rangBefore', { time: clock(trip.rang.at), eta: formatSpan(trip.rang.etaSec * 1000), distance: distance(trip.rang.distanceM) });
  else if (trip.rang.distanceM != null) rang = tr('activity.trip.rangDistance', { time: clock(trip.rang.at), distance: distance(trip.rang.distanceM) });
  else rang = clock(trip.rang.at);

  const unknown = tr('activity.trip.unknown');
  const rows: { label: string; value: string; numeric?: boolean }[] = [
    { label: tr('activity.trip.started'), value: clock(trip.startedAt), numeric: true },
    {
      label: tr(trip.outcome === 'woke' ? 'activity.trip.arrived' : 'activity.trip.ended'),
      value: trip.endedAt != null ? clock(trip.endedAt) : unknown,
      numeric: true,
    },
    { label: tr('activity.trip.duration'), value: trip.endedAt != null ? formatSpan(trip.endedAt - trip.startedAt) : unknown, numeric: true },
    { label: tr('activity.trip.travelled'), value: trip.distanceM > 0 ? distance(trip.distanceM) : unknown, numeric: true },
    { label: tr('activity.trip.alarm'), value: alarm },
    { label: tr('activity.trip.rang'), value: rang },
    {
      label: tr('activity.trip.gps'),
      value: trip.gpsLostMs >= GPS_NOTEWORTHY_MS ? tr('activity.trip.gpsLost', { duration: formatSpan(trip.gpsLostMs) }) : tr('activity.trip.gpsGood'),
    },
  ];

  const askFeedback = trip.outcome === 'woke' && !trip.demo;

  return (
    <Screen
      topBar={{
        title: tr('activity.trip.title'),
        trailing: (
          <IconButton icon="dots-vertical" accessibilityLabel={tr('activity.trip.more')} onPress={() => void more()} testID="trip-detail-more" />
        ),
      }}
      footer={
        <StickyFooter>
          <Button
            label={tr('activity.trip.rideAgain')}
            icon="replay"
            block
            onPress={() => navigation.navigate('Tabs', { screen: 'MapTab', params: { stopId: trip.place.id } })}
            testID="trip-detail-ride-again"
          />
        </StickyFooter>
      }
      testID="screen-TripDetail">
      <RouteSketch trip={trip} accessibilityLabel={tr('activity.trip.map', { name: trip.place.name })} />

      <View style={styles.header}>
        <AppText variant="titleM" numberOfLines={2}>
          {trip.place.name}
        </AppText>
        <AppText variant="bodyM" color="textSecondary">
          {fullDate(trip.startedAt, tr)}
        </AppText>
      </View>

      <Banner tone={banner.tone} title={banner.title} body={banner.body} action={banner.action} style={styles.banner} />

      <Section style={styles.section}>
        {rows.map((row, i) => (
          <KeyValueRow key={row.label} label={row.label} value={row.value} numeric={row.numeric} last={i === rows.length - 1} />
        ))}
      </Section>

      {askFeedback ? (
        <Card title={tr('activity.feedback.title')} style={styles.card}>
          <ChipWrap radio accessibilityLabel={tr('activity.feedback.title')}>
            {FEEDBACK.map((f) => (
              <Chip
                key={f.id}
                label={tr(f.label)}
                selected={trip.feedback === f.id}
                onPress={() => {
                  if (trip.feedback === f.id) return;
                  setTripFeedback(trip.id, f.id);
                  toast.show({ id: 'feedback', message: tr('activity.feedback.thanks'), icon: 'check-circle-outline' });
                }}
                testID={`trip-feedback-${f.id}`}
              />
            ))}
          </ChipWrap>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  skeleton: { marginHorizontal: 16, marginTop: 8, height: 220 },
  header: { paddingHorizontal: 16, paddingTop: 16, gap: 4 },
  banner: { marginHorizontal: 16, marginTop: 16 },
  section: { marginTop: 16 },
  card: { marginHorizontal: 16, marginTop: 24 },
});
