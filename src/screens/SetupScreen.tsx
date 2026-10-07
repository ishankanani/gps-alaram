import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TripAlarm, type AlarmStrength, type SettingsKind, type SetupStatus } from '../../modules/trip-alarm/src';
import { useI18n, type Key } from '../i18n';
import { Body, Button, Card, Icon, IconButton, Title, type IconName } from '../ui/components';
import { radius, useTheme } from '../ui/theme';

type Props = {
  strength: AlarmStrength;
  /** Shown when everything required is in place. */
  continueLabel: string;
  onContinue: () => void;
  onBack: () => void;
};

type Item = {
  key: string;
  icon: IconName;
  title: Key;
  why: string;
  ok: boolean;
  required: boolean;
  fixLabel: Key;
  fix: () => void | Promise<void>;
};

/** Battery savers known to kill background apps (see dontkillmyapp.com). */
const OEM_HINT: [string, Key][] = [
  ['samsung', 'setup.battery.samsung'],
  ['xiaomi', 'setup.battery.xiaomi'],
  ['redmi', 'setup.battery.xiaomi'],
  ['poco', 'setup.battery.xiaomi'],
  ['oppo', 'setup.battery.oppo'],
  ['realme', 'setup.battery.oppo'],
  ['oneplus', 'setup.battery.oneplus'],
  ['vivo', 'setup.battery.vivo'],
  ['huawei', 'setup.battery.huawei'],
  ['honor', 'setup.battery.huawei'],
];

/** True when everything a trip cannot run without is in place. */
export function setupReady(status: SetupStatus | null | undefined): boolean {
  return !!status && status.location === 'precise' && status.locationServices && status.notifications;
}

export function SetupScreen({ strength, continueLabel, onContinue, onBack }: Props) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<SetupStatus | null>(() => TripAlarm?.getSetupStatus() ?? null);
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(() => setStatus(TripAlarm?.getSetupStatus() ?? null), []);

  useEffect(() => {
    // Coming back from a system settings page.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  if (!TripAlarm || !status) {
    return (
      <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top + 16 }]}>
        <Title>{tr('setup.unsupported.title')}</Title>
        <Body>{tr('setup.unsupported.body')}</Body>
        <Button title={tr('common.back')} kind="secondary" onPress={onBack} />
      </View>
    );
  }
  const native = TripAlarm;

  const open = (kind: SettingsKind) => () => {
    native.openSettings(kind);
  };

  async function askLocation() {
    const current = await Location.getForegroundPermissionsAsync();
    if ((current.granted && current.android?.accuracy === 'coarse') || (!current.granted && !current.canAskAgain)) {
      // Only the app's settings page can switch approximate to precise, or undo "don't ask again".
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
  const oemHint = OEM_HINT.find(([brand]) => manufacturer.includes(brand))?.[1];

  const items: Item[] = [
    {
      key: 'location',
      icon: 'map-marker-account',
      title: 'setup.location.title',
      why: tr('setup.location.why'),
      ok: status.location === 'precise',
      required: true,
      fixLabel: status.location === 'approximate' ? 'setup.switchPrecise' : 'setup.allow',
      fix: askLocation,
    },
    {
      key: 'services',
      icon: 'crosshairs-gps',
      title: 'setup.services.title',
      why: tr('setup.services.why'),
      ok: status.locationServices,
      required: true,
      fixLabel: 'setup.turnOn',
      fix: open('location'),
    },
    {
      key: 'notifications',
      icon: 'bell-ring-outline',
      title: 'setup.notifications.title',
      why: tr('setup.notifications.why'),
      ok: status.notifications,
      required: true,
      fixLabel: 'setup.allow',
      fix: askNotifications,
    },
    {
      key: 'fullscreen',
      icon: 'cellphone-lock',
      title: 'setup.fullscreen.title',
      why: tr('setup.fullscreen.why'),
      ok: status.fullScreenAlarm,
      required: false,
      fixLabel: 'setup.allow',
      fix: open('fullScreenAlarm'),
    },
    {
      key: 'exact',
      icon: 'alarm-check',
      title: 'setup.exact.title',
      why: tr('setup.exact.why'),
      ok: status.exactAlarms,
      required: false,
      fixLabel: 'setup.allow',
      fix: open('exactAlarms'),
    },
    {
      key: 'battery',
      icon: 'battery-heart-variant',
      title: 'setup.battery.title',
      why: oemHint ? tr(oemHint) : tr('setup.battery.why'),
      ok: status.batteryUnrestricted,
      required: false,
      fixLabel: 'setup.openSettings',
      fix: open('battery'),
    },
  ];

  const ready = setupReady(status);

  async function test() {
    setTesting(true);
    try {
      await native.testAlarm(strength);
    } finally {
      setTesting(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <IconButton icon="arrow-left" label={tr('common.back')} onPress={onBack} size={44} />
      <Title>{tr('setup.title')}</Title>
      <Body muted>{tr('setup.body')}</Body>

      {items.map((item) => (
        <Card key={item.key} style={styles.item}>
          <View style={styles.itemHeader}>
            <View style={[styles.itemIcon, { backgroundColor: item.ok ? t.good : item.required ? t.bad : t.warn }]}>
              <Icon name={item.ok ? 'check' : item.icon} size={20} color="#FFFFFF" />
            </View>
            <View style={styles.itemTitle}>
              <Text style={[styles.itemTitleText, { color: t.text }]}>{tr(item.title)}</Text>
              <Text style={[styles.itemTag, { color: item.required ? t.bad : t.muted }]}>
                {item.ok ? tr('setup.allSet') : tr(item.required ? 'setup.required' : 'setup.recommended')}
              </Text>
            </View>
          </View>
          {!item.ok ? (
            <>
              <Body muted>{item.why}</Body>
              <Button title={tr(item.fixLabel)} kind="secondary" compact onPress={() => void item.fix()} />
            </>
          ) : null}
        </Card>
      ))}

      <Button title={tr('setup.test')} kind="secondary" icon="volume-high" busy={testing} onPress={test} />
      <Button title={continueLabel} disabled={!ready} onPress={onContinue} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: 18, gap: 14 },
  item: { gap: 10, padding: 16 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemIcon: { width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { flex: 1, gap: 2 },
  itemTitleText: { fontSize: 17, fontWeight: '700' },
  itemTag: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
});
