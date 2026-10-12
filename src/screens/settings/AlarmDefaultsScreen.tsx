import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TripAlarm, type AlarmStrength } from '../../../modules/trip-alarm/src';
import { useI18n, type Key } from '../../i18n';
import { formatRadius } from '../../lib/format';
import { effectiveStrength, strengthAllowed } from '../../lib/plans';
import { usePro } from '../../lib/pro';
import { DISTANCE_CHOICES, MINUTE_CHOICES } from '../../lib/wake';
import { openSheet } from '../../navigation/sheet';
import type { RootScreenProps } from '../../navigation/types';
import { useSavedData } from '../../state/saved';
import { AppText, Button, ListItem, Screen, Section, SegmentedControl, useTheme, useToast } from '../../ui';
import { nbsp } from '../activity/format';

const STRENGTHS: AlarmStrength[] = ['gentle', 'normal', 'heavy'];

/**
 * AlarmDefaults (ui-direction-a 4.3 Settings): the alarm sound every trip starts with (Heavy
 * sleeper needs Pro while the config says so), a test, and how early to wake by default: by time
 * for trains and S-Bahn, by distance for everything else.
 */
export function AlarmDefaultsScreen({ navigation }: RootScreenProps<'AlarmDefaults'>) {
  const { t: tr, lang } = useI18n();
  const saved = useSavedData();
  const toast = useToast();
  const theme = useTheme();
  const { isPro } = usePro();
  const [testing, setTesting] = useState(false);
  const prefs = saved.data.preferences;
  const effective = effectiveStrength(prefs.strength, isPro);
  const distance = (m: number) => nbsp(formatRadius(m, prefs.useMiles, lang));

  async function test() {
    if (!TripAlarm || testing) return;
    setTesting(true);
    try {
      await TripAlarm.testAlarm(effective);
    } catch {
      toast.show({ message: tr('ui.failed') });
    } finally {
      setTesting(false);
    }
  }

  async function pickMinutes() {
    const choice = await openSheet({
      title: tr('settings.alarmDefaults.trains'),
      message: tr('settings.alarmDefaults.minutesSheet'),
      options: MINUTE_CHOICES.map((m) => ({ id: String(m), label: tr('place.minutesBefore', { minutes: m }), selected: prefs.minutesBefore === m })),
    });
    if (choice) saved.setPreferences((p) => ({ ...p, minutesBefore: Number(choice) }));
  }

  async function pickDistance() {
    const choice = await openSheet({
      title: tr('settings.alarmDefaults.others'),
      message: tr('settings.alarmDefaults.distanceSheet'),
      options: DISTANCE_CHOICES.map((m) => ({
        id: String(m),
        label: tr('settings.alarmDefaults.distanceBefore', { distance: distance(m) }),
        selected: prefs.radiusM === m,
      })),
    });
    if (choice) saved.setPreferences((p) => ({ ...p, radiusM: Number(choice) }));
  }

  return (
    <Screen topBar={{ title: tr('settings.alarmDefaults') }} testID="screen-AlarmDefaults">
      <Section title={tr('settings.alarmDefaults.sound')} first>
        <View style={[styles.strength, { borderBottomColor: theme.color.border }]}>
          <SegmentedControl<AlarmStrength>
            value={effective}
            onChange={(strength) => saved.setPreferences((p) => ({ ...p, strength }))}
            onLockedPress={() => navigation.navigate('Paywall', { reason: 'heavy' })}
            accessibilityLabel={tr('settings.alarmDefaults.sound')}
            options={STRENGTHS.map((s) => ({
              value: s,
              label: tr(`strength.${s}` as Key),
              locked: !strengthAllowed(s, isPro),
            }))}
            testID="alarm-defaults-strength"
          />
          <AppText variant="bodyM" color="textSecondary">
            {tr(`strength.${effective}.body` as Key)}
          </AppText>
        </View>
        <ListItem
          icon="volume-high"
          title={tr('settings.alarmDefaults.test')}
          subtitle={TripAlarm ? tr('settings.alarmDefaults.testBody') : tr('settings.alarmDefaults.testUnavailable')}
          subtitleLines={2}
          accessible={false}
          trailing={
            <Button
              label={tr('settings.alarmDefaults.play')}
              icon="play"
              variant="secondary"
              size="S"
              loading={testing}
              disabled={!TripAlarm}
              onPress={() => void test()}
              testID="alarm-defaults-test"
            />
          }
        />
      </Section>

      <Section title={tr('settings.alarmDefaults.wakeMe')} footer={tr('settings.alarmDefaults.footer')}>
        <ListItem
          icon="train"
          title={tr('settings.alarmDefaults.trains')}
          value={tr('place.minutesBefore', { minutes: prefs.minutesBefore })}
          chevron
          onPress={() => void pickMinutes()}
          testID="alarm-defaults-minutes"
        />
        <ListItem
          icon="bus"
          title={tr('settings.alarmDefaults.others')}
          value={tr('settings.alarmDefaults.distanceBefore', { distance: distance(prefs.radiusM) })}
          chevron
          onPress={() => void pickDistance()}
          testID="alarm-defaults-distance"
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  strength: { padding: 16, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
