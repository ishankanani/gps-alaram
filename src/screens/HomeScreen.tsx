import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { AlarmMode, AlarmStrength } from '../../modules/trip-alarm/src';
import { formatRadius } from '../lib/format';
import { searchPlaces, type Place } from '../lib/geocode';
import { samePlace, type Preferences, type SavedData } from '../lib/storage';
import { Body, Button, Card, Label, Segmented, Title } from '../ui/components';
import { useTheme } from '../ui/theme';

const RADII = [100, 200, 300, 500, 1000, 2000, 5000];
const MINUTES: (number | null)[] = [null, 5, 10, 15, 20];

export type TripRequest = { place: Place; preferences: Preferences };

type Props = {
  data: SavedData;
  notice: string | null;
  onToggleFavourite: (place: Place) => void;
  onStart: (request: TripRequest) => void;
  onOpenSetup: () => void;
};

export function HomeScreen({ data, notice, onToggleFavourite, onStart, onOpenSetup }: Props) {
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [prefs, setPrefs] = useState<Preferences>(data.preferences);
  const [locating, setLocating] = useState(false);
  const near = useRef<{ latitude: number; longitude: number } | undefined>(undefined);

  // Bias search towards where the user is, when we already may know it.
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => (p.granted ? Location.getLastKnownPositionAsync() : null))
      .then((pos) => {
        if (pos) near.current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      })
      .catch(() => {});
  }, []);

  function onQueryChange(text: string) {
    setQuery(text);
    if (text.trim().length < 3) {
      setResults([]);
      setSearchError(null);
    }
  }

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      searchPlaces(q, { near: near.current, signal: controller.signal })
        .then((found) => {
          setResults(found);
          setSearchError(found.length ? null : 'No places found. Try the station or street name.');
        })
        .catch((e: Error) => {
          if (e.name !== 'AbortError') setSearchError('Search needs an internet connection.');
        })
        .finally(() => setSearching(false));
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function useCurrentLocation() {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setSearchError('Allow location to use where you are now.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      choose({
        id: `here:${pos.timestamp}`,
        name: 'Here',
        context: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
    } catch {
      setSearchError('Could not get your location. Is location turned on?');
    } finally {
      setLocating(false);
    }
  }

  function choose(p: Place) {
    setPlace(p);
    setQuery('');
    setResults([]);
    // Pick sensible defaults: a stop wants a tighter circle than a town.
    if (p.isStop && prefs.radiusM > 1000) setPrefs({ ...prefs, radiusM: 500 });
  }

  const isFavourite = place ? data.favourites.some((f) => samePlace(f, place)) : false;
  const leave = prefs.mode === 'leave';

  return (
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Title>StopWake</Title>
        <Body muted>Never miss your stop.</Body>
      </View>

      {notice ? (
        <Card style={{ borderColor: t.warn }}>
          <Body>{notice}</Body>
        </Card>
      ) : null}

      {!place ? (
        <>
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Where are you going? Station, stop or address"
            placeholderTextColor={t.muted}
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.search, { backgroundColor: t.surface, borderColor: t.border, color: t.text }]}
          />
          {searching ? <ActivityIndicator color={t.accent} /> : null}
          {searchError ? <Body muted>{searchError}</Body> : null}

          {results.length > 0 ? (
            <Card>
              {results.map((p) => (
                <PlaceRow key={p.id} place={p} onPress={() => choose(p)} />
              ))}
            </Card>
          ) : null}

          <Button title={locating ? 'Finding you…' : 'Use where I am now'} kind="secondary" busy={locating} onPress={useCurrentLocation} />

          {data.favourites.length > 0 ? (
            <Card>
              <Label>Favourites</Label>
              {data.favourites.map((p) => (
                <PlaceRow key={p.id} place={p} star onPress={() => choose(p)} />
              ))}
            </Card>
          ) : null}

          {data.recents.length > 0 ? (
            <Card>
              <Label>Recent</Label>
              {data.recents.map((p) => (
                <PlaceRow key={p.id} place={p} onPress={() => choose(p)} />
              ))}
            </Card>
          ) : null}

          <Body muted>Tip: you can paste coordinates or a Google Maps link into the search box.</Body>
          <Button title="Check setup & test the alarm" kind="secondary" onPress={onOpenSetup} />
        </>
      ) : (
        <>
          <Card>
            <View style={styles.placeHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.placeName, { color: t.text }]} numberOfLines={2}>
                  {place.name}
                </Text>
                {place.context ? <Body muted>{place.context}</Body> : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isFavourite ? 'Remove from favourites' : 'Save to favourites'}
                onPress={() => onToggleFavourite(place)}
                hitSlop={12}>
                <Text style={[styles.star, { color: isFavourite ? t.warn : t.muted }]}>{isFavourite ? '★' : '☆'}</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => setPlace(null)} hitSlop={8}>
              <Text style={{ color: t.accent, fontWeight: '600' }}>Change destination</Text>
            </Pressable>
          </Card>

          <Card>
            <Label>Wake me when I</Label>
            <Segmented<AlarmMode>
              large
              value={prefs.mode}
              onChange={(mode) => setPrefs({ ...prefs, mode })}
              options={[
                { value: 'arrive', label: 'Arrive' },
                { value: 'leave', label: 'Leave' },
              ]}
            />
            <Body muted>
              {leave
                ? 'Rings when you go outside the circle around this place.'
                : 'Rings when you get inside the circle around this place.'}
            </Body>
          </Card>

          <Card>
            <Label>{leave ? 'Area around the place' : 'Ring within'}</Label>
            <View style={styles.chips}>
              {RADII.map((r) => (
                <Chip
                  key={r}
                  label={formatRadius(r, prefs.useMiles)}
                  selected={prefs.radiusM === r}
                  onPress={() => setPrefs({ ...prefs, radiusM: r })}
                />
              ))}
            </View>
            {!leave ? (
              <>
                <Label>Also ring before arrival</Label>
                <View style={styles.chips}>
                  {MINUTES.map((m) => (
                    <Chip
                      key={String(m)}
                      label={m == null ? 'Off' : `${m} min`}
                      selected={prefs.minutesBefore === m}
                      onPress={() => setPrefs({ ...prefs, minutesBefore: m })}
                    />
                  ))}
                </View>
              </>
            ) : null}
          </Card>

          <Card>
            <Label>Alarm</Label>
            <Segmented<AlarmStrength>
              value={prefs.strength}
              onChange={(strength) => setPrefs({ ...prefs, strength })}
              options={[
                { value: 'gentle', label: 'Gentle' },
                { value: 'normal', label: 'Normal' },
                { value: 'heavy', label: 'Heavy sleeper' },
              ]}
            />
            <Body muted>
              {prefs.strength === 'heavy'
                ? 'Full volume within seconds, strong vibration and a flashing light. Rings in silent mode.'
                : prefs.strength === 'gentle'
                  ? 'Starts quiet and builds up. Rings in silent mode.'
                  : 'Starts medium and builds up to loud. Rings in silent mode.'}
            </Body>
          </Card>

          <Button title="Start" onPress={() => onStart({ place, preferences: prefs })} />
        </>
      )}
    </ScrollView>
  );
}

function PlaceRow({ place, onPress, star }: { place: Place; onPress: () => void; star?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <Text style={[styles.rowIcon, { color: star ? t.warn : t.muted }]}>{star ? '★' : place.isStop ? '🚉' : '📍'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: t.text }]} numberOfLines={1}>
          {place.name}
        </Text>
        {place.context ? (
          <Text style={{ color: t.muted }} numberOfLines={1}>
            {place.context}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? t.accent : t.border, backgroundColor: selected ? t.accent : t.surface },
      ]}>
      <Text style={{ color: selected ? t.onAccent : t.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, paddingBottom: 40 },
  header: { paddingTop: 8, gap: 2 },
  search: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 17,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  rowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  placeHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  placeName: { fontSize: 22, fontWeight: '700' },
  star: { fontSize: 30 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
});
