import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { LatLon } from '../../map/geo';

/** unknown: not asked yet; denied: may ask again; blocked: only the system settings can allow it. */
export type LocationPermission = 'checking' | 'unknown' | 'granted' | 'denied' | 'blocked';

// Kept across remounts (the map unmounts while Trip is open).
let lastKnown: LatLon | null = null;

function toPoint(pos: Location.LocationObject): LatLon {
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
}

function permissionOf(p: Location.LocationPermissionResponse): LocationPermission {
  if (p.granted) return 'granted';
  if (p.status === Location.PermissionStatus.UNDETERMINED) return 'unknown';
  return p.canAskAgain ? 'denied' : 'blocked';
}

export type UserLocation = {
  permission: LocationPermission;
  position: LatLon | null;
  /** A position is being looked up after the user asked. */
  locating: boolean;
  /**
   * Asks for permission when needed and finds the position (last known within 5 min, otherwise a
   * fresh high-accuracy fix: on a train there is often no Wi-Fi or cell position). Null on failure.
   */
  locate: () => Promise<LatLon | null>;
};

/**
 * The user's position for the Map home. Only while `active` (the Map tab focused and the app in
 * the foreground): Balanced accuracy, every 50 m (critiques: battery). The permission is read again
 * when the app comes back, since the user may have changed it in the system settings.
 */
export function useUserLocation(active: boolean): UserLocation {
  const [permission, setPermission] = useState<LocationPermission>('checking');
  const [position, setPosition] = useState<LatLon | null>(lastKnown);
  const [locating, setLocating] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');

  const update = useCallback((point: LatLon) => {
    lastKnown = point;
    setPosition(point);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      Location.getForegroundPermissionsAsync()
        .then((p) => {
          if (!cancelled) setPermission(permissionOf(p));
        })
        .catch(() => {
          if (!cancelled) setPermission('unknown');
        });
    void check();
    const sub = AppState.addEventListener('change', (s) => {
      setForeground(s === 'active');
      if (s === 'active') void check();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const watching = active && foreground && permission === 'granted';
  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (cancelled) return;
      if (last) update(toPoint(last));
      const watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 50 },
        (pos) => update(toPoint(pos)),
      ).catch(() => null);
      if (cancelled) watch?.remove();
      else sub = watch;
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [watching, update]);

  const locate = useCallback(async () => {
    setLocating(true);
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      setPermission(permissionOf(perm));
      if (!perm.granted) return null;
      const pos =
        (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
      const point = toPoint(pos);
      update(point);
      return point;
    } catch {
      return null;
    } finally {
      setLocating(false);
    }
  }, [update]);

  return { permission, position: permission === 'granted' ? position : null, locating, locate };
}
