import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '../../i18n';
import type { StopKind } from '../../lib/stations/text';
import { useTheme } from '../theme';
import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { KindIcon } from './KindIcon';

type Props = {
  kind: StopKind | 'place';
  /** "On the way to", "Demo trip to", "Leaving". */
  overline: string;
  /** The stop name (one line). */
  title: string;
  /** The trailing chevron that minimises the trip to the TripBar. */
  onMinimise?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** The trip map's destination overlay (3.29): surface2, radius lg, elevation 2, padding 12/16. */
export function DestinationCard({ kind, overline, title, onMinimise, testID, style }: Props) {
  const t = useTheme();
  const { t: tr } = useI18n();
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: t.color.surface2, borderRadius: t.radius.lg, paddingRight: onMinimise ? 4 : 16 },
        t.elevation(2),
        style,
      ]}>
      <KindIcon kind={kind} size={40} />
      <View style={styles.text} accessible accessibilityLabel={`${overline} ${title}`}>
        <AppText variant="labelS" color="textSecondary" numberOfLines={1}>
          {overline}
        </AppText>
        <AppText variant="titleS" numberOfLines={1} accessibilityRole="text">
          {title}
        </AppText>
      </View>
      {onMinimise ? (
        <IconButton icon="chevron-down" accessibilityLabel={tr('ui.minimise')} onPress={onMinimise} surface="surface2" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 16, minHeight: 64 },
  text: { flex: 1, gap: 2 },
});
