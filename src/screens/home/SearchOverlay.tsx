import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../../i18n';
import { formatDistance } from '../../lib/format';
import { searchPlaces, type Place } from '../../lib/geocode';
import { stopsDb } from '../../lib/stations/db';
import { distanceKm, searchStops, type LatLon } from '../../lib/stations/search';
import { stopToPlace } from '../../lib/stations/toPlace';
import { Body, Icon, IconButton, KindIcon, Label, ModeBadges, Row } from '../../ui/components';
import { radius, useTheme } from '../../ui/theme';

type Props = {
  near: LatLon | null;
  favourites: Place[];
  recents: Place[];
  useMiles: boolean;
  onPick: (place: Place) => void;
  onClose: () => void;
};

export function SearchOverlay({ near, favourites, recents, useMiles, onPick, onClose }: Props) {
  const t = useTheme();
  const { t: tr, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [stops, setStops] = useState<Place[]>([]);
  const [addresses, setAddresses] = useState<Place[]>([]);
  const [addressError, setAddressError] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const nearRef = useRef(near);
  useEffect(() => {
    nearRef.current = near;
  }, [near]);

  // Stations: offline and instant.
  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (q.length < 2) {
        if (!cancelled) setStops([]);
        return;
      }
      const db = await stopsDb();
      if (!db || cancelled) return;
      const found = await searchStops(db, q, nearRef.current ?? undefined, 12);
      if (!cancelled) setStops(found.map(stopToPlace));
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Addresses: online, a little later so typing stays smooth.
  useEffect(() => {
    const q = query.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (q.length < 3) {
        setAddresses([]);
        setAddressError(false);
        return;
      }
      setSearching(true);
      try {
        const found = await searchPlaces(q, { near: nearRef.current ?? undefined, language: lang, signal: controller.signal });
        setAddresses(found.filter((p) => !p.isStop).slice(0, 6));
        setAddressError(false);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setAddressError(true);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, lang]);

  // Android keeps the keyboard up after the search field goes away; it would cover the stop sheet.
  function pick(place: Place) {
    Keyboard.dismiss();
    onPick(place);
  }

  function close() {
    Keyboard.dismiss();
    onClose();
  }

  async function useMyLocation() {
    setLocating(true);
    setLocationError(false);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error('denied');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      pick({
        id: `here:${pos.timestamp}`,
        name: tr('place.here'),
        context: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
    } catch {
      setLocationError(true);
    } finally {
      setLocating(false);
    }
  }

  const away = (p: Place) =>
    near ? formatDistance(distanceKm(near, p) * 1000, useMiles, lang) : undefined;

  const placeRow = (p: Place, icon?: 'star' | 'history') => (
    <Row
      key={`${icon ?? 'r'}-${p.id}`}
      leading={
        p.kind ? (
          <KindIcon kind={p.kind} size={38} />
        ) : (
          <View style={[styles.plainIcon, { backgroundColor: t.surfaceAlt }]}>
            <Icon name={icon ?? 'map-marker'} size={20} color={icon === 'star' ? t.accent : t.muted} />
          </View>
        )
      }
      title={p.name}
      subtitle={
        <View style={styles.subtitle}>
          {p.context ? (
            <Text style={[styles.context, { color: t.muted }]} numberOfLines={1}>
              {p.context}
            </Text>
          ) : null}
          {p.modes ? <ModeBadges modes={p.modes} /> : null}
        </View>
      }
      right={away(p) ? <Text style={[styles.away, { color: t.muted }]}>{away(p)}</Text> : undefined}
      onPress={() => pick(p)}
    />
  );

  const q = query.trim();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: t.background, paddingTop: insets.top + 8 }]}>
      <View style={styles.bar}>
        <IconButton icon="arrow-left" label={tr('common.back')} onPress={close} size={44} />
        <View style={[styles.inputWrap, { backgroundColor: t.surface, borderColor: t.primary }]}>
          <Icon name="magnify" size={22} color={t.muted} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={tr('search.placeholder')}
            placeholderTextColor={t.muted}
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.input, { color: t.text }]}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel={tr('common.close')}>
              <Icon name="close-circle" size={20} color={t.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}>
        {q.length < 2 ? (
          <>
            <Row
              leading={
                <View style={[styles.plainIcon, { backgroundColor: t.primarySoft }]}>
                  {locating ? <ActivityIndicator color={t.primary} /> : <Icon name="crosshairs-gps" size={20} color={t.primary} />}
                </View>
              }
              title={locating ? tr('search.locating') : tr('search.useLocation')}
              onPress={useMyLocation}
            />
            {locationError ? <Body muted>{tr('search.locationFailed')}</Body> : null}
            {favourites.length ? <Label>{tr('home.favourites')}</Label> : null}
            {favourites.map((p) => placeRow(p, 'star'))}
            {recents.length ? <Label>{tr('home.recent')}</Label> : null}
            {recents.map((p) => placeRow(p, 'history'))}
            <Body muted>{tr('search.tip')}</Body>
          </>
        ) : (
          <>
            {stops.length ? <Label>{tr('search.stops')}</Label> : null}
            {stops.map((p) => placeRow(p))}
            {addresses.length || searching ? (
              <View style={styles.sectionHeader}>
                <Label>{tr('search.addresses')}</Label>
                {searching ? <ActivityIndicator size="small" color={t.muted} /> : null}
              </View>
            ) : null}
            {addresses.map((p) => placeRow(p))}
            {addressError ? <Body muted>{tr('search.offline')}</Body> : null}
            {!searching && !stops.length && !addresses.length && !addressError ? (
              <Body muted>{tr('search.noResults')}</Body>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 10 },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    minHeight: 50,
  },
  input: { flex: 1, fontSize: 17, paddingVertical: 8 },
  list: { paddingHorizontal: 16, gap: 6 },
  plainIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  subtitle: { gap: 4 },
  context: { fontSize: 14 },
  away: { fontSize: 13, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
});
