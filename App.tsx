import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { TripAlarm, type TripEndedEvent, type TripStatus } from './modules/trip-alarm/src';
import type { Place } from './src/lib/geocode';
import { loadData, samePlace, saveData, toggleFavourite, withRecent, type SavedData } from './src/lib/storage';
import { DoneScreen } from './src/screens/DoneScreen';
import { HomeScreen, type TripRequest } from './src/screens/HomeScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { TrackingScreen } from './src/screens/TrackingScreen';
import { useTheme } from './src/ui/theme';

type Screen =
  | { name: 'home' }
  | { name: 'setup'; request: TripRequest | null }
  | { name: 'tracking' }
  | { name: 'done'; ended: TripEndedEvent; place: Place | null };

function isRunning(status: TripStatus | null): status is TripStatus {
  return !!status?.trip && status.state !== 'stopped';
}

export default function App() {
  const t = useTheme();
  const [data, setData] = useState<SavedData>(loadData);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [status, setStatus] = useState<TripStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const tripPlace = useRef<Place | null>(null);

  const update = useCallback((next: SavedData) => {
    setData(next);
    saveData(next);
  }, []);

  // Pick up a trip that is already running (the app was closed while the service tracked).
  const syncWithService = useCallback(() => {
    if (!TripAlarm) return;
    const active = TripAlarm.getActiveTrip();
    if (active?.state === 'stopped') {
      setNotice(
        'Your phone stopped the last trip before it finished. A battery saver usually does this: see "Check setup" for how to exempt StopWake.',
      );
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

  // Android back: go home from setup and done; never leave the tracking screen by accident.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen.name === 'setup' || screen.name === 'done') {
        setScreen({ name: 'home' });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen.name]);

  async function launch(request: TripRequest) {
    const native = TripAlarm;
    if (!native) return;
    const { place, preferences } = request;
    update(withRecent({ ...data, preferences }, place));
    tripPlace.current = place;
    try {
      const trip = await native.startTrip({
        latitude: place.latitude,
        longitude: place.longitude,
        radiusM: preferences.radiusM,
        mode: preferences.mode,
        minutesBefore: preferences.mode === 'arrive' ? preferences.minutesBefore : null,
        label: place.name,
        strength: preferences.strength,
        useMiles: preferences.useMiles,
      });
      setNotice(null);
      setStatus({ trip, state: 'tracking', health: 'waiting' });
      setScreen({ name: 'tracking' });
    } catch (e) {
      Alert.alert('Could not start the trip', e instanceof Error ? e.message : String(e));
    }
  }

  function start(request: TripRequest) {
    const setup = TripAlarm?.getSetupStatus();
    const ready = !!setup && setup.location === 'precise' && setup.locationServices && setup.notifications;
    if (ready) void launch(request);
    else setScreen({ name: 'setup', request });
  }

  let content;
  if (screen.name === 'tracking' && isRunning(status)) {
    content = <TrackingScreen status={status} />;
  } else if (screen.name === 'setup') {
    const request = screen.request;
    content = (
      <SetupScreen
        strength={request?.preferences.strength ?? data.preferences.strength}
        continueLabel={request ? 'Start trip' : 'Done'}
        onContinue={() => (request ? void launch(request) : setScreen({ name: 'home' }))}
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
        notice={notice}
        onToggleFavourite={(place) => update(toggleFavourite(data, place))}
        onStart={start}
        onOpenSetup={() => setScreen({ name: 'setup', request: null })}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.root, { backgroundColor: t.background }]}>
        {content}
      </SafeAreaView>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
