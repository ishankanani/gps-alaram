import { useEffect, useRef, useState } from 'react';

import { countryAt, searchPlaces, type Place } from '../../lib/geocode';
import { BUILT_IN_PACK, packsFor, packsNear, type CountryPack } from '../../lib/stations/countries';
import { isInstalled, packsSupported, refreshAvailable, stopSources, usePacks } from '../../lib/stations/packs';
import { nearestStopsAll, searchAllStops, stopsInBoundsAll, type Bounds, type Stop } from '../../lib/stations/search';
import { stopToPlace } from '../../lib/stations/toPlace';
import { stopQueryForZoom, type LatLon } from '../../map/geo';
import { movedEnough } from './mapLogic';

/** The stops drawn on the map for the visible area (200 ms after the camera stops). */
export function useMapStops(view: { bounds: Bounds; zoom: number } | null): Stop[] {
  const packs = usePacks();
  const [stops, setStops] = useState<Stop[]>([]);
  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const query = stopQueryForZoom(view.zoom);
      if (!query) {
        if (!cancelled) setStops([]);
        return;
      }
      try {
        const found = await stopsInBoundsAll(await stopSources(), view.bounds, query.limit, query.minRank);
        if (!cancelled) setStops(found);
      } catch {
        // The stops database is missing: the map simply shows no dots.
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // A country downloaded or removed shows (or hides) its stops at once.
  }, [view, packs.installed]);
  return stops;
}

export type Nearby = { stops: Stop[]; loading: boolean };

/** Up to 8 stops within 1.5 km, nearest first; looked up again after moving 75 m or a pack install. */
export function useNearbyStops(position: LatLon | null): Nearby {
  const packs = usePacks();
  const [state, setState] = useState<{ stops: Stop[]; for: LatLon | null; installed: unknown }>({ stops: [], for: null, installed: null });
  const due = position != null && (movedEnough(state.for, position) || state.installed !== packs.installed);

  useEffect(() => {
    if (!due || !position) return;
    let cancelled = false;
    (async () => {
      try {
        const stops = await nearestStopsAll(await stopSources(), position, 8, 1.5);
        if (!cancelled) setState({ stops, for: position, installed: packs.installed });
      } catch {
        if (!cancelled) setState({ stops: [], for: position, installed: packs.installed });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [due, position, packs.installed]);

  // A lookup is due until its answer arrives.
  return { stops: position ? state.stops : [], loading: due };
}

export type SearchResults = {
  stops: Place[];
  /** Two characters or more were searched (stops), at least once. */
  stopsDone: boolean;
  addresses: Place[];
  addressesLoading: boolean;
  /** The address search failed (offline). */
  addressesFailed: boolean;
};

/** Stops (offline, 120 ms after typing) and addresses (online, 400 ms, three characters or more). */
export function useSearch(query: string, near: LatLon | null, lang: string): SearchResults {
  const [stops, setStops] = useState<{ q: string; places: Place[] }>({ q: '', places: [] });
  const [addresses, setAddresses] = useState<{ q: string; places: Place[]; failed: boolean }>({ q: '', places: [], failed: false });
  const [addressesLoading, setAddressesLoading] = useState(false);
  const nearRef = useRef(near);
  useEffect(() => {
    nearRef.current = near;
  }, [near]);
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await searchAllStops(await stopSources(), q, nearRef.current ?? undefined, 12);
        if (!cancelled) setStops({ q, places: found.map(stopToPlace) });
      } catch {
        if (!cancelled) setStops({ q, places: [] });
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  useEffect(() => {
    if (q.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAddressesLoading(true);
      try {
        const found = await searchPlaces(q, { near: nearRef.current ?? undefined, language: lang, signal: controller.signal });
        setAddresses({ q, places: found.filter((p) => !p.isStop).slice(0, 6), failed: false });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setAddresses({ q, places: [], failed: true });
      } finally {
        if (!controller.signal.aborted) setAddressesLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, lang]);

  const current = (r: { q: string }) => q.length >= 2 && r.q === q;
  return {
    stops: current(stops) ? stops.places : [],
    stopsDone: current(stops),
    addresses: q.length >= 3 && addresses.q === q ? addresses.places : [],
    addressesLoading: q.length >= 3 && (addressesLoading || addresses.q !== q),
    addressesFailed: q.length >= 3 && addresses.q === q && addresses.failed,
  };
}

/** Country lookups are cached per cell of this many degrees (about 20 km). */
const CELL_DEG = 0.2;
const countriesByCell: Record<string, string | null> = {};

/**
 * The country pack worth offering for a point (where the user is, or where the map looks): one
 * that is published but not downloaded yet. Asks the address service which country the point is
 * in, but only near a country we have a pack for, and once per area.
 */
export function useSuggestedPack(point: LatLon | null, online: boolean, dismissed: readonly string[]): CountryPack | null {
  const packs = usePacks();
  const [, setTick] = useState(0);
  const lat = point ? Math.round(point.latitude / CELL_DEG) * CELL_DEG : null;
  const lon = point ? Math.round(point.longitude / CELL_DEG) * CELL_DEG : null;
  const cell = lat != null && lon != null ? `${lat.toFixed(1)},${lon.toFixed(1)}` : null;
  const candidates = lat != null && lon != null ? packsNear(lat, lon).filter((p) => p.id !== BUILT_IN_PACK && !isInstalled(p.id)) : [];
  const worthAsking = packsSupported && online && cell != null && candidates.length > 0 && !(cell in countriesByCell);

  useEffect(() => {
    if (!worthAsking || lat == null || lon == null || !cell) return;
    const controller = new AbortController();
    countryAt(lat, lon, controller.signal)
      .then((code) => {
        countriesByCell[cell] = code;
        setTick((n) => n + 1);
      })
      .catch(() => {});
    if (!packs.available) void refreshAvailable();
    return () => controller.abort();
  }, [worthAsking, lat, lon, cell, packs.available]);

  if (!cell || lat == null || lon == null) return null;
  const code = countriesByCell[cell];
  if (!code) return null;
  return (
    packsFor(code, lat, lon).find(
      (p) => p.id !== BUILT_IN_PACK && !isInstalled(p.id) && !dismissed.includes(p.id) && packs.available?.some((a) => a.id === p.id),
    ) ?? null
  );
}
