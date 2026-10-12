import { useState, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AlarmMode, AlarmStrength } from '../../../modules/trip-alarm/src';
import { useI18n, type Key } from '../../i18n';
import { formatRadius } from '../../lib/format';
import type { Place } from '../../lib/geocode';
import { effectiveStrength, strengthAllowed } from '../../lib/plans';
import { DISTANCE_CHOICES, MINUTE_CHOICES, tooShortForTrain, type WakeOptions } from '../../lib/wake';
import {
  AppText,
  Banner,
  Button,
  Chip,
  ChipRow,
  Icon,
  IconButton,
  KindIcon,
  ListItem,
  ModeBadgeRow,
  SegmentedControl,
  Skeleton,
  Touchable,
  useTheme,
} from '../../ui';
import { isDroppedPin, nbsp, ruleLine } from './mapLogic';

export type PinStatus = 'pending' | 'resolved' | 'failed';

type HeaderProps = {
  place: Place;
  pinStatus: PinStatus | null;
  /** "1.4 km away" from you. */
  distance: string | null;
  isFavourite: boolean;
  onToggleFavourite: () => void;
  onClose: () => void;
  /** Focus moves here when stop mode opens (screen readers). */
  focusRef?: Ref<View>;
};

/** Stop mode's header (the drag zone): kind, name, "Train station · München · 1.4 km away", star and close. */
export function StopHeader({ place, pinStatus, distance, isFavourite, onToggleFavourite, onClose, focusRef }: HeaderProps) {
  const { t: tr } = useI18n();
  const pin = isDroppedPin(place);
  const kind = place.kind ?? 'place';
  const title = pin ? tr('place.droppedPin') : place.name;
  let subtitle: string | null;
  if (pin) {
    subtitle =
      pinStatus === 'resolved'
        ? [place.name, place.context].filter(Boolean).join(', ')
        : pinStatus === 'pending'
          ? null
          : `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`;
  } else {
    subtitle = [place.isStop || place.kind ? tr(`kind.${kind}` as Key) : null, place.context || null, distance ? tr('place.away', { distance }) : null]
      .filter(Boolean)
      .join(' · ');
  }
  const extra = pin && distance ? tr('place.away', { distance }) : null;

  return (
    <View style={styles.header}>
      <KindIcon kind={kind} size={48} />
      <View
        ref={focusRef}
        style={styles.headerText}
        accessible
        accessibilityRole="header"
        accessibilityLabel={[title, subtitle, extra].filter(Boolean).join(', ')}>
        <AppText variant="titleM" numberOfLines={2}>
          {title}
        </AppText>
        {subtitle == null ? (
          <Skeleton width="70%" height={15} style={styles.subtitleSkeleton} />
        ) : subtitle ? (
          <AppText variant="bodyM" color="textSecondary" numberOfLines={2}>
            {extra ? `${subtitle} · ${extra}` : subtitle}
          </AppText>
        ) : null}
      </View>
      <IconButton
        icon="star-outline"
        selectedIcon="star"
        selected={isFavourite}
        selectedColor="starOn"
        color="textSecondary"
        accessibilityLabel={tr(isFavourite ? 'place.unsave' : 'place.save')}
        onPress={onToggleFavourite}
        surface="surface2"
        testID="stop-favourite"
      />
      <IconButton icon="close" color="textSecondary" accessibilityLabel={tr('common.close')} onPress={onClose} testID="stop-close" />
    </View>
  );
}

type ContentProps = {
  place: Place;
  wake: WakeOptions;
  onChange: (wake: WakeOptions) => void;
  useMiles: boolean;
  isPro: boolean;
  onNeedPro: () => void;
  onDemo: () => void;
  starting: boolean;
};

/** Stop mode's body: when to wake in two taps, the honest rule line and the options behind one row. */
export function StopContent({ place, wake, onChange, useMiles, isPro, onNeedPro, onDemo, starting }: ContentProps) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const [options, setOptions] = useState(false);
  const kind = place.kind ?? 'place';
  const leave = wake.mode === 'leave';
  const byTime = !leave && wake.wakeBy === 'time';
  const radius = (m: number) => nbsp(formatRadius(m, useMiles, lang));
  const rule = ruleLine(wake, formatRadius(wake.radiusM, useMiles, lang));
  const strength = effectiveStrength(wake.strength, isPro);
  const heavyLocked = !strengthAllowed('heavy', isPro);
  const summary = `${tr(leave ? 'map.stop.optionsLeave' : 'map.stop.optionsArrive')} · ${tr(`strength.${strength}`)}`;

  return (
    <View style={styles.content}>
      {place.modes ? <ModeBadgeRow modes={place.modes} size="lg" style={styles.gutter} /> : null}

      {!leave ? (
        <View style={[styles.group, styles.gutter]}>
          <AppText variant="labelM" color="textSecondary">
            {tr('place.wakeMe')}
          </AppText>
          <SegmentedControl<'time' | 'distance'>
            testID="stop-wake-by"
            accessibilityLabel={tr('place.wakeMe')}
            value={wake.wakeBy}
            onChange={(wakeBy) => onChange({ ...wake, wakeBy })}
            options={[
              { value: 'time', label: tr('place.byTime'), icon: 'clock-outline' },
              { value: 'distance', label: tr('place.byDistance'), icon: 'map-marker-distance' },
            ]}
          />
        </View>
      ) : null}

      <ChipRow radio accessibilityLabel={tr('place.wakeMe')}>
        {byTime
          ? MINUTE_CHOICES.map((m) => (
              <Chip
                key={m}
                label={tr('map.stop.minutes', { minutes: m })}
                selected={wake.minutesBefore === m}
                onPress={() => onChange({ ...wake, minutesBefore: m })}
                testID={`stop-minutes-${m}`}
              />
            ))
          : DISTANCE_CHOICES.map((r) => (
              <Chip
                key={r}
                label={radius(r)}
                selected={wake.radiusM === r}
                onPress={() => onChange({ ...wake, radiusM: r })}
                testID={`stop-distance-${r}`}
              />
            ))}
      </ChipRow>

      {tooShortForTrain(kind, wake) ? (
        <Banner
          tone="warning"
          testID="stop-train-warning"
          body={tr('map.stop.trainWarning', { distance: radius(wake.radiusM) })}
          action={{ label: tr('map.stop.useTwoMinutes'), onPress: () => onChange({ ...wake, wakeBy: 'time', minutesBefore: 2 }) }}
          style={styles.gutter}
        />
      ) : null}

      <View style={[styles.rule, styles.gutter]} accessible accessibilityLiveRegion="polite">
        <Icon name="bell-ring-outline" size={20} color="primary" />
        <AppText variant="bodyM" style={styles.flex} testID="stop-rule">
          {tr(rule.key, rule.params)}
        </AppText>
      </View>

      <Touchable
        onPress={() => setOptions((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: options }}
        accessibilityLabel={`${tr('map.stop.options')}, ${summary}`}
        testID="stop-options"
        style={styles.disclosure}>
        <AppText variant="bodyL" weight="medium" style={styles.flex}>
          {tr('map.stop.options')}
        </AppText>
        <AppText variant="bodyM" color="textSecondary" numberOfLines={1} style={styles.value}>
          {summary}
        </AppText>
        <Icon name={options ? 'chevron-up' : 'chevron-down'} size={20} color="textTertiary" />
      </Touchable>

      {options ? (
        <View style={styles.options}>
          <View style={styles.gutter}>
            <SegmentedControl<AlarmMode>
              testID="stop-mode"
              accessibilityLabel={tr('map.stop.whenLabel')}
              value={wake.mode}
              onChange={(mode) => onChange({ ...wake, mode })}
              options={[
                { value: 'arrive', label: tr('place.arrive') },
                { value: 'leave', label: tr('place.leave') },
              ]}
            />
          </View>
          <View style={[styles.group, styles.gutter]}>
            <SegmentedControl<AlarmStrength>
              testID="stop-strength"
              accessibilityLabel={tr('map.stop.strengthLabel')}
              value={strength}
              onChange={(s) => onChange({ ...wake, strength: s })}
              onLockedPress={onNeedPro}
              options={[
                { value: 'gentle', label: tr('strength.gentle') },
                { value: 'normal', label: tr('strength.normal') },
                { value: 'heavy', label: tr('strength.heavy'), locked: heavyLocked },
              ]}
            />
            <AppText variant="bodyS" color="textSecondary">
              {tr(`strength.${strength}.body`)}
            </AppText>
          </View>
          {!leave ? (
            <ListItem
              icon="play-circle-outline"
              iconColor="primary"
              title={tr('map.stop.demo')}
              subtitle={tr('map.stop.demoBody')}
              subtitleLines={2}
              loading={starting}
              onPress={starting ? undefined : onDemo}
              testID="stop-demo"
              style={{ backgroundColor: t.color.surface2 }}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type FooterProps = {
  onStart: () => void;
  starting: boolean;
  /** A trip is running: the button switches the alarm to this stop (after a confirm). */
  switching: boolean;
};

/** The sticky footer inside the stop sheet: Start alarm, full width, 56 dp. */
export function StopFooter({ onStart, starting, switching }: FooterProps) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.footer,
        { paddingBottom: 16 + insets.bottom, borderTopColor: t.color.border, backgroundColor: t.color.surface2 },
      ]}>
      <Button
        label={tr(switching ? 'map.stop.switch' : 'place.start')}
        icon="alarm"
        block
        loading={starting}
        onPress={onStart}
        testID="stop-start"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingLeft: 16, paddingRight: 4, paddingBottom: 12 },
  headerText: { flex: 1, gap: 2, paddingTop: 2 },
  subtitleSkeleton: { marginTop: 4 },
  content: { gap: 16, paddingBottom: 8 },
  gutter: { marginHorizontal: 16 },
  group: { gap: 8 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16 },
  value: { maxWidth: '45%', textAlign: 'right' },
  options: { gap: 16 },
  footer: { paddingTop: 16, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
