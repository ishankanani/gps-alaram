import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { AppText } from './AppText';

type Props = {
  /** "Today: Pro unlocks", "15 Oct: we'll remind you", "17 Oct: €9.99 a year starts unless you cancel". */
  steps: string[];
  style?: StyleProp<ViewStyle>;
};

/**
 * The free trial in steps (3.29, three steps per the critiques): 12 dp dots joined by a 2 px primary
 * line, text in bodyM with tabular dates. Show it only when the store offers this user a trial.
 */
export function TrialTimeline({ steps, style }: Props) {
  const t = useTheme();
  return (
    <View style={[styles.list, style]} accessible accessibilityLabel={steps.join('. ')}>
      {steps.map((step, i) => (
        <View key={step} style={styles.row}>
          <View style={styles.rail}>
            <View style={[styles.dot, { backgroundColor: t.color.primary }]} />
            {i < steps.length - 1 ? <View style={[styles.line, { backgroundColor: t.color.primary }]} /> : null}
          </View>
          <AppText variant="bodyM" tabular style={styles.text}>
            {step}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', gap: 12 },
  rail: { width: 12, alignItems: 'center' },
  // The dot sits on the first text line (bodyM line height 20).
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  line: { width: 2, flex: 1, minHeight: 12 },
  text: { flex: 1, paddingBottom: 16 },
});
