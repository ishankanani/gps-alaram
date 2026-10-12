import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { MODE } from '../../lib/stations/text';
import {
  AppText,
  Button,
  Chip,
  KindIcon,
  ModeBadge,
  ModeBadgeRow,
  SegmentedControl,
  StopPin,
  TripBar,
  useTheme,
} from '../../ui';

// Onboarding illustrations, built from the app's real components at 0.8 scale (never stock art).
// They are decoration: the panel around them carries one accessibility label, and nothing inside
// can be touched or focused.

const STOP = 'München Hbf';
const NODES = ['U', 'S', 'Tram', 'U'];
const noop = () => {};

/** Page 1: a ride along stops, ending at a stop inside the amber wake circle, and the alarm. */
export function RouteIllustration() {
  const t = useTheme();
  const { t: tr } = useI18n();
  return (
    <View style={styles.fill}>
      <View style={styles.routeArea}>
        <View style={styles.route}>
          <View style={[styles.line, { backgroundColor: t.color.primary }]} />
          {NODES.map((badge, i) => (
            <View key={`${badge}-${i}`} style={styles.nodeColumn}>
              <ModeBadge badge={badge} />
              <View style={[styles.node, { backgroundColor: t.color.surface1, borderColor: t.color.primary }]} />
            </View>
          ))}
          <View style={styles.destination}>
            <View style={[styles.ring, { backgroundColor: t.map.zoneFill, borderColor: t.map.zoneLine }]} />
            <View style={styles.pin}>
              <StopPin kind="train" animate={false} />
            </View>
          </View>
        </View>
      </View>
      <View style={styles.tripBar}>
        <TripBar kind="train" title={`${tr('trip.wakeUp')} ${STOP}`} state="ringing" openAlarmLabel={tr('nav.openAlarm')} onPress={noop} />
      </View>
    </View>
  );
}

/** Page 2: the stop sheet waking 2 minutes before, and "Rings in silent mode". */
export function StopIllustration() {
  const t = useTheme();
  const { t: tr } = useI18n();
  return (
    <View style={styles.fill}>
      <View style={[styles.sheet, { backgroundColor: t.dark ? t.color.surface2 : t.color.surface1, borderRadius: t.radius.xl }]}>
        <View style={styles.header}>
          <KindIcon kind="train" />
          <View style={styles.headerText}>
            <AppText variant="titleS" numberOfLines={1} allowFontScaling={false}>
              {STOP}
            </AppText>
            <ModeBadgeRow modes={MODE.ICE | MODE.IC | MODE.RE | MODE.SBAHN | MODE.UBAHN} />
          </View>
        </View>
        <SegmentedControl<'time' | 'distance'>
          value="time"
          onChange={noop}
          options={[
            { value: 'time', label: tr('place.byTime') },
            { value: 'distance', label: tr('place.byDistance') },
          ]}
        />
        <View style={styles.chips}>
          {[1, 2, 3].map((m) => (
            <Chip key={m} label={tr('settings.minutes', { minutes: m })} selected={m === 2} onPress={noop} />
          ))}
        </View>
        <AppText variant="bodyS" color="textSecondary" allowFontScaling={false}>
          {tr('place.ruleTime', { minutes: 2 })}
        </AppText>
        <Button label={tr('place.start')} icon="alarm" block onPress={noop} />
      </View>
      <View style={styles.silent}>
        <Chip variant="assist" onMap icon="volume-off" label={tr('onboarding.silent')} onPress={noop} />
      </View>
    </View>
  );
}

const NODE = 14;
const RING = 76;

const styles = StyleSheet.create({
  fill: { width: '100%', alignItems: 'center', justifyContent: 'center', gap: 16, transform: [{ scale: 0.8 }] },
  routeArea: { width: '100%', alignItems: 'center' },
  route: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', width: 360, paddingHorizontal: 12 },
  line: { position: 'absolute', left: 24, right: RING / 2 + 12, bottom: RING / 2 - 3, height: 6, borderRadius: 3 },
  nodeColumn: { alignItems: 'center', gap: 8, marginBottom: RING / 2 - NODE / 2 },
  node: { width: NODE, height: NODE, borderRadius: NODE / 2, borderWidth: 3 },
  destination: { width: RING, height: RING + 40, justifyContent: 'flex-end' },
  ring: { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2 },
  pin: { position: 'absolute', left: (RING - 44) / 2, bottom: RING / 2 },
  tripBar: { width: 340 },
  sheet: { width: 340, padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, gap: 4 },
  chips: { flexDirection: 'row', gap: 8 },
  silent: { position: 'absolute', top: -8, right: 0 },
});
