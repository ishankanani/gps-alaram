import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TripAlarm, type AlarmStrength, type SettingsKind, type SetupStatus } from '../../modules/trip-alarm/src';
import { Body, Button, Card, StatusDot, Title } from '../ui/components';
import { useTheme } from '../ui/theme';

type Props = {
  strength: AlarmStrength;
  /** Shown when everything required is in place. */
  continueLabel: string;
  onContinue: () => void;
  onBack: () => void;
};

type Item = {
  key: string;
  title: string;
  why: string;
  ok: boolean;
  required: boolean;
  fixLabel: string;
  fix: () => void | Promise<void>;
};

/** Battery savers that are known to kill background apps; dontkillmyapp.com has the details. */
const OEM_HINTS: Record<string, string> = {
  samsung: 'Samsung: Settings › Battery › Background usage limits: add StopWake to "Never sleeping apps".',
  xiaomi: 'Xiaomi: App info › Battery saver › No restrictions, and turn on Autostart.',
  redmi: 'Xiaomi: App info › Battery saver › No restrictions, and turn on Autostart.',
  poco: 'Xiaomi: App info › Battery saver › No restrictions, and turn on Autostart.',
  oppo: 'OPPO: App info › Battery usage › Allow background activity.',
  realme: 'realme: App info › Battery usage › Allow background activity.',
  oneplus: 'OnePlus: App info › Battery › Unrestricted.',
  vivo: 'vivo: Settings › Battery › Background power consumption › allow StopWake.',
  huawei: 'Huawei: Settings › Battery › App launch › StopWake › Manage manually, all on.',
};

export function SetupScreen({ strength, continueLabel, onContinue, onBack }: Props) {
  const t = useTheme();
  const [status, setStatus] = useState<SetupStatus | null>(() => TripAlarm?.getSetupStatus() ?? null);
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(() => setStatus(TripAlarm?.getSetupStatus() ?? null), []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  if (!TripAlarm || !status) {
    return (
      <View style={[styles.container, { backgroundColor: t.background }]}>
        <Title>Not supported yet</Title>
        <Body>Trip alarms run on Android for now. The iPhone version comes next.</Body>
        <Button title="Back" kind="secondary" onPress={onBack} />
      </View>
    );
  }
  const native = TripAlarm;

  const open = (kind: SettingsKind) => () => {
    native.openSettings(kind);
  };

  async function askLocation() {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted && current.android?.accuracy === 'coarse') {
      // Approximate was chosen; only the settings page can upgrade it to precise.
      native.openSettings('app');
      return;
    }
    if (!current.granted && !current.canAskAgain) {
      native.openSettings('app');
      return;
    }
    await Location.requestForegroundPermissionsAsync();
    refresh();
  }

  async function askNotifications() {
    const res = await native.requestNotificationPermission();
    if (!res.granted) native.openSettings('notifications');
    refresh();
  }

  const manufacturer = status.manufacturer.toLowerCase();
  const oemHint = Object.entries(OEM_HINTS).find(([k]) => manufacturer.includes(k))?.[1];

  const items: Item[] = [
    {
      key: 'location',
      title: 'Precise location',
      why: 'Needed to know how far you are from your stop. Used only while a trip is running.',
      ok: status.location === 'precise',
      required: true,
      fixLabel: status.location === 'approximate' ? 'Switch to precise' : 'Allow',
      fix: askLocation,
    },
    {
      key: 'services',
      title: 'Location turned on',
      why: 'Your phone’s location setting is off.',
      ok: status.locationServices,
      required: true,
      fixLabel: 'Turn on',
      fix: open('location'),
    },
    {
      key: 'notifications',
      title: 'Notifications',
      why: 'The trip shows a notification while it runs, and the alarm rings through one.',
      ok: status.notifications,
      required: true,
      fixLabel: 'Allow',
      fix: askNotifications,
    },
    {
      key: 'fullscreen',
      title: 'Alarm over the lock screen',
      why: 'Lets the alarm fill the screen when your phone is locked. Without it you only get a banner.',
      ok: status.fullScreenAlarm,
      required: false,
      fixLabel: 'Allow',
      fix: open('fullScreenAlarm'),
    },
    {
      key: 'exact',
      title: 'Alarms & reminders',
      why: 'Keeps the GPS-lost backup alarm on time while the phone sleeps.',
      ok: status.exactAlarms,
      required: false,
      fixLabel: 'Allow',
      fix: open('exactAlarms'),
    },
    {
      key: 'battery',
      title: 'No battery restrictions',
      why: oemHint ?? 'Stops the battery saver from closing StopWake in the middle of a trip.',
      ok: status.batteryUnrestricted,
      required: false,
      fixLabel: 'Open settings',
      fix: open('battery'),
    },
  ];

  const ready = items.every((i) => !i.required || i.ok);

  async function test() {
    setTesting(true);
    try {
      await native.testAlarm(strength);
    } finally {
      setTesting(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.container}>
      <Title>Before you go</Title>
      <Body muted>StopWake needs a few permissions to wake you reliably. Required ones are marked.</Body>

      {items.map((item) => (
        <Card key={item.key}>
          <View style={styles.row}>
            <StatusDot color={item.ok ? t.good : item.required ? t.bad : t.warn} />
            <Text style={[styles.itemTitle, { color: t.text }]}>
              {item.title}
              {item.required ? '  ·  required' : ''}
            </Text>
          </View>
          <Body muted>{item.why}</Body>
          {!item.ok ? <Button title={item.fixLabel} kind="secondary" onPress={() => void item.fix()} /> : null}
        </Card>
      ))}

      <Button title="Test the alarm" kind="secondary" busy={testing} onPress={test} />
      <Button title={continueLabel} disabled={!ready} onPress={onContinue} />
      <Button title="Back" kind="secondary" onPress={onBack} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemTitle: { fontSize: 17, fontWeight: '700', flex: 1 },
});
