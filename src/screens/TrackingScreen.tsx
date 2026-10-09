import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TripAlarm, type GpsHealth, type TripStatus } from '../../modules/trip-alarm/src';
import { useI18n } from '../i18n';
import { formatDistance, formatDuration, formatRadius } from '../lib/format';
import type { StopKind } from '../lib/stations/text';
import { TripMap } from '../map/TripMap';
import { Button, Icon, KindIcon, Label, StatusDot } from '../ui/components';
import { radius, useTheme, type Theme } from '../ui/theme';

const HEALTH_COLOR: Record<GpsHealth, (t: Theme) => string> = {
  waiting: (t) => t.muted,
  good: (t) => t.good,
  weak: (t) => t.warn,
  lost: (t) => t.bad,
};

type Props = { status: TripStatus; kind: StopKind | 'place'; trail: { latitude: number; longitude: number }[] };

export function TrackingScreen({ status, kind, trail }: Props) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const trip = status.trip;
  if (!trip || !TripAlarm) return null;
  const native = TripAlarm;
  const leave = trip.mode === 'leave';
  const ringing = status.state === 'ringing';
  const snoozed = status.state === 'snoozed';
  const uncertain = status.trigger === 'CLOSEST_POINT_PASSED' || status.trigger === 'ESTIMATED';
  const health = status.health ?? 'waiting';
  const estimated = status.estimated === true;
  const approx = estimated ? '≈ ' : '';
  const user =
    status.latitude != null && status.longitude != null ? { latitude: status.latitude, longitude: status.longitude } : null;

  const rule = leave
    ? tr('place.ruleLeave', { distance: formatRadius(trip.radiusM, trip.useMiles, lang) })
    : trip.minutesBefore
      ? tr('place.ruleTime', { minutes: trip.minutesBefore })
      : tr('place.ruleDistance', { distance: formatRadius(trip.radiusM, trip.useMiles, lang) });

  function confirmStop() {
    Alert.alert(tr('trip.stopConfirm.title'), tr('trip.stopConfirm.body'), [
      { text: tr('trip.stopConfirm.keep'), style: 'cancel' },
      { text: tr('trip.stopConfirm.stop'), style: 'destructive', onPress: () => void native.stopTrip() },
    ]);
  }

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <View style={styles.map}>
        <TripMap
          destination={{ latitude: trip.latitude, longitude: trip.longitude }}
          kind={kind}
          radiusM={trip.radiusM}
          user={user}
          estimated={estimated}
          trail={trail}
          padding={{ top: insets.top + 110, bottom: 56 }}
        />
        <View style={[styles.mapHeader, { top: insets.top + 10, backgroundColor: t.surface, shadowColor: t.shadow }]}>
          <KindIcon kind={kind} size={38} />
          <View style={styles.mapHeaderText}>
            <Label>{tr(trip.demo ? 'trip.demo' : leave ? 'trip.leaving' : 'trip.onTheWay')}</Label>
            <Text style={[styles.destination, { color: t.text }]} numberOfLines={1}>
              {trip.label}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={[styles.panel, { backgroundColor: t.surface, shadowColor: t.shadow }]}
        contentContainerStyle={[styles.panelContent, { paddingBottom: insets.bottom + 20 }]}>
        {ringing || snoozed ? (
          <View style={[styles.alarm, { backgroundColor: ringing ? t.accent : t.surfaceAlt }]}>
            <View style={styles.alarmTitleRow}>
              <Icon name={ringing ? 'alarm-light' : 'sleep'} size={28} color={ringing ? t.onAccent : t.text} />
              <Text style={[styles.alarmTitle, { color: ringing ? t.onAccent : t.text }]}>
                {ringing ? tr('trip.wakeUp') : tr('trip.snoozed')}
              </Text>
            </View>
            {status.trigger ? (
              <Text style={[styles.alarmBody, { color: ringing ? t.onAccent : t.muted }]}>{tr(`reason.${status.trigger}`)}</Text>
            ) : null}
            {ringing ? (
              <>
                <Button title={tr('trip.dismiss')} kind="primary" icon="check" onPress={() => void native.dismissAlarm()} />
                <Button title={tr('trip.snooze')} kind="secondary" icon="sleep" onPress={() => void native.snoozeAlarm()} />
              </>
            ) : null}
            {uncertain ? (
              <Button title={tr('trip.notYet')} kind="secondary" icon="map-marker-path" onPress={() => void native.keepTracking()} />
            ) : null}
          </View>
        ) : null}

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Label>{tr('trip.distance')}</Label>
            <Text style={[styles.big, { color: t.text }]}>
              {status.distanceM != null ? approx + formatDistance(status.distanceM, trip.useMiles, lang) : '–'}
            </Text>
          </View>
          {!leave ? (
            <View style={styles.stat}>
              <Label>{tr('trip.arrival')}</Label>
              <Text style={[styles.big, { color: t.text }]}>{status.etaSec != null ? approx + formatDuration(status.etaSec) : '–'}</Text>
            </View>
          ) : null}
        </View>

        {leave && status.armed === false ? <Text style={[styles.note, { color: t.muted }]}>{tr('trip.waitingInside')}</Text> : null}

        <View style={[styles.pill, { backgroundColor: t.surfaceAlt }]}>
          <StatusDot color={estimated ? t.warn : HEALTH_COLOR[health](t)} />
          <Text style={[styles.pillText, { color: t.text }]}>{tr(estimated ? 'trip.gps.estimating' : `trip.gps.${health}`)}</Text>
          {status.accuracyM != null && !estimated ? (
            <Text style={[styles.pillMuted, { color: t.muted }]}>{tr('trip.accuracy', { meters: Math.round(status.accuracyM) })}</Text>
          ) : null}
        </View>
        {estimated ? (
          <Text style={[styles.note, { color: t.text }]}>{tr('trip.estimatedNote')}</Text>
        ) : status.tier ? (
          <Text style={[styles.note, { color: t.muted }]}>{tr(`trip.tier.${status.tier}`)}</Text>
        ) : null}

        <View style={[styles.rule, { borderColor: t.border }]}>
          <Icon name="bell-ring" size={20} color={t.primary} />
          <Text style={[styles.ruleText, { color: t.text }]}>{rule}</Text>
        </View>
        <Text style={[styles.note, { color: t.muted }]}>{tr('trip.lockHint')}</Text>

        <Button title={tr('trip.stop')} kind="ghost" icon="stop-circle-outline" onPress={confirmStop} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1, minHeight: 240 },
  mapHeader: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  mapHeaderText: { flex: 1, gap: 2 },
  destination: { fontSize: 19, fontWeight: '800' },
  panel: {
    flexGrow: 0,
    maxHeight: '62%',
    marginTop: -24,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 14,
  },
  panelContent: { padding: 20, gap: 14 },
  alarm: { borderRadius: radius.lg, padding: 16, gap: 10 },
  alarmTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alarmTitle: { fontSize: 26, fontWeight: '900' },
  alarmBody: { fontSize: 16 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, gap: 2 },
  big: { fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillText: { fontSize: 14, fontWeight: '700' },
  pillMuted: { fontSize: 13 },
  note: { fontSize: 14, lineHeight: 20 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.md, padding: 12 },
  ruleText: { flex: 1, fontSize: 15, fontWeight: '600' },
});
