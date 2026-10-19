import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { getLocales } from 'expo-localization';
import { useNetworkState } from 'expo-network';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Keyboard,
  Linking,
  StyleSheet,
  View,
  type TextInput,
} from 'react-native';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdBanner, useBannersOn } from '../../ads';
import { useRemoteConfig, useAnnouncement, dismissAnnouncement } from '../../api/config';
import { appVersion } from '../../api/index';
import { useI18n } from '../../i18n';
import { formatDistance } from '../../lib/format';
import { reversePlace, type Place } from '../../lib/geocode';
import { usePro } from '../../lib/pro';
import { updateRequired } from '../../lib/remoteConfig';
import { stopSources } from '../../lib/stations/packs';
import { distanceKm, nearestStopAll, searchAllStops, type Stop } from '../../lib/stations/search';
import { stopToPlace } from '../../lib/stations/toPlace';
import { defaultWake, type WakeOptions } from '../../lib/wake';
import { ZOOM_HINT_FROM, ALL_STOPS_ZOOM, initialViewFor, type InitialView, type LatLon } from '../../map/geo';
import { HomeMap, type HomeMapHandle, type MapPin, type ViewChange } from '../../map/HomeMap';
import { useMapStyle } from '../../map/useMapStyle';
import { currentRouteName, navigationRef } from '../../navigation/ref';
import { useHideTabBar, useTabBarHidden } from '../../navigation/tabBar';
import type { TabScreenProps } from '../../navigation/types';
import { useSavedData } from '../../state/saved';
import { useTrip } from '../../state/trip';
import {
  AppText,
  MapControl,
  MapSheet,
  SearchField,
  useSheetGeometry,
  useTheme,
  useToast,
  haptics,
  type LocateState,
  type SheetSnap,
} from '../../ui';
import { rememberTripPlace, startTripRecorder } from '../trip/tripRecorder';
import { BrowseContent } from './BrowseContent';
import { MapBanner } from './MapBanner';
import {
  BROWSE,
  droppedPin,
  isDroppedPin,
  modesReducer,
  nbsp,
  parsePlaceLink,
  pickBanner,
  topMode,
  updateTopPlace,
  withAlpha,
  type ModeAction,
  type ModeStack,
} from './mapLogic';
import { CreditsControl, PinCrosshair, PinSheetContent, PinSheetFooter, PinSheetHeader } from './MapPieces';
import { SearchContent } from './SearchContent';
import { StopContent, StopFooter, StopHeader, type PinStatus } from './StopSheet';
import { countSession, dismiss, isDismissed } from './uiMemory';
import { useMapStops, useNearbyStops, useSuggestedPack } from './useMapData';
import { useUserLocation } from './useUserLocation';

/** From this zoom on, the map shows a place the user looks at: offer that country's stops. */
const LOOKING_ZOOM = 9;
/** A long-press snaps to a stop this close. */
const SNAP_M = 60;
/** While these are on top, the map is unmounted (at most one live map; critiques: performance). */
const COVERING = new Set(['Trip', 'Arrived', 'TripDetail']);

type Action = ModeAction | { type: 'update'; id: string; place: Place };

function reducer(stack: ModeStack, action: Action): ModeStack {
  return action.type === 'update' ? updateTopPlace(stack, action.id, action.place) : modesReducer(stack, action);
}

// Kept while the map is unmounted (Trip on top), so it comes back where it was.
let lastCamera: { center: [number, number]; zoom: number } | null = null;

/** The route on top of everything (Trip, Arrived, a tab), kept current. */
function useTopRouteName(): string | undefined {
  const [name, setName] = useState(currentRouteName);
  useEffect(() => navigationRef.addListener('state', () => setName(currentRouteName())), []);
  return name;
}

/**
 * Closes the keyboard before going on. If the focused field simply disappears, Android may keep
 * the keyboard up over the stop sheet, so wait until it has gone (or half a second at most).
 */
function afterKeyboard(then: () => void) {
  if (!Keyboard.isVisible()) {
    then();
    return;
  }
  let done = false;
  const timer = setTimeout(finish, 500);
  const sub = Keyboard.addListener('keyboardDidHide', finish);
  function finish() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    sub.remove();
    then();
  }
  Keyboard.dismiss();
}

/**
 * Map home (MapTab root, ui-direction-a 4.3 with the critiques): the calm map with every stop, one
 * banner at a time, the locate and credits controls riding on the sheet, and the MapSheet with its
 * modes: browse (favourites, recents, nearby), search (stops offline, addresses online), pin
 * (drop a pin without long-press) and stop (when to wake, Start alarm). Android back pops one mode,
 * then collapses an expanded sheet.
 */
export function MapHomeScreen({ navigation, route }: TabScreenProps<'MapTab'>) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();
  const saved = useSavedData();
  const trip = useTrip();
  const toast = useToast();
  const { isPro } = usePro();
  const config = useRemoteConfig();
  const announcement = useAnnouncement();
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const focused = useIsFocused();
  const topRoute = useTopRouteName();
  const tabBarHeight = useBottomTabBarHeight();
  const tabBarHidden = useTabBarHidden();
  const { noCopy } = useMapStyle();
  const prefs = saved.data.preferences;
  const useMiles = prefs.useMiles;

  const [stack, dispatch] = useReducer(reducer, BROWSE);
  const mode = topMode(stack);
  const stop = mode.type === 'stop' ? mode : null;
  useHideTabBar(mode.type !== 'browse');

  const location = useUserLocation(focused);
  const position = location.position;
  const nearby = useNearbyStops(position);
  const [view, setView] = useState<ViewChange | null>(null);
  const stops = useMapStops(view);

  // Browse starts at half once your position is known, otherwise at peek; any choice sticks.
  const [snapChoice, setSnap] = useState<SheetSnap | null>(null);
  const snap: SheetSnap = snapChoice ?? (position ? 'half' : 'peek');
  const browseSnap = useRef<SheetSnap | null>(null);
  const [query, setQuery] = useState('');
  const [wake, setWake] = useState<WakeOptions>(() => defaultWake('place', prefs));
  const [pinStatus, setPinStatus] = useState<PinStatus | null>(null);
  const [fitHeight, setFitHeight] = useState(0);
  const [pinAddress, setPinAddress] = useState<string | null>(null);
  const [locatingHere, setLocatingHere] = useState(false);
  const [hereFailed, setHereFailed] = useState(false);
  const [usingSpot, setUsingSpot] = useState(false);
  const [centred, setCentred] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [dismissedPacks, setDismissedPacks] = useState<string[]>([]);
  const [sessions] = useState(countSession);
  const [region] = useState(() => {
    try {
      return getLocales()[0]?.regionCode ?? null;
    } catch {
      return null;
    }
  });

  const map = useRef<HomeMapHandle>(null);
  const searchInput = useRef<TextInput>(null);
  const stopHeader = useRef<View>(null);
  const focusSearch = useRef(false);
  const flyOnHeight = useRef<string | null>(null);
  const movedByUser = useRef(false);
  const flownToUser = useRef(false);
  const [snapY] = useState(() => new Animated.Value(0));
  const [fitY] = useState(() => new Animated.Value(0));

  useEffect(() => startTripRecorder(), []);

  // ---- Geometry: the sheet reaches the screen bottom behind the tab bar ----
  // Browse mode only: the anchored banner sits on the tab bar and the sheet rests on the banner.
  const bannersOn = useBannersOn();
  const [adHeight, setAdHeight] = useState(0);
  const browseAd = bannersOn && mode.type === 'browse' && !tabBarHidden ? adHeight : 0;
  const bottomOffset = tabBarHidden || mode.type !== 'browse' ? insets.bottom : tabBarHeight + browseAd;
  const geometry = useSheetGeometry(bottomOffset);
  const snapMode = mode.type === 'browse' || mode.type === 'search';
  const visibleSheet = snapMode ? geometry.heights[snap] + bottomOffset : fitHeight;

  const [firstView] = useState<InitialView>(() =>
    position ? { center: [position.longitude, position.latitude], zoom: 14 } : initialViewFor(region),
  );
  // Read when the map mounts (again after Trip closes): where the camera last was.
  const initialView: InitialView = lastCamera ?? firstView;

  // ---- Where you are ----
  useEffect(() => {
    if (!position || flownToUser.current || movedByUser.current || lastCamera) return;
    flownToUser.current = true;
    map.current?.flyTo(position, { zoom: 14, padding: { bottom: geometry.heights.half + bottomOffset } });
  }, [position, geometry.heights.half, bottomOffset]);

  const distanceTo = useCallback(
    (place: { latitude: number; longitude: number }) =>
      position ? nbsp(formatDistance(distanceKm(position, place) * 1000, useMiles, lang)) : null,
    [position, useMiles, lang],
  );

  // ---- Modes ----
  const openStop = useCallback(
    (place: Place, options: { leave?: boolean } = {}) => {
      let next = defaultWake(place.kind ?? 'place', saved.data.preferences);
      if (options.leave) next = { ...next, mode: 'leave', wakeBy: 'distance' };
      setWake(next);
      setPinStatus(isDroppedPin(place) ? 'pending' : null);
      setFitHeight(0);
      flyOnHeight.current = place.id;
      afterKeyboard(() => dispatch({ type: 'stop', place, leave: options.leave }));
    },
    [saved.data.preferences],
  );

  /** A long-press or "Use this spot": the stop within 60 m, otherwise a dropped pin with its address. */
  const placeAt = useCallback(
    async (point: LatLon) => {
      movedByUser.current = true;
      const near: Stop | null = await stopSources()
        .then((sources) => nearestStopAll(sources, point, SNAP_M))
        .catch(() => null);
      if (near) {
        openStop(stopToPlace(near));
        return;
      }
      const pin = droppedPin(point.latitude, point.longitude, tr('place.droppedPin'));
      openStop(pin);
      if (!online) {
        setPinStatus('failed');
        return;
      }
      try {
        const address = await reversePlace(point.latitude, point.longitude, { language: lang });
        if (address) {
          dispatch({ type: 'update', id: pin.id, place: { ...address, id: pin.id, latitude: pin.latitude, longitude: pin.longitude } });
          setPinStatus('resolved');
        } else {
          setPinStatus('failed');
        }
      } catch {
        // Offline: the dropped pin keeps its coordinates.
        setPinStatus('failed');
      }
    },
    [openStop, online, lang, tr],
  );

  const back = useCallback(() => {
    const leavingSearch = topMode(stack).type === 'search';
    afterKeyboard(() => {
      // Back in browse, the sheet returns to where it was before search.
      if (leavingSearch) setSnap(browseSnap.current);
      dispatch({ type: 'back' });
    });
  }, [stack]);

  function openSearch() {
    browseSnap.current = snap;
    focusSearch.current = true;
    setSnap('expanded');
    dispatch({ type: 'search' });
    // A fallback when the sheet was already where it needed to be (no settle to wait for).
    setTimeout(() => {
      if (focusSearch.current) {
        focusSearch.current = false;
        searchInput.current?.focus();
      }
    }, 400);
  }

  // ---- "Show on map" (stopwake://stop/{id}) ----
  const linkId = route.params?.stopId;
  useEffect(() => {
    if (!linkId) return;
    let cancelled = false;
    (async () => {
      const id = decodeURIComponent(linkId);
      const known = [...saved.data.favourites, ...saved.data.recents].find((p) => p.id === id);
      let place: Place | null = known ?? null;
      const link = place ? null : parsePlaceLink(id);
      if (link?.kind === 'point') place = droppedPin(link.latitude, link.longitude, tr('place.droppedPin'));
      if (link?.kind === 'stop') {
        const found = await searchAllStops(await stopSources(), link.name, position ?? undefined, 25).catch(() => []);
        const match = found.find((s) => s.name === link.name) ?? found.find((s) => s.title === link.name);
        place = match ? stopToPlace(match) : null;
      }
      if (cancelled) return;
      navigation.setParams({ stopId: undefined });
      if (place) {
        movedByUser.current = true;
        openStop(place);
      } else {
        toast.show({ id: 'stop-not-found', message: tr('map.stop.notFound'), icon: 'map-marker-off-outline' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only when a new link arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId]);

  // ---- Android back: one mode at a time, then an expanded sheet back to half ----
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (topMode(stack).type !== 'browse') {
          back();
          return true;
        }
        if (snap === 'expanded') {
          setSnap('half');
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [stack, snap, back]),
  );

  // A trip started for the open stop (also after Setup): back to browse.
  const runningLabel = trip.status?.trip?.label ?? null;
  const runningId = trip.status?.trip?.id ?? null;
  useFocusEffect(
    useCallback(() => {
      if (stop && runningId && runningLabel === stop.place.name) {
        setSnap(browseSnap.current);
        dispatch({ type: 'reset' });
      }
    }, [stop, runningId, runningLabel]),
  );

  // ---- Locate ----
  const locateState: LocateState = location.locating
    ? 'locating'
    : location.permission === 'blocked'
      ? 'denied'
      : position && centred
        ? 'located'
        : 'unknown';

  const recentre = useCallback(
    async (zoom = 15) => {
      if (location.permission === 'blocked') {
        haptics.warning();
        navigation.navigate('Setup', { entry: 'settings' });
        return;
      }
      movedByUser.current = true;
      const here = (await location.locate()) ?? position;
      if (!here) {
        if (location.permission !== 'granted') haptics.warning();
        return;
      }
      map.current?.flyTo(here, { zoom, padding: { bottom: visibleSheet } });
      setCentred(true);
    },
    [location, position, navigation, visibleSheet],
  );

  // Re-tapping the Map tab recentres on you and collapses the sheet (3.25).
  useEffect(
    () =>
      navigation.addListener('tabPress', () => {
        if (!navigation.isFocused()) return;
        if (topMode(stack).type === 'browse') {
          setSnap('peek');
          browseSnap.current = 'peek';
        }
        void recentre();
      }),
    [navigation, stack, recentre],
  );

  // ---- Map events ----
  function onViewChange(next: ViewChange) {
    setView(next);
    lastCamera = { center: [next.center.longitude, next.center.latitude], zoom: next.zoom };
    if (next.byUser) {
      movedByUser.current = true;
      setCentred(false);
    }
  }

  // Pin mode: the address under the crosshair, a moment after the map stops.
  const crosshairY = (insets.top + (frame.height - (mode.type === 'pin' && fitHeight ? fitHeight : frame.height * 0.3))) / 2;
  useEffect(() => {
    if (mode.type !== 'pin' || !view) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const point = await map.current?.unproject(frame.width / 2, crosshairY);
      if (!point || cancelled) return;
      const coords = `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;
      if (!online) {
        setPinAddress(coords);
        return;
      }
      const address = await reversePlace(point.latitude, point.longitude, { language: lang }).catch(() => null);
      if (!cancelled) setPinAddress(address ? [address.name, address.context].filter(Boolean).join(', ') : coords);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode.type, view, frame.width, crosshairY, online, lang]);

  async function pickSpot() {
    setUsingSpot(true);
    try {
      const point = await map.current?.unproject(frame.width / 2, crosshairY);
      if (point) await placeAt(point);
    } finally {
      setUsingSpot(false);
    }
  }

  async function leaveHere() {
    setHereFailed(false);
    setLocatingHere(true);
    const here = await location.locate();
    setLocatingHere(false);
    if (!here) {
      setHereFailed(true);
      haptics.warning();
      return;
    }
    openStop(
      {
        id: `here:${here.latitude.toFixed(5)},${here.longitude.toFixed(5)}`,
        name: tr('place.here'),
        context: `${here.latitude.toFixed(5)}, ${here.longitude.toFixed(5)}`,
        latitude: here.latitude,
        longitude: here.longitude,
      },
      { leave: true },
    );
  }

  // ---- Stop mode actions ----
  function toggleFavourite(place: Place) {
    const result = saved.toggleFavourite(place);
    if (result === 'needsPro') {
      navigation.navigate('Paywall', { reason: 'favourites' });
      return;
    }
    haptics.selection();
    toast.show({ id: 'favourite', message: tr(result === 'added' ? 'map.stop.saved' : 'map.stop.removed'), icon: result === 'added' ? 'star' : 'star-outline' });
  }

  async function start(place: Place, demo: boolean) {
    rememberTripPlace(place);
    await trip.start({ place, wake, demo: demo ? { from: position } : undefined });
  }

  function clearRecents() {
    const before = saved.data.recents;
    saved.update((d) => ({ ...d, recents: [] }));
    toast.show({
      id: 'recents-cleared',
      message: tr('map.search.recentsCleared'),
      action: { label: tr('map.search.undo'), onPress: () => saved.update((d) => ({ ...d, recents: before })) },
    });
  }

  function onStopHeight(height: number) {
    setFitHeight(height);
    if (stop && flyOnHeight.current === stop.place.id) {
      flyOnHeight.current = null;
      map.current?.flyTo(stop.place, { minZoom: 15, padding: { top: insets.top + 64, bottom: height + 24 } });
      const node = stopHeader.current;
      if (node) AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
    }
  }

  // ---- Banners (browse only, one at a time) ----
  const lookingAt = view && view.zoom >= LOOKING_ZOOM ? view.center : position;
  const suggested = useSuggestedPack(lookingAt, online, dismissedPacks);
  const packShown = suggested && !isDismissed(`pack:${suggested.id}`) ? suggested : null;
  const critical = announcement?.level === 'critical';
  const banner =
    mode.type === 'browse'
      ? pickBanner({
          stoppedByPhone: trip.stoppedNotice,
          updateRequired: updateRequired(config, appVersion()),
          criticalAnnouncement: !!announcement && critical,
          offline: !online,
          pack: !!packShown,
          announcement: !!announcement && !critical,
          zoomHint: !!view && view.zoom >= ZOOM_HINT_FROM && view.zoom < ALL_STOPS_ZOOM,
        })
      : null;

  // ---- The map's pin and zone: the open stop, or the minimised trip ----
  const running = trip.status?.trip ?? null;
  const pin: MapPin | null = useMemo(() => {
    if (stop) return { key: stop.place.id, latitude: stop.place.latitude, longitude: stop.place.longitude, kind: stop.place.kind ?? 'place' };
    if (running) return { key: `trip:${running.id}`, latitude: running.latitude, longitude: running.longitude, kind: trip.kind };
    return null;
  }, [stop, running, trip.kind]);
  const zone = useMemo(() => {
    if (stop) {
      return stop && (wake.mode === 'leave' || wake.wakeBy === 'distance')
        ? { latitude: stop.place.latitude, longitude: stop.place.longitude, radiusM: wake.radiusM }
        : null;
    }
    return running ? { latitude: running.latitude, longitude: running.longitude, radiusM: running.radiusM } : null;
  }, [stop, running, wake.mode, wake.wakeBy, wake.radiusM]);

  // ---- Controls ride on the sheet top and fade out between half and expanded ----
  const controlsY = snapMode ? snapY : fitY;
  const controlsBottom = snapMode ? geometry.layoutHeight + 12 : fitHeight + 12;
  const controlsOpacity = snapMode
    ? snapY.interpolate({
        inputRange: [geometry.translate.expanded, Math.max(geometry.translate.half, geometry.translate.expanded + 1)],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      })
    : 1;
  const controlsHidden = (snapMode && (snap === 'expanded' || mode.type === 'search')) || (!snapMode && fitHeight === 0);

  const mapMounted = !COVERING.has(topRoute ?? '');
  const nearbyRange = tr('map.nearby.within', { distance: nbsp(formatDistance(1500, useMiles, lang)) });

  return (
    <View style={[styles.root, { backgroundColor: t.map.placeholder }]} testID="map-home">
      {mapMounted ? (
        <HomeMap
          ref={map}
          stops={stops}
          pin={pin}
          hiddenStopId={stop?.place.isStop ? stop.place.id : null}
          zone={zone}
          showUser={location.permission === 'granted'}
          initialView={initialView}
          onPressStop={(s) => {
            movedByUser.current = true;
            openStop(stopToPlace(s));
          }}
          onPressMap={() => {
            if (mode.type === 'stop') back();
            else if (mode.type === 'search') Keyboard.dismiss();
          }}
          onLongPress={(point) => void placeAt(point)}
          onViewChange={onViewChange}
          onLoaded={() => setMapLoaded(true)}
        />
      ) : null}

      {noCopy && !mapLoaded ? (
        <View pointerEvents="none" style={[styles.firstOffline, { top: insets.top, bottom: visibleSheet }]}>
          <AppText variant="bodyM" color="textSecondary" align="center">
            {tr('map.firstOffline')}
          </AppText>
        </View>
      ) : null}

      {mode.type === 'pin' ? <PinCrosshair top={crosshairY} /> : null}

      {/* Status-bar scrim, so the clock stays readable over the map. */}
      <LinearGradient
        pointerEvents="none"
        colors={[withAlpha(t.color.bg, 0.85), withAlpha(t.color.bg, 0)]}
        style={[styles.scrim, { height: insets.top + 24 }]}
      />

      {banner ? (
        <View pointerEvents="box-none" style={[styles.banner, { top: insets.top + 8 }]}>
          <MapBanner
            kind={banner}
            pack={packShown}
            announcement={announcement}
            onFixBattery={() => {
              trip.dismissStoppedNotice();
              navigation.navigate('Setup', { entry: 'settings', focus: 'battery' });
            }}
            onDismissStopped={trip.dismissStoppedNotice}
            onUpdate={() => void Linking.openURL(config.app.updateUrl).catch(() => {})}
            onDismissPack={() => {
              if (!packShown) return;
              dismiss(`pack:${packShown.id}`);
              setDismissedPacks((cur) => [...cur, packShown.id]);
            }}
            onOpenAnnouncement={(url) => void Linking.openURL(url).catch(() => {})}
            onDismissAnnouncement={() => announcement && dismissAnnouncement(announcement.id)}
          />
        </View>
      ) : null}

      <Animated.View
        pointerEvents={controlsHidden ? 'none' : 'box-none'}
        importantForAccessibility={controlsHidden ? 'no-hide-descendants' : 'auto'}
        style={[styles.controls, { bottom: controlsBottom, opacity: controlsHidden ? 0 : controlsOpacity, transform: [{ translateY: controlsY }] }]}>
        <CreditsControl onPress={() => map.current?.showAttribution()} />
        <MapControl
          state={locateState}
          accessibilityLabel={tr(locateState === 'denied' ? 'map.control.locateDenied' : 'map.control.locate')}
          onPress={() => void recentre()}
          testID="map-locate"
        />
      </Animated.View>

      {snapMode ? (
        <MapSheet
          mode="snap"
          testID="map-sheet"
          snap={snap}
          onSnapChange={(next) => {
            setSnap(next);
            if (mode.type === 'browse') browseSnap.current = next;
            if (mode.type === 'search' && next !== 'expanded') Keyboard.dismiss();
          }}
          onSettle={() => {
            if (mode.type === 'search' && focusSearch.current) {
              focusSearch.current = false;
              searchInput.current?.focus();
            }
          }}
          bottomOffset={bottomOffset}
          position={snapY}
          header={
            <View style={styles.searchRow}>
              {mode.type === 'search' ? (
                <SearchField
                  variant="sheet"
                  active
                  inputRef={searchInput}
                  value={query}
                  onChangeText={setQuery}
                  onBack={back}
                  onSubmitEditing={() => Keyboard.dismiss()}
                  placeholder={tr('home.search')}
                  testID="sheet-search-input"
                />
              ) : (
                <SearchField variant="sheet" active={false} onActivate={openSearch} placeholder={tr('home.search')} testID="sheet-search" />
              )}
            </View>
          }>
          {mode.type === 'browse' ? (
            <BrowseContent
              favourites={saved.data.favourites}
              recents={saved.data.recents}
              permission={location.permission}
              nearby={nearby}
              distanceTo={distanceTo}
              nearbyRange={nearbyRange}
              showLongPressHint={sessions <= 3}
              onPick={(place) => {
                movedByUser.current = true;
                openStop(place);
              }}
              onAllowLocation={() => void recentre(14)}
              onOpenSetup={() => navigation.navigate('Setup', { entry: 'settings' })}
            />
          ) : (
            <SearchContent
              query={query}
              near={position}
              online={online}
              favourites={saved.data.favourites}
              recents={saved.data.recents}
              distanceTo={distanceTo}
              locating={locatingHere}
              locationFailed={hereFailed}
              onPick={(place) => {
                movedByUser.current = true;
                openStop(place);
              }}
              onLeaveHere={() => void leaveHere()}
              onDropPin={() => {
                setPinAddress(null);
                setFitHeight(0);
                afterKeyboard(() => dispatch({ type: 'pin' }));
              }}
              onClearRecents={clearRecents}
            />
          )}
        </MapSheet>
      ) : stop ? (
        <MapSheet
          key={`stop-${stop.place.id}`}
          mode="fit"
          testID="stop-sheet"
          onDismiss={back}
          onHeight={onStopHeight}
          position={fitY}
          header={
            <StopHeader
              place={stop.place}
              pinStatus={pinStatus}
              distance={distanceTo(stop.place)}
              isFavourite={saved.isFavourite(stop.place)}
              onToggleFavourite={() => toggleFavourite(stop.place)}
              onClose={back}
              focusRef={stopHeader}
            />
          }
          footer={<StopFooter onStart={() => void start(stop.place, false)} starting={trip.starting} switching={!!running} />}>
          <StopContent
            place={stop.place}
            wake={wake}
            onChange={setWake}
            useMiles={useMiles}
            isPro={isPro}
            onNeedPro={() => navigation.navigate('Paywall', { reason: 'heavy' })}
            onDemo={() => void start(stop.place, true)}
            starting={trip.starting}
          />
        </MapSheet>
      ) : (
        <MapSheet
          key="pin"
          mode="fit"
          testID="pin-sheet"
          onDismiss={back}
          onHeight={setFitHeight}
          position={fitY}
          header={<PinSheetHeader />}
          footer={<PinSheetFooter onUse={() => void pickSpot()} onCancel={back} busy={usingSpot} />}>
          <PinSheetContent address={pinAddress} />
        </MapSheet>
      )}

      {bannersOn ? (
        <View pointerEvents="box-none" style={[styles.ad, mode.type === 'browse' && !tabBarHidden ? null : styles.adHidden]}>
          <AdBanner placement="map" onHeight={setAdHeight} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  banner: { position: 'absolute', left: 16, right: 16 },
  controls: {
    position: 'absolute',
    // The credits pill draws 28 of its 48 dp target: its visible edge sits on the 16 dp gutter.
    left: 6,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  ad: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  adHidden: { display: 'none' },
  firstOffline: { position: 'absolute', left: 32, right: 32, justifyContent: 'center' },
  searchRow: { paddingHorizontal: 16, paddingBottom: 8 },
});
