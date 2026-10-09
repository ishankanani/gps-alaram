import { useEffect, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AlarmMode } from '../../../modules/trip-alarm/src';
import { useI18n } from '../../i18n';
import { formatDistance, formatRadius } from '../../lib/format';
import type { Place } from '../../lib/geocode';
import { effectiveStrength } from '../../lib/plans';
import { usePro } from '../../lib/pro';
import { DISTANCE_CHOICES, MINUTE_CHOICES, tooShortForTrain, type WakeOptions } from '../../lib/wake';
import { Button, Chip, Icon, IconButton, KindIcon, Label, ModeBadges, Segmented } from '../../ui/components';
import { StrengthPicker } from '../../ui/StrengthPicker';
import { radius, useTheme } from '../../ui/theme';

type Props = {
  place: Place;
  /** How far the place is from you, when your position is known. */
  distanceM: number | null;
  wake: WakeOptions;
  onChange: (wake: WakeOptions) => void;
  useMiles: boolean;
  isFavourite: boolean;
  onToggleFavourite: () => void;
  onClose: () => void;
  onStart: () => void;
  /** Start a demo ride: simulated movement to this place, to see and hear the alarm. */
  onDemo: () => void;
  /** Opens the paywall for Heavy sleeper. */
  onNeedPro: () => void;
  starting: boolean;
  onLayoutHeight: (height: number) => void;
};

export function PlaceSheet({
  place,
  distanceM,
  wake,
  onChange,
  useMiles,
  isFavourite,
  onToggleFavourite,
  onClose,
  onStart,
  onDemo,
  onNeedPro,
  starting,
  onLayoutHeight,
}: Props) {
  const { isPro } = usePro();
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const [more, setMore] = useState(false);
  const [slide] = useState(() => new Animated.Value(1));
  const [translateY] = useState(() => slide.interpolate({ inputRange: [0, 1], outputRange: [0, 400] }));
  const kind = place.kind ?? 'place';
  const leave = wake.mode === 'leave';
  const byTime = !leave && wake.wakeBy === 'time';

  useEffect(() => {
    slide.setValue(1);
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 180 }).start();
  }, [place.id, slide]);

  const subtitle = [place.context, tr(`kind.${kind}`), distanceM != null ? tr('place.away', { distance: formatDistance(distanceM, useMiles, lang) }) : null]
    .filter(Boolean)
    .join(' · ');

  const rule = leave
    ? tr('place.ruleLeave', { distance: formatRadius(wake.radiusM, useMiles, lang) })
    : byTime
      ? tr('place.ruleTime', { minutes: wake.minutesBefore })
      : tr('place.ruleDistance', { distance: formatRadius(wake.radiusM, useMiles, lang) });

  return (
    <Animated.View
      onLayout={(e) => onLayoutHeight(e.nativeEvent.layout.height)}
      style={[
        styles.sheet,
        {
          backgroundColor: t.surface,
          shadowColor: t.shadow,
          paddingBottom: insets.bottom + 16,
          transform: [{ translateY }],
        },
      ]}>
      <View style={[styles.handle, { backgroundColor: t.border }]} />
      <View style={styles.header}>
        <KindIcon kind={kind} size={46} />
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: t.text }]} numberOfLines={2}>
            {place.name}
          </Text>
          <Text style={[styles.subtitle, { color: t.muted }]} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
        <IconButton
          icon={isFavourite ? 'star' : 'star-outline'}
          tint={isFavourite ? t.accent : t.muted}
          label={tr(isFavourite ? 'place.unsave' : 'place.save')}
          onPress={onToggleFavourite}
          size={40}
        />
        <IconButton icon="close" label={tr('common.close')} onPress={onClose} size={40} tint={t.muted} />
      </View>
      {place.modes ? <ModeBadges modes={place.modes} /> : null}

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <Label>{tr('place.wakeMe')}</Label>
        {!leave ? (
          <Segmented
            value={wake.wakeBy}
            onChange={(wakeBy) => onChange({ ...wake, wakeBy })}
            options={[
              { value: 'distance', label: tr('place.byDistance'), icon: 'map-marker-distance' },
              { value: 'time', label: tr('place.byTime'), icon: 'clock-outline' },
            ]}
          />
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {byTime
            ? MINUTE_CHOICES.map((m) => (
                <Chip
                  key={m}
                  label={tr('place.minutesBefore', { minutes: m })}
                  selected={wake.minutesBefore === m}
                  onPress={() => onChange({ ...wake, minutesBefore: m })}
                />
              ))
            : DISTANCE_CHOICES.map((r) => (
                <Chip
                  key={r}
                  label={formatRadius(r, useMiles, lang)}
                  selected={wake.radiusM === r}
                  onPress={() => onChange({ ...wake, radiusM: r })}
                />
              ))}
        </ScrollView>

        {tooShortForTrain(kind, wake) ? (
          <View style={[styles.warning, { backgroundColor: t.dark ? '#3A2A0A' : '#FFF4DB', borderColor: t.accent }]}>
            <Icon name="alert-circle" size={20} color={t.warn} />
            <View style={styles.warningText}>
              <Text style={[styles.small, { color: t.text }]}>
                {tr('place.shortTrainWarning', { distance: formatRadius(wake.radiusM, useMiles, lang) })}
              </Text>
              <Pressable onPress={() => onChange({ ...wake, wakeBy: 'time', minutesBefore: 2 })} hitSlop={8}>
                <Text style={[styles.link, { color: t.primary }]}>{tr('place.useTime')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.rule}>
          <Icon name="bell-ring" size={18} color={t.primary} />
          <Text style={[styles.small, { color: t.muted }]}>{rule}</Text>
        </View>

        <Pressable onPress={() => setMore(!more)} style={styles.moreToggle} hitSlop={8}>
          <Text style={[styles.link, { color: t.primary }]}>{tr(more ? 'place.fewerOptions' : 'place.moreOptions')}</Text>
          <Icon name={more ? 'chevron-up' : 'chevron-down'} size={20} color={t.primary} />
        </Pressable>

        {more ? (
          <View style={styles.more}>
            <Segmented<AlarmMode>
              value={wake.mode}
              onChange={(mode) => onChange({ ...wake, mode })}
              options={[
                { value: 'arrive', label: tr('place.arrive'), icon: 'map-marker-check' },
                { value: 'leave', label: tr('place.leave'), icon: 'map-marker-radius' },
              ]}
            />
            <Label>{tr('place.alarm')}</Label>
            <StrengthPicker value={wake.strength} onChange={(strength) => onChange({ ...wake, strength })} onNeedPro={onNeedPro} />
            <Text style={[styles.small, { color: t.muted }]}>{tr(`strength.${effectiveStrength(wake.strength, isPro)}.body`)}</Text>
            {!leave ? (
              <View style={[styles.demo, { backgroundColor: t.primarySoft }]}>
                <Text style={[styles.small, { color: t.text }]}>{tr('place.demoBody')}</Text>
                <Button title={tr('place.demo')} kind="secondary" icon="play-circle-outline" compact onPress={onDemo} busy={starting} />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <Button title={tr('place.start')} icon="alarm" onPress={onStart} busy={starting} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '78%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 12,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 14 },
  body: { flexGrow: 0 },
  bodyContent: { gap: 12, paddingBottom: 4 },
  chips: { gap: 8, paddingRight: 8 },
  warning: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.sm, borderWidth: 1 },
  warningText: { flex: 1, gap: 6 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  small: { fontSize: 14, lineHeight: 20, flexShrink: 1 },
  link: { fontSize: 15, fontWeight: '700' },
  moreToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  more: { gap: 12 },
  demo: { gap: 10, padding: 12, borderRadius: radius.md },
});
