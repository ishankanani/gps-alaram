import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '../../i18n';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';

type Props = {
  /** "München Hbf in about 2 min". */
  body?: string;
  onDismiss: () => void;
  onSnooze?: () => void;
  /** Only when the trigger is uncertain (CLOSEST_POINT_PASSED, ESTIMATED). */
  onKeepTracking?: () => void;
  title?: string;
  dismissLabel?: string;
  snoozeLabel?: string;
  keepTrackingLabel?: string;
  /** Illustrations: no touch, no screen reader. */
  decorative?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The in-app ringing card (3.29): amber, "Wake up!", a full-width 56 dp dismiss button, snooze, and
 * "Not yet, keep tracking" only when the trigger is uncertain.
 */
export function AlarmCard({
  body,
  onDismiss,
  onSnooze,
  onKeepTracking,
  title,
  dismissLabel,
  snoozeLabel,
  keepTrackingLabel,
  decorative,
  style,
}: Props) {
  const t = useTheme();
  const { t: tr } = useI18n();
  return (
    <View
      pointerEvents={decorative ? 'none' : 'auto'}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={decorative}
      style={[styles.card, { backgroundColor: t.color.accent, borderRadius: t.radius.lg }, style]}>
      <Icon name="alarm-light" size={28} color="onAccent" />
      <AppText variant="display" color="onAccent" allowFontScaling={!decorative}>
        {title ?? tr('trip.wakeUp')}
      </AppText>
      {body ? (
        <AppText variant="bodyL" color="onAccent" allowFontScaling={!decorative}>
          {body}
        </AppText>
      ) : null}
      <Button label={dismissLabel ?? tr('trip.dismiss')} variant="onAccent" size="L" block onPress={onDismiss} />
      {onSnooze ? (
        <Button
          label={snoozeLabel ?? tr('trip.snooze')}
          variant="outline"
          size="M"
          block
          color="onAccent"
          borderColor="onAccent"
          borderWidth={1.5}
          onPress={onSnooze}
        />
      ) : null}
      {onKeepTracking ? (
        <Button label={keepTrackingLabel ?? tr('trip.notYet')} variant="ghost" size="M" block color="onAccent" onPress={onKeepTracking} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, gap: 12 },
});
