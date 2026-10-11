import { StyleSheet, View } from 'react-native';

import type { StopKind } from '../../lib/stations/text';
import { useTheme } from '../theme';
import type { ColorToken } from '../tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';
import { KindIcon } from './KindIcon';
import { Touchable } from './Touchable';

type Props = {
  kind: StopKind | 'place';
  /** The stop name, or "Wake up! München Hbf" while ringing. */
  title: string;
  /** "1.3 km · 6 min · GPS good", "≈ 2.4 km · No GPS", "Snoozed · …". */
  subtitle?: string;
  state: 'tracking' | 'ringing' | 'snoozed';
  /** Opens the Trip screen. */
  onPress: () => void;
  /** Ringing: the label of the trailing button that opens the alarm. */
  openAlarmLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

/**
 * TripBar (3.26): the minimised trip, docked above the tab bar on every tab. Indigo in light mode;
 * in dark mode surface3 with an indigo stripe, so it never glares at night. Amber while ringing.
 * No live region: trip state changes are announced once by the trip provider.
 */
export function TripBar({ kind, title, subtitle, state, onPress, openAlarmLabel, accessibilityHint, testID }: Props) {
  const t = useTheme();
  const ringing = state === 'ringing';
  const snoozed = state === 'snoozed';
  const night = t.dark && !ringing && !snoozed;
  const bg = ringing ? t.color.accent : snoozed ? t.color.accentSoft : night ? t.color.surface3 : t.color.primary;
  const fg: ColorToken = ringing ? 'onAccent' : snoozed ? 'accentInk' : night ? 'text' : 'onPrimary';
  const sub: ColorToken = ringing ? 'onAccent' : snoozed ? 'accentInk' : night ? 'textSecondary' : 'onPrimary';
  return (
    <Touchable
      testID={testID}
      onPress={onPress}
      rippleColor={night ? t.color.ripple : undefined}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle].filter(Boolean).join('. ')}
      accessibilityHint={accessibilityHint}
      style={[styles.bar, { backgroundColor: bg, borderRadius: t.radius.lg }, t.elevation(2)]}>
      {night ? <View style={[styles.stripe, { backgroundColor: t.color.primary }]} /> : null}
      <KindIcon kind={kind} size={32} ringColor={t.color.onColor} />
      <View style={styles.text}>
        <AppText variant="labelL" color={fg} numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="bodyS" color={sub} numberOfLines={1} tabular style={night || ringing || snoozed ? null : styles.dim}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {ringing && openAlarmLabel ? (
        <Button label={openAlarmLabel} variant="onAccent" size="S" onPress={onPress} />
      ) : (
        <Icon name="chevron-up" size={24} color={fg} />
      )}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 12,
    paddingRight: 12,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  text: { flex: 1, gap: 2 },
  dim: { opacity: 0.85 },
});
