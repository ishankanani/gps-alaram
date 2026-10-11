import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '../../i18n';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { IconButton } from './IconButton';

type Props = {
  label: string;
  value: string;
  /** Tabular figures for numbers, IDs, times and prices. */
  numeric?: boolean;
  /** A copy button after the value. */
  onCopy?: () => void;
  /** No divider after the last row. */
  last?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** KeyValueRow (3.29): a dense row, key 40 % wide in textSecondary, value right-aligned. */
export function KeyValueRow({ label, value, numeric, onCopy, last = true, style }: Props) {
  const t = useTheme();
  const { t: tr } = useI18n();
  return (
    <View
      style={[styles.row, { paddingRight: onCopy ? 4 : 16 }, style]}
      accessible={!onCopy}
      accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="bodyM" color="textSecondary" style={styles.key}>
        {label}
      </AppText>
      <AppText variant="bodyM" tabular={numeric} selectable style={styles.value}>
        {value}
      </AppText>
      {onCopy ? <IconButton icon="content-copy" accessibilityLabel={`${tr('ui.copy')}: ${label}`} color="textSecondary" onPress={onCopy} /> : null}
      {last ? null : <View style={[styles.divider, { backgroundColor: t.color.border }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingLeft: 16, paddingVertical: 8, gap: 12 },
  key: { width: '40%' },
  value: { flex: 1, textAlign: 'right' },
  divider: { position: 'absolute', left: 16, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
