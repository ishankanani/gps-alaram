import { useFocusEffect } from '@react-navigation/native';
import { getCalendars } from 'expo-localization';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TripAlarm, type ActiveTrip, type TripStatus } from '../../../modules/trip-alarm/src';
import { useI18n } from '../../i18n';
import { formatDistance, formatDuration, formatRadius } from '../../lib/format';
import type { StopKind } from '../../lib/stations/text';
import type { TrailPoint } from '../../lib/trail';
import { TripMap, type TripMapHandle } from '../../map/TripMap';
import { currentRouteName, goToMap } from '../../navigation/ref';
import { runningTripNow, useTrip } from '../../state/trip';
import {
  AlarmCard,
  AppText,
  Badge,
  Banner,
  Button,
  DestinationCard,
  Icon,
  MapControl,
  ProgressBar,
  Skeleton,
  useDialogs,
  useTheme,
} from '../../ui';
import { nbsp, ruleLine } from '../map/mapLogic';
import { CreditsControl } from '../map/MapPieces';
import { startTripRecorder, useTripFacts } from './tripRecorder';
import {
  formatClock,
  formatCountdown,
  gpsBadge,
  heroLayout,
  predictRingAt,
  SNOOZE_MS,
  tripProgress,
} from './tripView';

function uses24h(): boolean {
  try {
    return getCalendars()[0]?.uses24hourClock ?? true;
  } catch {
    return true;
  }
}

/** Ticks every second while `active` (the snooze countdown). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * Route `Trip` (ui-direction-a 4.3 "Trip, live"): the live map and one panel you can read half
 * asleep. Android back and the card's chevron minimise the trip to the TripBar.
 */
export function TripScreen() {
  const t = useTheme();
  const trip = useTrip();
  const { minimise } = trip;

  useEffect(() => startTripRecorder(), []);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        minimise();
        return true;
      });
      return () => sub.remove();
    }, [minimise]),
  );

  // Opened without a running trip (an old notification link, or a trip that ended unseen): once
  // nothing else has taken over the screen, go back to the map.
  const running = !!trip.status;
  useEffect(() => {
    if (running) return;
    const timer = setTimeout(() => {
      if (currentRouteName() === 'Trip' && !runningTripNow()) goToMap();
    }, 800);
    return () => clearTimeout(timer);
  }, [running]);

  const status = trip.status;
  if (!status?.trip || !TripAlarm) return <View style={[styles.root, { backgroundColor: t.color.bg }]} />;
  return <LiveTrip status={status} activeTrip={status.trip} kind={trip.kind} trail={trip.trail} onMinimise={minimise} onEnd={trip.stop} />;
}

type LiveProps = {
  status: TripStatus;
  activeTrip: ActiveTrip;
  kind: StopKind | 'place';
  trail: TrailPoint[];
  onMinimise: () => void;
  onEnd: () => Promise<void>;
};

function LiveTrip({ status, activeTrip: trip, kind, trail, onMinimise, onEnd }: LiveProps) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();
  const dialogs = useDialogs();
  const facts = useTripFacts(trip.id);
  const map = useRef<TripMapHandle>(null);
  const [cardBottom, setCardBottom] = useState(insets.top + 88);
  const [panelHeight, setPanelHeight] = useState(Math.round(frame.height * 0.45));
  const [following, setFollowing] = useState(true);
  const [clock24] = useState(uses24h);

  const ringing = status.state === 'ringing';
  const snoozed = status.state === 'snoozed';
  const now = useNow(snoozed);
  const leave = trip.mode === 'leave';
  const estimated = status.estimated === true;
  const approx = estimated ? '≈ ' : '';
  const user = status.latitude != null && status.longitude != null ? { latitude: status.latitude, longitude: status.longitude } : null;
  const uncertain = status.trigger === 'CLOSEST_POINT_PASSED' || status.trigger === 'ESTIMATED';
  const native = TripAlarm;

  const distance = status.distanceM != null ? approx + nbsp(formatDistance(status.distanceM, trip.useMiles, lang)) : null;
  const eta = status.etaSec != null ? approx + nbsp(formatDuration(status.etaSec)) : null;
  const arrivesAt = status.etaSec != null ? formatClock(Date.now() + status.etaSec * 1000, clock24) : null;
  const waitingForFix = status.distanceM == null;
  const layout = heroLayout(trip);
  const progress = tripProgress(trip, status, facts?.firstDistanceM ?? null);
  const rule = ruleLine(
    { mode: trip.mode, wakeBy: trip.minutesBefore ? 'time' : 'distance', minutesBefore: trip.minutesBefore ?? 0 },
    formatRadius(trip.radiusM, trip.useMiles, lang),
  );
  const ringAt = predictRingAt(trip, status, Date.now());
  const strength = tr(`strength.${trip.strength}`);
  const badge = gpsBadge(status);
  const overline = tr(trip.demo ? 'trip.overline.demo' : leave ? 'trip.leaving' : 'trip.onTheWay');

  async function confirmEnd() {
    await dialogs.confirm({
      title: tr('trip.endConfirm.title'),
      message: tr('trip.endConfirm.body'),
      confirmLabel: tr('trip.end'),
      cancelLabel: tr('trip.stopConfirm.keep'),
      tone: 'danger',
      testID: 'trip-end-dialog',
      onConfirm: onEnd,
    });
  }

  // The hero follows the rule's unit (critiques: Trip hero number).
  const heroLabel = layout === 'eta' ? tr('trip.stat.arrives') : tr('trip.distance');
  const heroValue = layout === 'eta' ? eta : distance;
  const sideLabel = layout === 'eta' ? tr('trip.distance') : layout === 'leave' ? tr('trip.stat.ringsAt') : tr('trip.stat.arrives');
  const sideValue = layout === 'eta' ? distance : layout === 'leave' ? nbsp(formatRadius(trip.radiusM, trip.useMiles, lang)) : eta;
  const speedUnknown = !waitingForFix && status.etaSec == null && !leave;

  const alarmBody =
    status.etaSec != null
      ? tr('trip.alarm.body', { name: trip.label, minutes: Math.max(1, Math.round(status.etaSec / 60)) })
      : status.trigger
        ? `${trip.label}. ${tr(`reason.${status.trigger}`)}`
        : trip.label;
  const snoozeLeft = facts?.snoozedAt != null ? (facts.snoozedAt + SNOOZE_MS - now) / 1000 : null;

  return (
    <View style={[styles.root, { backgroundColor: t.color.bg }]} testID="trip-screen">
      <TripMap
        ref={map}
        destination={{ latitude: trip.latitude, longitude: trip.longitude }}
        kind={kind}
        radiusM={trip.radiusM}
        user={user}
        estimated={estimated}
        trail={trail}
        padding={{ top: cardBottom + 16, bottom: panelHeight + 16 }}
        onFollowingChange={setFollowing}
      />

      <View
        style={[styles.card, { top: insets.top + 8 }]}
        onLayout={(e) => setCardBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
        <DestinationCard kind={kind} overline={overline} title={trip.label} onMinimise={onMinimise} testID="trip-destination" />
      </View>

      <View pointerEvents="box-none" style={[styles.controls, { bottom: panelHeight + 16 }]}>
        <CreditsControl onPress={() => map.current?.showAttribution()} />
        {following ? null : (
          <MapControl
            icon="crosshairs-gps"
            state="located"
            accessibilityLabel={tr('trip.recentre')}
            onPress={() => map.current?.recentre()}
            testID="trip-recentre"
          />
        )}
      </View>

      <View
        onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
        style={[
          styles.panel,
          {
            maxHeight: Math.round(frame.height * 0.7),
            backgroundColor: t.color.surface2,
            borderTopLeftRadius: t.radius.xl,
            borderTopRightRadius: t.radius.xl,
          },
          t.elevation(3, { upward: true }),
        ]}>
        <ScrollView bounces={false} contentContainerStyle={[styles.panelContent, { paddingBottom: 16 + insets.bottom }]}>
          {ringing ? (
            <AlarmCard
              body={alarmBody}
              dismissLabel={tr('trip.awake')}
              onDismiss={() => void native?.dismissAlarm()}
              onSnooze={() => void native?.snoozeAlarm()}
              onKeepTracking={uncertain ? () => void native?.keepTracking() : undefined}
            />
          ) : snoozed ? (
            <View
              accessible
              accessibilityLabel={snoozeLeft != null && snoozeLeft > 0 ? tr('trip.snoozedFor', { time: formatCountdown(snoozeLeft) }) : tr('trip.snoozedSoon')}
              style={[styles.snoozed, { backgroundColor: t.color.accentSoft, borderRadius: t.radius.lg }]}>
              <View style={styles.row}>
                <Icon name="alarm-snooze" size={24} color="accentInk" />
                <AppText variant="titleS" color="accentInk" tabular style={styles.flex}>
                  {snoozeLeft != null && snoozeLeft > 0 ? tr('trip.snoozedFor', { time: formatCountdown(snoozeLeft) }) : tr('trip.snoozedSoon')}
                </AppText>
              </View>
              <Button label={tr('trip.awake')} variant="onAccent" block onPress={() => void native?.dismissAlarm()} testID="trip-awake" />
              {uncertain ? (
                <Button label={tr('trip.notYet')} variant="ghost" size="M" block color="accentInk" onPress={() => void native?.keepTracking()} />
              ) : null}
            </View>
          ) : (
            <>
              <View style={styles.badges}>
                <PulsingBadge tone={badge.tone} label={tr(badge.key, badge.params)} pulse={badge.pulse} />
                {trip.demo ? <Badge label={tr('trip.badge.demo')} tone="primary" /> : null}
              </View>

              <View style={styles.stats}>
                <View style={[styles.stat, styles.hero]} accessible accessibilityLabel={`${heroLabel}, ${heroValue ?? '–'}`}>
                  <AppText variant="labelS" color="textSecondary">
                    {heroLabel}
                  </AppText>
                  {waitingForFix ? (
                    <Skeleton width="80%" height={44} shape="block" />
                  ) : (
                    <AppText variant="numXL" testID="trip-hero">
                      {heroValue ?? '—'}
                    </AppText>
                  )}
                  {layout === 'eta' && arrivesAt && !waitingForFix ? (
                    <AppText variant="bodyS" color="textSecondary" tabular>
                      {tr('trip.stat.at', { time: arrivesAt })}
                    </AppText>
                  ) : null}
                </View>
                <View style={styles.stat} accessible accessibilityLabel={`${sideLabel}, ${sideValue ?? '–'}`}>
                  <AppText variant="labelS" color="textSecondary">
                    {sideLabel}
                  </AppText>
                  {waitingForFix && layout !== 'leave' ? (
                    <Skeleton width="70%" height={30} shape="block" />
                  ) : (
                    <AppText variant="numL">{sideValue ?? '—'}</AppText>
                  )}
                  {layout === 'distance' && arrivesAt ? (
                    <AppText variant="bodyS" color="textSecondary" tabular>
                      {tr('trip.stat.at', { time: arrivesAt })}
                    </AppText>
                  ) : null}
                </View>
              </View>
              {waitingForFix ? (
                <AppText variant="bodyS" color="textSecondary">
                  {tr('trip.stat.firstFix')}
                </AppText>
              ) : speedUnknown ? (
                <AppText variant="bodyS" color="textSecondary">
                  {tr('trip.stat.speed')}
                </AppText>
              ) : null}

              <ProgressBar variant="trip" progress={progress ?? 0} accessibilityLabel={tr('trip.progress')} />

              <View style={[styles.rule, { backgroundColor: t.color.fill, borderRadius: t.radius.md }]} accessible>
                <Icon name="bell-ring-outline" size={20} color="primary" />
                <View style={styles.flex}>
                  <AppText variant="bodyM">{tr(rule.key, rule.params)}</AppText>
                  <AppText variant="bodyS" color="textSecondary" tabular>
                    {ringAt != null ? tr('trip.rule.predicted', { time: formatClock(ringAt, clock24), strength }) : strength}
                  </AppText>
                </View>
              </View>

              {estimated ? (
                <Banner tone="warning" body={tr('trip.tunnel')} testID="trip-tunnel" />
              ) : leave && status.armed === false ? (
                <AppText variant="bodyS" color="textTertiary">
                  {tr('trip.armWait')}
                </AppText>
              ) : (
                <View style={styles.info}>
                  <Icon name="lock-outline" size={16} color="textTertiary" />
                  <AppText variant="bodyS" color="textTertiary" style={styles.flex}>
                    {status.tier === 'far' ? `${tr('trip.info.lock')} ${tr('trip.info.far')}` : tr('trip.info.lock')}
                  </AppText>
                </View>
              )}
            </>
          )}

          {ringing ? null : (
            <Button
              label={tr('trip.end')}
              icon="stop-circle-outline"
              variant="dangerOutline"
              size="M"
              block
              onPress={() => void confirmEnd()}
              testID="trip-end"
              style={styles.end}
            />
          )}
        </ScrollView>
      </View>
    </View>
  );
}

/** The GPS badge; while searching, its dot pulses (static with reduced motion). */
function PulsingBadge({ tone, label, pulse }: { tone: Parameters<typeof Badge>[0]['tone']; label: string; pulse: boolean }) {
  const t = useTheme();
  const [opacity] = useState(() => new Animated.Value(1));
  const animate = pulse && !t.reduceMotion;
  useEffect(() => {
    if (!animate) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 550, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 550, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, opacity]);
  return (
    <Animated.View style={{ opacity }}>
      <Badge label={label} tone={tone} dot />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { position: 'absolute', left: 16, right: 16 },
  controls: {
    position: 'absolute',
    left: 6,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  panelContent: { paddingTop: 20, paddingHorizontal: 16, gap: 16 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stats: { flexDirection: 'row', gap: 16 },
  stat: { flex: 1, gap: 4 },
  hero: { flex: 1.3 },
  rule: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12 },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  snoozed: { padding: 20, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  end: { marginTop: 8 },
});
