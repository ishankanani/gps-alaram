import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { AppText } from './AppText';
import { IconButton } from './IconButton';

type Props = {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** What the number counts, for screen readers ("Free favourites"). */
  accessibilityLabel: string;
};

/** Stepper (3.29): minus, the value in numM, plus; the buttons disable at the limits. */
export function Stepper({ value, onChange, min, max, step = 1, accessibilityLabel }: Props) {
  const { t: tr } = useI18n();
  const down = () => onChange(Math.max(min, value - step));
  const up = () => onChange(Math.min(max, value + step));
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'increment' ? up() : down())}>
      <IconButton icon="minus" variant="tonal" accessibilityLabel={tr('ui.decrease')} onPress={down} disabled={value <= min} />
      <AppText variant="numM" align="center" style={styles.value}>
        {String(value)}
      </AppText>
      <IconButton icon="plus" variant="tonal" accessibilityLabel={tr('ui.increase')} onPress={up} disabled={value >= max} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  value: { minWidth: 48 },
});
