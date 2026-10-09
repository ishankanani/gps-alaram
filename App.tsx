import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TripAlarm, type TripEndedEvent, type TripStatus } from './modules/trip-alarm/src';
import { deviceLanguage, I18nProvider, translator, type Lang } from './src/i18n';
import type { Place } from './src/lib/geocode';
import type { LatLon } from './src/lib/stations/search';
import type { Preferences } from './src/lib/prefs';
import { loadData, samePlace, saveData, toggleFavourite, withRecent, type SavedData } from './src/lib/storage';
import { EMPTY_TRAIL, extendTrail } from './src/lib/trail';
import { demoRide, rememberWake, tripOptions, type WakeOptions } from './src/lib/wake';
import { DoneScreen } from './src/screens/DoneScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SetupScreen, setupReady } from './src/screens/SetupScreen';
import { TrackingScreen } from './src/screens/TrackingScreen';
import { useTheme } from './src/ui/theme';

/** A trip waiting for setup to finish. With demoFrom set it is a demo ride (simulated movement). */
type PendingTrip = { place: Place; wake: WakeOptions; demo?: { from: LatLon | null } };

type Screen =
  | { name: 'onboarding' }
  | { name: 'setup'; then: PendingTrip | null }
  | { name: 'home' }
  | { name: 'settings' }
  | { name: 'tracking' }
  | { name: 'done'; ended: TripEndedEvent; place: Place | null };

function isRunning(status: TripStatus | null): status is TripStatus {
  return !!status?.trip && status.state !== 'stopped';
}

export default function App() {
  const t = useTheme();
  const [data, setData] = useState<SavedData>(loadData);
  const [screen, setScreen] = useState<Screen>(() => (loadData().preferences.onboarded ? { name: 'home' } : { name: 'onboarding' }));
  const [status, setStatus] = useState<TripStatus | null>(null);
  const [trail, setTrail] = useState(EMPTY_TRAIL);
  const [stoppedNotice, setStoppedNotice] = useState(false);
  const [starting, setStarting] = useState(false);
  const tripPlace = useRef<Place | null>(null);

  const deviceLang = useMemo(deviceLanguage, []);
  const lang: Lang = data.preferences.language ?? deviceLang;
  const i18n = useMemo(() => ({ lang, t: translator(lang) }), [lang]);
  const tr = i18n.t;

  // The alarm screen and notifications are native: tell them the language too.
  useEffect(() => {
    TripAlarm?.setLanguage(lang);
  }, [lang]);

  const update = useCallback((next: SavedData) => {
    setData(next);
    saveData(next);
  }, []);

  const setPreferences = useCallback(
    (preferences: Preferences) => update({ ...data, preferences }),
    [data, update],
  );

  // Pick up a trip that is already running (the app was closed while the service tracked).
  const syncWithService = useCallback(() => {
    if (!TripAlarm) return;
    const active = TripAlarm.getActiveTrip();
    if (active?.state === 'stopped') {
      setStoppedNotice(true);
      void TripAlarm.stopTrip();
    } else if (isRunning(active)) {
      setStatus(active);
      setScreen({ name: 'tracking' });
    }
  }, []);

  useEffect(() => {
    const native = TripAlarm;
    if (!native) return;
    syncWithService();
    const subs = [
      native.addListener('onStatus', (s) => {
        setStatus(s);
        setTrail((cur) => extendTrail(cur, s));
        if (isRunning(s)) setScreen((cur) => (cur.name === 'tracking' ? cur : { name: 'tracking' }));
      }),
      native.addListener('onTripEnded', (ended) => {
        setStatus(null);
        setScreen({ name: 'done', ended, place: tripPlace.current });
      }),
    ];
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncWithService();
    });
    return () => {
      subs.forEach((s) => s.remove());
      appState.remove();
    };
  }, [syncWithService]);

  // Android back: go home from secondary screens; never leave a running trip by accident.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen.name === 'settings' || screen.name === 'done' || (screen.name === 'setup' && data.preferences.onboarded)) {
        setScreen({ name: 'home' });
        return true;
      }
      return screen.name === 'tracking';
    });
    return () => sub.remove();
  }, [screen.name, data.preferences.onboarded]);

  async function launch({ place, wake, demo }: PendingTrip) {
    const native = TripAlarm;
    if (!native) return;
    const preferences = rememberWake(data.preferences, wake);
    // A demo ride is a try-out: it does not count as a recent place.
    update(demo ? { ...data, preferences } : withRecent({ ...data, preferences }, place));
    tripPlace.current = place;
    setStarting(true);
    try {
      const options = tripOptions(place, wake, preferences.useMiles);
      const trip = await native.startTrip(demo ? { ...options, ...demoRide(place, place.kind ?? 'place', wake, demo.from) } : options);
      setStoppedNotice(false);
      setStatus({ trip, state: 'tracking', health: 'waiting' });
      setScreen({ name: 'tracking' });
    } catch (e) {
      Alert.alert(tr('trip.startFailed'), e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  function start(pending: PendingTrip) {
    if (setupReady(TripAlarm?.getSetupStatus())) void launch(pending);
    else setScreen({ name: 'setup', then: pending });
  }

  /** The destination's kind for the trip map pin, also after the app was restarted mid-trip. */
  function tripKind() {
    const label = status?.trip?.label;
    const place = tripPlace.current ?? data.recents.find((p) => p.name === label) ?? null;
    return place?.kind ?? 'place';
  }

  let content;
  if (screen.name === 'tracking' && isRunning(status)) {
    content = <TrackingScreen status={status} kind={tripKind()} trail={trail.tripId === status.trip?.id ? trail.points : []} />;
  } else if (screen.name === 'onboarding') {
    content = (
      <OnboardingScreen
        onLanguage={(language) => setPreferences({ ...data.preferences, language })}
        onDone={() => {
          setPreferences({ ...data.preferences, language: lang, onboarded: true });
          setScreen({ name: 'setup', then: null });
        }}
      />
    );
  } else if (screen.name === 'setup') {
    const pending = screen.then;
    content = (
      <SetupScreen
        strength={pending?.wake.strength ?? data.preferences.strength}
        continueLabel={pending ? tr('place.start') : tr('common.continue')}
        onContinue={() => (pending ? void launch(pending) : setScreen({ name: 'home' }))}
        onBack={() => setScreen({ name: 'home' })}
      />
    );
  } else if (screen.name === 'settings') {
    content = (
      <SettingsScreen
        preferences={data.preferences}
        onChange={setPreferences}
        onOpenSetup={() => setScreen({ name: 'setup', then: null })}
        onBack={() => setScreen({ name: 'home' })}
      />
    );
  } else if (screen.name === 'done') {
    const place = screen.place;
    content = (
      <DoneScreen
        ended={screen.ended}
        place={place}
        isFavourite={!!place && data.favourites.some((f) => samePlace(f, place))}
        onSaveFavourite={() => place && update(toggleFavourite(data, place))}
        onDone={() => setScreen({ name: 'home' })}
      />
    );
  } else {
    content = (
      <HomeScreen
        data={data}
        notice={stoppedNotice ? tr('home.stoppedNotice') : null}
        starting={starting}
        onDismissNotice={() => setStoppedNotice(false)}
        onToggleFavourite={(place) => update(toggleFavourite(data, place))}
        onStart={(place, wake) => start({ place, wake })}
        onDemo={(place, wake, from) => start({ place, wake, demo: { from } })}
        onOpenSettings={() => setScreen({ name: 'settings' })}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <I18nProvider value={i18n}>
        <View style={[styles.root, { backgroundColor: t.background }]}>{content}</View>
        <StatusBar style={t.dark ? 'light' : 'dark'} />
      </I18nProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
