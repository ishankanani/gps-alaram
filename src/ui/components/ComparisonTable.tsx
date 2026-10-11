import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '../../i18n';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PlanBadge } from './PlanBadge';

/** true: a check; false: a dash; a string: a short value ("3"); infinity: the ∞ icon with a spoken label. */
export type ComparisonCell = boolean | string | { infinity: true; label: string };

export type ComparisonRow = {
  feature: string;
  free: ComparisonCell;
  pro: ComparisonCell;
};

type Props = {
  rows: ComparisonRow[];
  style?: StyleProp<ViewStyle>;
};

/**
 * Free vs Pro (3.29): a Section with a header row ("Free" and a PRO badge) and 48 dp rows. Each row
 * reads as one sentence to screen readers. Cells are 72 dp (Pro 88 dp, for "Unbegrenzt").
 */
export function ComparisonTable({ rows, style }: Props) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const spoken = (cell: ComparisonCell) =>
    cell === true ? tr('ui.included') : cell === false ? tr('ui.notIncluded') : typeof cell === 'string' ? cell : cell.label;
  return (
    <View style={[styles.table, { backgroundColor: t.color.surface1, borderRadius: t.radius.lg }, style]}>
      <View style={styles.row} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={styles.feature} />
        <View style={styles.freeCell}>
          <AppText variant="labelS" color="textSecondary" align="center" numberOfLines={1}>
            {tr('ui.plan.free')}
          </AppText>
        </View>
        <View style={styles.proCell}>
          <PlanBadge variant="pro" size="md" />
        </View>
      </View>
      {rows.map((row, i) => (
        <View
          key={row.feature}
          accessible
          accessibilityLabel={`${row.feature}. ${tr('ui.plan.free')}: ${spoken(row.free)}. ${tr('ui.plan.pro')}: ${spoken(row.pro)}`}
          style={[styles.row, styles.bodyRow]}>
          <AppText variant="bodyM" style={styles.feature}>
            {row.feature}
          </AppText>
          <Cell cell={row.free} style={styles.freeCell} />
          <Cell cell={row.pro} style={styles.proCell} />
          {i < rows.length - 1 ? <View style={[styles.divider, { backgroundColor: t.color.border }]} /> : null}
        </View>
      ))}
    </View>
  );
}

function Cell({ cell, style }: { cell: ComparisonCell; style: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      {cell === true ? (
        <Icon name="check" size={20} color="success" />
      ) : cell === false ? (
        <Icon name="minus" size={20} color="textTertiary" />
      ) : typeof cell === 'string' ? (
        <AppText variant="labelM" align="center" tabular>
          {cell}
        </AppText>
      ) : (
        <Icon name="infinity" size={20} color="text" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { marginHorizontal: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 8, minHeight: 44 },
  bodyRow: { minHeight: 48, paddingVertical: 8 },
  feature: { flex: 1, paddingRight: 8 },
  freeCell: { width: 72, alignItems: 'center', justifyContent: 'center' },
  proCell: { width: 88, alignItems: 'center', justifyContent: 'center' },
  divider: { position: 'absolute', left: 16, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
