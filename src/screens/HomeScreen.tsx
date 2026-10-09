import * as Location from 'expo-location';
import { useNetworkState } from 'expo-network';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../i18n';
import { reversePlace, type Place } from '../lib/geocode';
import type { Preferences, SavedData } from '../lib/prefs';
import { stopsDb } from '../lib/stations/db';
import { distanceKm, nearestStop, stopsInBounds, type Bounds, type LatLon, type Stop } from '../lib/stations/search';
import { stopToPlace } from '../lib/stations/toPlace';
import { samePlace } from '../lib/storage';
import { defaultWake, type WakeOptions } from '../lib/wake';
import { ALL_STOPS_ZOOM, stopQueryForZoom } from '../map/geo';
import { HomeMap, type HomeMapHandle } from '../map/HomeMap';
import { Body, Heading, Icon, IconButton, KindIcon, Row } from '../ui/components';
import { radius, useTheme } from '../ui/theme';
import { PlaceSheet } from './home/PlaceSheet';
import { SearchOverlay } from './home/SearchOverlay';

type Props = {
  data: SavedData;
  notice: string | null;
  starting: boolean;
  onDismissNotice: () => void;
  onToggleFavourite: (place: Place) => void;
  onStart: (place: Place, wake: WakeOptions) => void;
  /** Try the alarm with a simulated ride to the place, starting from where the user is. */
  onDemo: (place: Place, wake: WakeOptions, from: LatLon | null) => void;
  onOpenSettings: () => void;
};

export function HomeScreen({ data, notice, starting, onDismissNotice, onToggleFavourite, onStart, onDemo, onOpenSettings }: Props) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const map = useRef<HomeMapHandle>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [zoom, setZoom] = useState(0);
  const [selected, setSelected] = useState<Place | null>(null);
  const [wake, setWake] = useState<WakeOptions>(() => defaultWake('place', data.preferences));
  const [searchOpen, setSearchOpen] = useState(false);
  const [user, setUser] = useState<LatLon | null>(null);
  const [locationAllowed, setLocationAllowed] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const viewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewRequest = useRef(0);
  const movedByUser = useRef(false);

  // Start where the user is, if we already may know it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted || cancelled) return;
      setLocationAllowed(true);
      const pos = await Location.getLastKnownPositionAsync();
      if (!pos || cancelled) return;
      const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setUser(here);
      if (!movedByUser.current) map.current?.flyTo(here.latitude, here.longitude, 14);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const select = useCallback(
    (place: Place, prefs: Preferences, fly = true) => {
      setSelected(place);
      setWake(defaultWake(place.kind ?? 'place', prefs));
      if (fly) map.current?.flyTo(place.latitude, place.longitude, Math.max(zoom, 15));
    },
    [zoom],
  );

  function onViewChange(bounds: Bounds, newZoom: number) {
    setZoom(newZoom);
    if (viewTimer.current) clearTimeout(viewTimer.current);
    const request = ++viewRequest.current;
    viewTimer.current = setTimeout(async () => {
      const query = stopQueryForZoom(newZoom);
      if (!query) {
        setStops([]);
        return;
      }
      const db = await stopsDb();
      if (!db) return;
      const found = await stopsInBounds(db, bounds, query.limit, query.minRank);
      if (request === viewRequest.current) setStops(found);
    }, 200);
  }

  async function onLongPress(latitude: number, longitude: number) {
    movedByUser.current = true;
    const db = await stopsDb();
    const stop = db ? await nearestStop(db, { latitude, longitude }, 60) : null;
    if (stop) {
      select(stopToPlace(stop), data.preferences, false);
      return;
    }
    const pin: Place = {
      id: `pin:${latitude.toFixed(5)},${longitude.toFixed(5)}`,
      name: tr('place.droppedPin'),
      context: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
      latitude,
      longitude,
    };
    select(pin, data.preferences, false);
    try {
      const address = await reversePlace(latitude, longitude, { language: lang });
      if (address) setSelected((cur) => (cur?.id === pin.id ? { ...address, id: pin.id } : cur));
    } catch {
      // Offline: the dropped pin keeps its coordinates as the name.
    }
  }

  async function locateMe() {
    movedByUser.current = true;
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      setLocationAllowed(true);
      // High accuracy may use GPS: on a train there is often no Wi-Fi or cell position.
      const pos =
        (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
      const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setUser(here);
      map.current?.flyTo(here.latitude, here.longitude, 15);
    } catch {
      // No position yet: the button can be tapped again once the phone has one.
    }
  }

  const isFavourite = selected ? data.favourites.some((f) => samePlace(f, selected)) : false;
  const distanceM = selected && user ? distanceKm(user, selected) * 1000 : null;
  const bottomInset = selected ? sheetHeight : 150 + insets.bottom;

  return (
    <View style={styles.root}>
      <HomeMap
        ref={map}
        stops={stops}
        selected={selected}
        radiusM={selected && (wake.mode === 'leave' || wake.wakeBy === 'distance') ? wake.radiusM : null}
        showUser={locationAllowed}
        initialCenter={null}
        bottomInset={bottomInset}
        onPressStop={(stop) => {
          movedByUser.current = true;
          select(stopToPlace(stop), data.preferences);
        }}
        onPressMap={() => setSelected(null)}
        onLongPress={onLongPress}
        onViewChange={onViewChange}
      />

      <View style={[styles.top, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
        <View style={styles.searchRow}>
          <Pressable
            accessibilityRole="search"
            onPress={() => setSearchOpen(true)}
            style={[styles.searchPill, { backgroundColor: t.surface, shadowColor: t.shadow }]}>
            <View style={[styles.logo, { backgroundColor: t.primary }]}>
              <Icon name="alarm" size={18} color={t.onPrimary} />
            </View>
            <Text style={[styles.searchText, { color: t.muted }]} numberOfLines={1}>
              {tr('home.search')}
            </Text>
            <Icon name="magnify" size={22} color={t.muted} />
          </Pressable>
          <IconButton icon="cog-outline" label={tr('settings.title')} onPress={onOpenSettings} size={52} />
        </View>

        {data.favourites.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.favs}>
            {data.favourites.slice(0, 8).map((f) => (
              <Pressable
                key={f.id}
                onPress={() => {
                  movedByUser.current = true;
                  select(f, data.preferences);
                }}
                style={[styles.fav, { backgroundColor: t.surface, shadowColor: t.shadow }]}>
                <Icon name="star" size={16} color={t.accent} />
                <Text style={[styles.favText, { color: t.text }]} numberOfLines={1}>
                  {f.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {notice ? (
          <Pressable onPress={onDismissNotice} style={[styles.notice, { backgroundColor: t.surface, borderColor: t.warn }]}>
            <Icon name="alert-circle" size={20} color={t.warn} />
            <Text style={[styles.noticeText, { color: t.text }]}>{notice}</Text>
            <Icon name="close" size={18} color={t.muted} />
          </Pressable>
        ) : null}

        {offline ? (
          <View style={[styles.zoomHint, { backgroundColor: t.surface }]}>
            <Icon name="wifi-off" size={16} color={t.warn} />
            <Text style={[styles.zoomHintText, { color: t.text }]}>{tr('home.offline')}</Text>
          </View>
        ) : null}

        {!selected && zoom >= 8.5 && zoom < ALL_STOPS_ZOOM ? (
          <View style={[styles.zoomHint, { backgroundColor: t.surface }]}>
            <Icon name="magnify-plus-outline" size={16} color={t.muted} />
            <Text style={[styles.zoomHintText, { color: t.muted }]}>{tr('home.zoomIn')}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.locate, { bottom: bottomInset + 14 }]} pointerEvents="box-none">
        <IconButton icon="crosshairs-gps" label={tr('search.useLocation')} onPress={locateMe} tint={t.primary} size={52} />
      </View>

      {selected ? (
        <PlaceSheet
          place={selected}
          distanceM={distanceM}
          wake={wake}
          onChange={setWake}
          useMiles={data.preferences.useMiles}
          isFavourite={isFavourite}
          onToggleFavourite={() => onToggleFavourite(selected)}
          onClose={() => setSelected(null)}
          onStart={() => onStart(selected, wake)}
          onDemo={() => onDemo(selected, wake, user)}
          starting={starting}
          onLayoutHeight={setSheetHeight}
        />
      ) : (
        <View style={[styles.hint, { backgroundColor: t.surface, shadowColor: t.shadow, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.handle, { backgroundColor: t.border }]} />
          <Heading>{tr('home.hint.title')}</Heading>
          <Body muted>{tr('home.hint.body')}</Body>
          {data.recents.slice(0, 2).map((p) => (
            <Row
              key={p.id}
              leading={p.kind ? <KindIcon kind={p.kind} size={34} /> : <Icon name="history" size={24} color={t.muted} />}
              title={p.name}
              subtitle={p.context || undefined}
              onPress={() => {
                movedByUser.current = true;
                select(p, data.preferences);
              }}
            />
          ))}
        </View>
      )}

      {searchOpen ? (
        <SearchOverlay
          near={user}
          favourites={data.favourites}
          recents={data.recents}
          useMiles={data.preferences.useMiles}
          onClose={() => setSearchOpen(false)}
          onPick={(place) => {
            setSearchOpen(false);
            movedByUser.current = true;
            select(place, data.preferences);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 14, gap: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: radius.pill,
    paddingLeft: 8,
    paddingRight: 16,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  logo: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  searchText: { flex: 1, fontSize: 17, fontWeight: '500' },
  favs: { gap: 8, paddingRight: 14 },
  fav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 220,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  favText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'flex-start' },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 20 },
  zoomHint: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    opacity: 0.92,
  },
  zoomHintText: { fontSize: 13, fontWeight: '600' },
  locate: { position: 'absolute', right: 14 },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 8,
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 14,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 4 },
});
