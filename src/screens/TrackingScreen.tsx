import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TripAlarm, type GpsHealth, type TripStatus } from '../../modules/trip-alarm/src';
import { formatDistance, formatDuration, formatRadius } from '../lib/format';
import { Body, Button, Card, Label, StatusDot } from '../ui/components';
import { useTheme, type Theme } from '../ui/theme';

const HEALTH: Record<GpsHealth, { text: string; color: (t: Theme) => string }> = {
  waiting: { text: 'Waiting for GPS…', color: (t) => t.muted },
  good: { text: 'GPS good', color: (t) => t.good },
  weak: { text: 'GPS weak', color: (t) => t.warn },
  lost: { text: 'GPS lost: the alarm will ring by estimate', color: (t) => t.bad },
};

const TIER_TEXT = {
  far: 'Saving battery while you are far away',
  mid: 'Checking every 30 seconds',
  near: 'High accuracy: you are getting close',
};

const REASON_TEXT: Record<string, string> = {
  ARRIVED: 'You are inside the circle.',
  PASSED_THROUGH: 'You are at your stop.',
  ETA: 'You are a few minutes away.',
  CLOSEST_POINT_PASSED: 'This is the closest your route gets to the pin.',
  ESTIMATED: 'GPS lost. By our estimate you are there now.',
  LEFT_AREA: 'You left the area.',
};

export function TrackingScreen({ status }: { status: TripStatus }) {
  const t = useTheme();
  const trip = status.trip;
  if (!trip || !TripAlarm) return null;
  const native = TripAlarm;
  const health = HEALTH[status.health ?? 'waiting'];
  const leave = trip.mode === 'leave';
  const ringing = status.state === 'ringing';
  const uncertain = status.trigger === 'CLOSEST_POINT_PASSED' || status.trigger === 'ESTIMATED';

  const rule = leave
    ? `Rings when you are more than ${formatRadius(trip.radiusM, trip.useMiles)} away`
    : trip.minutesBefore
      ? `Rings ${trip.minutesBefore} min before or within ${formatRadius(trip.radiusM, trip.useMiles)}`
      : `Rings within ${formatRadius(trip.radiusM, trip.useMiles)}`;

  function confirmStop() {
    Alert.alert('Stop this trip?', 'The alarm will not ring.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: () => void native.stopTrip() },
    ]);
  }

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.container}>
      <Label>{leave ? 'Leaving' : 'On the way to'}</Label>
      <Text style={[styles.destination, { color: t.text }]} numberOfLines={2}>
        {trip.label}
      </Text>

      {ringing || status.state === 'snoozed' ? (
        <Card style={{ borderColor: t.warn, borderWidth: 2 }}>
          <Text style={[styles.alarmTitle, { color: t.text }]}>
            {ringing ? 'Wake up!' : 'Snoozed: rings again in a minute'}
          </Text>
          {status.trigger ? <Body>{REASON_TEXT[status.trigger] ?? ''}</Body> : null}
          {ringing ? (
            <>
              <Button title="Dismiss" onPress={() => void native.dismissAlarm()} />
              <Button title="Snooze 1 min" kind="secondary" onPress={() => void native.snoozeAlarm()} />
            </>
          ) : null}
          {uncertain ? (
            <Button title="Not yet, keep tracking" kind="secondary" onPress={() => void native.keepTracking()} />
          ) : null}
        </Card>
      ) : null}

      <Card>
        <View style={styles.bigRow}>
          <View style={styles.bigCell}>
            <Label>Distance</Label>
            <Text style={[styles.big, { color: t.text }]}>
              {status.distanceM != null ? formatDistance(status.distanceM, trip.useMiles) : '–'}
            </Text>
          </View>
          {!leave ? (
            <View style={styles.bigCell}>
              <Label>Arrival in</Label>
              <Text style={[styles.big, { color: t.text }]}>
                {status.etaSec != null ? formatDuration(status.etaSec) : '–'}
              </Text>
            </View>
          ) : null}
        </View>
        {leave && status.armed === false ? <Body muted>Waiting until you are inside the area.</Body> : null}
        <View style={styles.row}>
          <StatusDot color={health.color(t)} />
          <Body>{health.text}</Body>
        </View>
        {status.accuracyM != null ? <Body muted>Accuracy ±{Math.round(status.accuracyM)} m</Body> : null}
        {status.tier ? <Body muted>{TIER_TEXT[status.tier]}</Body> : null}
      </Card>

      <Card>
        <Body>{rule}</Body>
        <Body muted>
          You can lock your phone or use other apps. The alarm rings even in silent mode. Keep location turned on.
        </Body>
      </Card>

      <Button title="Stop trip" kind="danger" onPress={confirmStop} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  destination: { fontSize: 28, fontWeight: '700' },
  alarmTitle: { fontSize: 26, fontWeight: '800' },
  bigRow: { flexDirection: 'row', gap: 12 },
  bigCell: { flex: 1, gap: 4 },
  big: { fontSize: 36, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
