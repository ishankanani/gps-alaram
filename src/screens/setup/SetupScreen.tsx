import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';

import { TripAlarm, type SettingsKind, type SetupStatus } from '../../../modules/trip-alarm/src';
import { useI18n, type Key } from '../../i18n';
import { goToMap } from '../../navigation/ref';
import type { RootScreenProps, SetupEntry } from '../../navigation/types';
import { useSavedData } from '../../state/saved';
import { useTrip } from '../../state/trip';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  haptics,
  Icon,
  ListItem,
  ProgressBar,
  Screen,
  Section,
  StickyFooter,
  useTheme,
  useToast,
  type ColorToken,
  type IconName,
} from '../../ui';
import { plural } from '../activity/format';
import { batteryHint, itemDone, newlyDone, REQUIRED_ITEMS, RECOMMENDED_ITEMS, summarize, type SetupItemKey } from './checklist';
import { PermissionHint, type HintKind } from './PermissionHint';

function read(): SetupStatus | null {
  try {
    return TripAlarm?.getSetupStatus() ?? null;
  } catch {
    return null;
  }
}

const TITLE: Record<SetupEntry, Key> = {
  onboarding: 'onboarding.setup.title',
  trip: 'setup.title',
  settings: 'onboarding.setup.titleSettings',
  account: 'onboarding.setup.titleSettings',
  arrived: 'onboarding.setup.titleSettings',
};

const ITEM: Record<SetupItemKey, { icon: IconName; title: Key; why: Key; done: Key; ok: Key }> = {
  location: { icon: 'map-marker-radius-outline', title: 'setup.location.title', why: 'setup.location.why', done: 'onboarding.setup.allowed', ok: 'onboarding.setup.ok.location' },
  services: { icon: 'crosshairs-gps', title: 'setup.services.title', why: 'setup.services.why', done: 'onboarding.setup.on', ok: 'onboarding.setup.ok.services' },
  notifications: { icon: 'bell-ring-outline', title: 'setup.notifications.title', why: 'setup.notifications.why', done: 'onboarding.setup.allowed', ok: 'onboarding.setup.ok.notifications' },
  fullscreen: { icon: 'cellphone-lock', title: 'setup.fullscreen.title', why: 'setup.fullscreen.why', done: 'onboarding.setup.allowed', ok: 'onboarding.setup.ok.fullscreen' },
  exact: { icon: 'alarm-check', title: 'setup.exact.title', why: 'setup.exact.why', done: 'onboarding.setup.allowed', ok: 'onboarding.setup.ok.exact' },
  battery: { icon: 'battery-heart-variant', title: 'setup.battery.title', why: 'setup.battery.why', done: 'onboarding.setup.on', ok: 'onboarding.setup.ok.battery' },
};

/** The verb button of an item that isn't done, and which choices to show for it. */
function fixFor(key: SetupItemKey, status: SetupStatus): { label: Key; hint?: HintKind } {
  switch (key) {
    case 'location':
      return status.location === 'approximate'
        ? { label: 'setup.switchPrecise', hint: 'precise' }
        : { label: 'onboarding.setup.allowLocation', hint: 'location' };
    case 'services':
      return { label: 'setup.turnOn' };
    case 'notifications':
      return { label: 'onboarding.setup.allowNotifications', hint: 'notifications' };
    case 'fullscreen':
    case 'exact':
      return { label: 'setup.allow' };
    case 'battery':
      return { label: 'setup.openSettings' };
  }
}

/**
 * Setup, "Get ready" (ui-direction-a 4.3 Setup merged with Permissions priming, ui-critiques):
 * the required steps (precise location, location on, notifications), each with its own sentence,
 * a drawing of which choices to tap and one verb button; then the recommended items and a test of
 * the alarm. Everything refreshes when the user comes back from a system page. Opened for a
 * waiting trip, the footer starts it.
 */
export function SetupScreen({ navigation, route }: RootScreenProps<'Setup'>) {
  const { t: tr } = useI18n();
  const entry: SetupEntry = route.params?.entry ?? 'settings';
  const [initial] = useState(read);

  const leave = useCallback(() => (navigation.canGoBack() ? navigation.goBack() : goToMap()), [navigation]);

  if (!TripAlarm || !initial) {
    return (
      <Screen topBar={{ title: tr(TITLE[entry]) }} testID="screen-Setup">
        <EmptyState
          icon="cellphone-cog"
          title={tr('onboarding.setup.unsupported')}
          body={tr('setup.unsupported.body')}
          action={{ label: tr('common.back'), onPress: leave }}
        />
      </Screen>
    );
  }
  return <Checklist initial={initial} entry={entry} focus={route.params?.focus} onLeave={leave} />;
}

type ChecklistProps = { initial: SetupStatus; entry: SetupEntry; focus?: 'battery'; onLeave: () => void };

function Checklist({ initial, entry, focus, onLeave }: ChecklistProps) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const toast = useToast();
  const saved = useSavedData();
  const trip = useTrip();
  const [status, setStatus] = useState<SetupStatus>(initial);
  const [testing, setTesting] = useState(false);
  const latest = useRef(initial);
  const scroll = useRef<ScrollView>(null);
  const scrolledToFocus = useRef(false);
  const pending = entry === 'trip' ? trip.pending : null;

  /** Reads the checklist again and says which item just turned done. */
  const refresh = useCallback(() => {
    const next = read();
    if (!next) return;
    const done = newlyDone(latest.current, next);
    latest.current = next;
    setStatus(next);
    const last = done[done.length - 1];
    if (last) toast.show({ id: 'setup-ok', message: tr(ITEM[last].ok), icon: 'check-circle-outline' });
  }, [toast, tr]);

  // Coming back from a system settings page or permission window.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const native = TripAlarm;
  if (!native) return null;
  const open = (kind: SettingsKind) => () => {
    native.openSettings(kind);
  };

  async function askLocation() {
    const current = await Location.getForegroundPermissionsAsync();
    if ((current.granted && current.android?.accuracy === 'coarse') || (!current.granted && !current.canAskAgain)) {
      // Only the app's settings page can switch approximate to precise, or undo "don't ask again".
      native?.openSettings('app');
      return;
    }
    await Location.requestForegroundPermissionsAsync().catch(() => null);
    refresh();
    if (latest.current.location !== 'precise') haptics.warning();
  }

  async function askNotifications() {
    const result = await native!.requestNotificationPermission().catch(() => ({ granted: false }));
    if (!result.granted) native!.openSettings('notifications');
    refresh();
  }

  async function test() {
    setTesting(true);
    try {
      await native!.testAlarm(pending?.wake.strength ?? saved.data.preferences.strength);
    } catch {
      toast.show({ message: tr('ui.failed') });
    } finally {
      setTesting(false);
    }
  }

  /** The button of an item that isn't done (an event handler: it may read refs). */
  function runFix(key: SetupItemKey) {
    switch (key) {
      case 'location':
        void askLocation();
        return;
      case 'notifications':
        void askNotifications();
        return;
      case 'services':
        return open('location')();
      case 'fullscreen':
        return open('fullScreenAlarm')();
      case 'exact':
        return open('exactAlarms')();
      case 'battery':
        return open('battery')();
    }
  }

  const summary = summarize(status);
  const oemHint = batteryHint(status.manufacturer);
  let headline: string;
  let body: Key;
  let headIcon: IconName;
  let headColor: ColorToken;
  if (summary.requiredMissing > 0) {
    headline = plural(tr, lang, 'onboarding.setup.toFix', summary.requiredMissing);
    body = 'onboarding.setup.fixBody';
    headIcon = 'alert-circle-outline';
    headColor = 'warning';
  } else if (summary.recommendedMissing > 0) {
    headline = plural(tr, lang, 'onboarding.setup.toImprove', summary.recommendedMissing);
    body = 'onboarding.setup.improveBody';
    headIcon = 'check-decagram';
    headColor = 'success';
  } else {
    headline = tr('onboarding.setup.ready');
    body = 'onboarding.setup.readyBody';
    headIcon = 'check-decagram';
    headColor = 'success';
  }

  const missingRequired = REQUIRED_ITEMS.filter((key) => !itemDone(status, key));
  const items = (keys: readonly SetupItemKey[], required: boolean) =>
    keys.map((key) => {
      const item = ITEM[key];
      if (itemDone(status, key)) {
        return (
          <ListItem
            key={key}
            leading={<Icon name="check-circle" size={24} color="success" />}
            leadingWidth={24}
            title={tr(item.title)}
            subtitle={tr(item.done)}
            testID={`setup-${key}`}
          />
        );
      }
      const fix = fixFor(key, status);
      return (
        <StepRow
          key={key}
          icon={required ? 'alert-circle-outline' : 'alert-outline'}
          iconColor={required ? 'danger' : 'warning'}
          title={tr(item.title)}
          step={required ? tr('onboarding.setup.step', { step: missingRequired.indexOf(key) + 1 }) : undefined}
          why={key === 'battery' && oemHint ? tr(oemHint) : tr(item.why)}
          hint={fix.hint}
          action={tr(fix.label)}
          itemKey={key}
          onAction={runFix}
          highlight={focus === key}
          testID={`setup-${key}`}
        />
      );
    });

  const footer =
    entry === 'onboarding' || entry === 'trip' ? (
      <StickyFooter helper={summary.ready ? undefined : tr('onboarding.setup.helper')}>
        <Button
          label={pending ? tr('place.start') : tr('common.continue')}
          icon={pending ? 'alarm' : undefined}
          block
          disabled={!summary.ready}
          loading={trip.starting}
          onPress={() => (pending ? void trip.launch(pending) : onLeave())}
          testID="setup-continue"
        />
        {entry === 'onboarding' ? (
          <Button label={tr('onboarding.setup.notNow')} variant="ghost" size="M" block onPress={onLeave} testID="setup-not-now" />
        ) : null}
      </StickyFooter>
    ) : undefined;

  return (
    <Screen topBar={{ title: tr(TITLE[entry]) }} footer={footer} scrollRef={scroll} testID="screen-Setup">
      <Card style={styles.status}>
        <View style={styles.statusHead}>
          <Icon name={headIcon} size={32} color={headColor} />
          <AppText variant="titleS" style={styles.flex} accessibilityLiveRegion="polite">
            {headline}
          </AppText>
        </View>
        <AppText variant="bodyM" color="textSecondary">
          {tr(body)}
        </AppText>
        <ProgressBar
          progress={summary.done / summary.total}
          status={summary.done === summary.total ? 'complete' : 'active'}
          accessibilityLabel={tr('onboarding.setup.progress', { done: summary.done, total: summary.total })}
        />
        <AppText variant="bodyS" color="textTertiary" tabular>
          {tr('onboarding.setup.progress', { done: summary.done, total: summary.total })}
        </AppText>
      </Card>

      <Section title={tr('setup.required')} footer={tr('onboarding.setup.privacy')}>
        {items(REQUIRED_ITEMS, true)}
      </Section>

      <View
        onLayout={(e) => {
          if (focus !== 'battery' || scrolledToFocus.current) return;
          scrolledToFocus.current = true;
          const y = e.nativeEvent.layout.y;
          setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: !t.reduceMotion }), 50);
        }}>
        <Section title={tr('setup.recommended')}>{items(RECOMMENDED_ITEMS, false)}</Section>
      </View>

      <Section title={tr('onboarding.setup.check')}>
        <ListItem
          icon="volume-high"
          title={tr('setup.test')}
          subtitle={tr('onboarding.setup.testBody')}
          accessible={false}
          trailing={
            <Button
              label={tr('onboarding.setup.play')}
              icon="play"
              variant="secondary"
              size="S"
              loading={testing}
              onPress={() => void test()}
              testID="setup-test"
            />
          }
        />
      </Section>
    </Screen>
  );
}

type StepRowProps = {
  icon: IconName;
  iconColor: ColorToken;
  title: string;
  /** "Step 1" for required items. */
  step?: string;
  why: string;
  hint?: HintKind;
  action: string;
  itemKey: SetupItemKey;
  onAction: (key: SetupItemKey) => void;
  /** Opened from "Fix battery settings": marked with an indigo edge. */
  highlight?: boolean;
  testID?: string;
};

/** A checklist item that still needs doing: why, which choices to tap, and one button. */
function StepRow({ icon, iconColor, title, step, why, hint, action, itemKey, onAction, highlight, testID }: StepRowProps) {
  const t = useTheme();
  return (
    <View testID={testID} style={[styles.step, { borderBottomColor: t.color.border }]}>
      {highlight ? <View style={[styles.highlight, { backgroundColor: t.color.primary }]} /> : null}
      <View style={styles.stepHead}>
        <Icon name={icon} size={24} color={iconColor} />
        <View style={styles.flex} accessible>
          {step ? (
            <AppText variant="labelS" color="textSecondary">
              {step}
            </AppText>
          ) : null}
          <AppText variant="bodyL" weight="medium">
            {title}
          </AppText>
          <AppText variant="bodyM" color="textSecondary">
            {why}
          </AppText>
        </View>
      </View>
      <View style={styles.stepBody}>
        {hint ? <PermissionHint kind={hint} /> : null}
        <Button label={action} variant="secondary" size="M" onPress={() => onAction(itemKey)} style={styles.stepButton} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  status: { marginHorizontal: 16, marginTop: 8 },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: { paddingHorizontal: 16, paddingVertical: 16, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  highlight: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  stepHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  stepBody: { paddingLeft: 40, gap: 12 },
  stepButton: { alignSelf: 'flex-start' },
});
