import { useEffect, useState } from 'react';

import { countryAt } from '../../lib/geocode';
import { BUILT_IN_PACK, packsFor, packsNear, type CountryPack } from '../../lib/stations/countries';
import { isInstalled, packsSupported, refreshAvailable, usePacks } from '../../lib/stations/packs';
import type { LatLon } from '../../lib/stations/search';

/** Country lookups are cached per cell of this many degrees (about 20 km). */
const CELL_DEG = 0.2;

/**
 * The country pack worth offering for a point (where the user is, or where the map looks):
 * one that is published but not downloaded yet. Asks the address service which country the
 * point is in, but only near a country we have a pack for, and once per area.
 */
export function useSuggestedPack(point: LatLon | null, online: boolean, dismissed: readonly string[]): CountryPack | null {
  const packs = usePacks();
  const [countries, setCountries] = useState<Record<string, string | null>>({});
  const lat = point ? Math.round(point.latitude / CELL_DEG) * CELL_DEG : null;
  const lon = point ? Math.round(point.longitude / CELL_DEG) * CELL_DEG : null;
  const cell = lat != null && lon != null ? `${lat.toFixed(1)},${lon.toFixed(1)}` : null;
  const candidates = lat != null && lon != null ? packsNear(lat, lon).filter((p) => p.id !== BUILT_IN_PACK && !isInstalled(p.id)) : [];
  const worthAsking = packsSupported && online && cell != null && candidates.length > 0 && !(cell in countries);

  useEffect(() => {
    if (!worthAsking || lat == null || lon == null || !cell) return;
    const controller = new AbortController();
    countryAt(lat, lon, controller.signal)
      .then((code) => setCountries((cur) => ({ ...cur, [cell]: code })))
      .catch(() => {});
    if (!packs.available) void refreshAvailable();
    return () => controller.abort();
  }, [worthAsking, lat, lon, cell, packs.available]);

  if (!cell || lat == null || lon == null) return null;
  const code = countries[cell];
  if (!code) return null;
  return (
    packsFor(code, lat, lon).find(
      (p) => p.id !== BUILT_IN_PACK && !isInstalled(p.id) && !dismissed.includes(p.id) && packs.available?.some((a) => a.id === p.id),
    ) ?? null
  );
}
