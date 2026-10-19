import { useFocusEffect } from '@react-navigation/native';
import { getCalendars } from 'expo-localization';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import { TripAlarm, type ActiveTrip } from '../../../modules/trip-alarm/src';
import { maybeShowInterstitial } from '../../ads';
import { useRemoteConfig } from '../../api/config';
import { useI18n, type Key } from '../../i18n';
import { formatDistance, formatDuration } from '../../lib/format';
import type { Place } from '../../lib/geocode';
import { setTripFeedback, useHistory, type TripFeedback, type TripRecord } from '../../lib/history';
import { premiumEnabled } from '../../lib/monetization';
import { usePro } from '../../lib/pro';
import { goToMap } from '../../navigation/ref';
import type { RootScreenProps } from '../../navigation/types';
import { useSavedData } from '../../state/saved';
import { useTrip } from '../../state/trip';
import {
  AppText,
  Button,
  Card,
  Chip,
  ChipWrap,
  haptics,
  Icon,
  ListItem,
  Screen,
  Section,
  StatTile,
  StickyFooter,
  useTheme,
  useToast,
  type ColorToken,
  type IconName,
} from '../../ui';
import { nbsp } from '../map/mapLogic';
import { markUpsellShown, upsellShownAt } from '../map/uiMemory';
import { recordWithPlace, startTripRecorder, useTripFacts } from './tripRecorder';
import { arrivedVariant, formatClock, shouldUpsell, wakeOfTrip, type ArrivedVariant } from './tripView';

const HERO: Record<ArrivedVariant, { icon: IconName; bg: ColorToken; fg: ColorToken; title: Key }> = {
  arrived: { icon: 'flag-checkered', bg: 'successSoft', fg: 'success', title: 'trip.arrived.title' },
  ended: { icon: 'stop-circle-outline', bg: 'fill', fg: 'textSecondary', title: 'trip.ended.title' },
  error: { icon: 'alert-circle-outline', bg: 'dangerSoft', fg: 'danger', title: 'trip.error.title' },
  phone: { icon: 'alert-outline', bg: 'warningSoft', fg: 'warning', title: 'trip.phone.title' },
};

const FEEDBACK: { value: TripFeedback; key: Key }[] = [
  { value: 'right', key: 'trip.feedback.right' },
  { value: 'early', key: 'trip.feedback.early' },
  { value: 'late', key: 'trip.feedback.late' },
];

function uses24h(): boolean {
  try {
    return getCalendars()[0]?.uses24hourClock ?? true;
  } catch {
    return true;
  }
}

/** The trip's choices, from what this app run saw or from the history. */
function choicesOf(active: ActiveTrip | null, record: TripRecord | null) {
  if (active) return active;
  if (!record) return null;
  return { mode: record.mode, minutesBefore: record.minutesBefore, radiusM: record.radiusM, strength: record.strength, demo: record.demo };
}

/**
 * Route `Arrived` (ui-direction-a 4.3): what happened on the trip that just ended, how it went,
 * and what to do next. Variants: you made it, ended by you, couldn't start, stopped by the phone.
 * Android back and Done go to the map.
 */
export function ArrivedScreen({ navigation, route }: RootScreenProps<'Arrived'>) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const trip = useTrip();
  const saved = useSavedData();
  const toast = useToast();
  const pro = usePro();
  const config = useRemoteConfig();
  const history = useHistory();
  const ended = trip.ended;
  const tripId = route.params?.tripId ?? ended?.event.tripId ?? null;
  const facts = useTripFacts(tripId);
  const record = history.trips.find((r) => r.id === tripId) ?? null;
  const [clock24] = useState(uses24h);
  const [lastUpsell] = useState(upsellShownAt);
  const [openedAt] = useState(() => Date.now());
  const [feedback, setFeedback] = useState<TripFeedback | null>(record?.feedback ?? null);

  useEffect(() => startTripRecorder(), []);
  const variantRef = useRef<ArrivedVariant | null>(null);

  /**
   * Done or back: to the map first, then (caps allowing, never in Arrived's first seconds) the
   * interstitial over the map, after a trip that went normally (never after a failed alarm).
   * Nothing waits for the ad.
   */
  function leave() {
    goToMap();
    if (variantRef.current === 'arrived' || variantRef.current === 'ended') maybeShowInterstitial(Date.now() - openedAt);
  }

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        leave();
        return true;
      });
      return () => sub.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- leave() only reads openedAt, fixed for the screen
    }, []),
  );

  const event = ended && (!tripId || ended.event.tripId == null || ended.event.tripId === tripId) ? ended.event : null;
  const active = facts?.trip ?? null;
  const choices = choicesOf(active, record);
  const recordPlace: Place | null = record
    ? {
        id: record.place.id,
        name: record.place.name,
        context: record.place.context,
        latitude: record.place.latitude,
        longitude: record.place.longitude,
        kind: record.place.kind === 'place' ? undefined : record.place.kind,
        modes: record.place.modes || undefined,
        isStop: record.place.kind !== 'place' || undefined,
      }
    : null;
  const place: Place | null =
    (event ? ended?.place : null) ??
    recordPlace ??
    (active ? { id: `pin:${active.latitude.toFixed(5)},${active.longitude.toFixed(5)}`, name: active.label, context: '', latitude: active.latitude, longitude: active.longitude } : null);

  // What this app run saw decides; the map's notice only stands in when the app restarted.
  const stoppedByPhone = (facts ? facts.stoppedByPhone : trip.stoppedNotice) || record?.outcome === 'stoppedByPhone';
  const rang = facts?.rang ?? record?.rang ?? null;
  const variant = arrivedVariant(event ?? (record?.outcome === 'error' ? { reason: 'error' } : null), stoppedByPhone, rang != null);
  const demo = !!choices?.demo;
  useEffect(() => {
    variantRef.current = variant;
  }, [variant]);
  const known = !!event || !!facts || !!record;

  // The history gets the destination as it was picked (also known after a restart).
  useEffect(() => {
    if (tripId && ended?.place) recordWithPlace(tripId, ended.place);
  }, [tripId, ended?.place]);

  useEffect(() => {
    if (variant === 'arrived') haptics.success();
  }, [variant]);

  // Nothing to show (an old link): back to the map.
  useEffect(() => {
    if (known) return;
    const timer = setTimeout(goToMap, 800);
    return () => clearTimeout(timer);
  }, [known]);

  const trialOffered = pro.storeConnected ? !!pro.plans?.some((p) => (p.trialDays ?? 0) > 0) : config.trialDays > 0;
  const upsell =
    variant === 'arrived' &&
    premiumEnabled() &&
    shouldUpsell({ isPro: pro.isPro, demo, feedback, snoozes: facts?.snoozes ?? 0, lastShownAt: lastUpsell, now: openedAt });
  useEffect(() => {
    if (upsell) markUpsellShown(openedAt);
  }, [upsell, openedAt]);

  if (!known) return <View style={[styles.flex, { backgroundColor: t.color.bg }]} />;

  const hero = HERO[variant];
  const startedAt = active?.startedAt ?? record?.startedAt ?? null;
  const endedAt = facts?.endedAt ?? record?.endedAt ?? null;
  const name = place?.name ?? active?.label ?? '';
  const subtitle =
    variant === 'error'
      ? event?.message || record?.message || tr('done.errorBody')
      : variant === 'phone'
        ? tr('trip.phone.body')
        : endedAt != null
          ? tr('trip.arrived.subtitle', { name, time: formatClock(endedAt, clock24) })
          : name;

  const useMiles = active?.useMiles ?? record?.useMiles ?? saved.data.preferences.useMiles;
  const travelled = facts ? facts.trail : null;
  const distanceM = record?.distanceM ?? (travelled ? trailMetres(travelled) : null);
  const tiles: { label: string; value: string }[] = [];
  if (variant === 'arrived' || variant === 'ended') {
    if (startedAt != null && endedAt != null) tiles.push({ label: tr('trip.arrived.tileTrip'), value: nbsp(formatDuration((endedAt - startedAt) / 1000)) });
    if (distanceM != null && distanceM > 0) tiles.push({ label: tr('trip.arrived.tileDistance'), value: nbsp(formatDistance(distanceM, useMiles, lang)) });
    if (variant === 'arrived' && rang) {
      const before =
        rang.etaSec != null && choices?.minutesBefore
          ? nbsp(formatDuration(rang.etaSec))
          : rang.distanceM != null
            ? nbsp(formatDistance(rang.distanceM, useMiles, lang))
            : null;
      if (before) tiles.push({ label: tr('trip.arrived.tileRang'), value: tr('trip.arrived.before', { value: before }) });
    }
  }

  const isFavourite = !!place && saved.isFavourite(place);
  const logName = event?.logName ?? record?.logName ?? null;

  function chooseFeedback(value: TripFeedback) {
    if (!tripId) return;
    setFeedback(value);
    setTripFeedback(tripId, value);
    toast.show({ id: 'trip-feedback', message: tr('trip.feedback.thanks'), icon: 'check-circle-outline' });
  }

  function startAgain() {
    if (!place || !choices) return;
    const wake = wakeOfTrip(choices, saved.data.preferences.radiusM);
    goToMap();
    void trip.start({ place, wake, demo: choices.demo ? { from: null } : undefined });
  }

  let footer;
  if (variant === 'ended') {
    footer = (
      <View style={styles.pair}>
        {place && choices ? (
          <Button label={tr('trip.ended.again')} variant="secondary" onPress={startAgain} style={styles.flex} testID="arrived-again" />
        ) : null}
        <Button label={tr('common.done')} onPress={leave} style={styles.flex} testID="arrived-done" />
      </View>
    );
  } else if (variant === 'error') {
    footer = (
      <View style={styles.pair}>
        <Button
          label={tr('trip.error.permissions')}
          variant="secondary"
          onPress={() => navigation.navigate('Setup', { entry: 'arrived' })}
          style={styles.flex}
        />
        {place && choices ? <Button label={tr('trip.error.retry')} onPress={startAgain} style={styles.flex} testID="arrived-retry" /> : null}
      </View>
    );
  } else if (variant === 'phone') {
    footer = (
      <>
        <Button
          label={tr('trip.phone.fix')}
          block
          onPress={() => {
            trip.dismissStoppedNotice();
            navigation.navigate('Setup', { entry: 'arrived', focus: 'battery' });
          }}
          testID="arrived-fix-battery"
        />
        <Button label={tr('common.done')} variant="ghost" size="M" block onPress={leave} testID="arrived-done" />
      </>
    );
  } else {
    footer = <Button label={tr('common.done')} block onPress={leave} testID="arrived-done" />;
  }

  return (
    <Screen testID="arrived-screen" footer={<StickyFooter>{footer}</StickyFooter>}>
      <View style={styles.hero} accessible accessibilityLiveRegion="polite">
        <View style={[styles.heroCircle, { backgroundColor: t.color[hero.bg] }]}>
          <Icon name={hero.icon} size={36} color={hero.fg} />
        </View>
        <AppText variant="display" align="center">
          {tr(hero.title)}
        </AppText>
        {subtitle ? (
          <AppText variant="bodyL" color="textSecondary" align="center" tabular>
            {subtitle}
          </AppText>
        ) : null}
      </View>

      {tiles.length ? (
        <View style={styles.tiles}>
          {tiles.map((tile) => (
            <StatTile key={tile.label} label={tile.label} value={tile.value} compact />
          ))}
        </View>
      ) : null}

      {variant === 'arrived' && !demo && tripId ? (
        <Card title={tr('trip.feedback.title')} style={styles.card}>
          <ChipWrap radio accessibilityLabel={tr('trip.feedback.title')}>
            {FEEDBACK.map((f) => (
              <Chip
                key={f.value}
                label={tr(f.key)}
                selected={feedback === f.value}
                onPress={() => chooseFeedback(f.value)}
                testID={`arrived-feedback-${f.value}`}
              />
            ))}
          </ChipWrap>
        </Card>
      ) : null}

      {upsell ? (
        <Card
          title={tr('trip.upsell.title')}
          body={tr('trip.upsell.body')}
          style={styles.card}
          actions={
            <Button
              label={tr(trialOffered ? 'trip.upsell.trial' : 'trip.upsell.buy')}
              variant="secondary"
              size="M"
              icon="crown-outline"
              onPress={() => navigation.navigate('Paywall', { reason: 'heavy' })}
            />
          }
        />
      ) : null}

      {(variant === 'arrived' || variant === 'ended') && (place || logName) ? (
        <Section style={styles.section}>
          {place ? (
            isFavourite ? (
              <ListItem icon="star" iconColor="starOn" title={tr('trip.arrived.saved')} />
            ) : (
              <ListItem
                icon="star-outline"
                title={tr('trip.arrived.save', { name: place.name })}
                titleLines={2}
                onPress={() => {
                  if (saved.toggleFavourite(place) === 'needsPro') navigation.navigate('Paywall', { reason: 'favourites' });
                  else haptics.selection();
                }}
                testID="arrived-save"
              />
            )
          ) : null}
          {logName && TripAlarm ? (
            <ListItem
              icon="share-variant-outline"
              title={tr('trip.arrived.share')}
              subtitle={tr('trip.arrived.shareBody')}
              subtitleLines={2}
              onPress={() => void TripAlarm?.shareTripLog(logName)}
            />
          ) : null}
        </Section>
      ) : null}
    </Screen>
  );
}

function trailMetres(points: readonly { latitude: number; longitude: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    total += Math.hypot((b.latitude - a.latitude) * 110_540, (b.longitude - a.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180));
  }
  return total;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { alignItems: 'center', gap: 12, paddingTop: 32, paddingHorizontal: 24, paddingBottom: 24 },
  heroCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  tiles: { flexDirection: 'row', gap: 12, paddingHorizontal: 16 },
  card: { marginHorizontal: 16, marginTop: 24 },
  section: { marginTop: 24 },
  pair: { flexDirection: 'row', gap: 8 },
});
