import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { File, Paths } from 'expo-file-system';
import { useNetworkState } from 'expo-network';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '../i18n';
import { useTheme } from '../ui/theme';
import { MAP_STYLE } from './geo';
import { prepareMapCache } from './offline';
import { prepareStyle } from './style';

export type MapStyle = string | StyleSpecification;

const FETCH_TIMEOUT_MS = 6000;

type Loaded = {
  style: MapStyle;
  /** Neither a saved copy nor the network had the style: MapLibre tries the URL from its own cache. */
  noCopy: boolean;
};

// Loaded once per app run and shared by the home and trip maps.
let loading: Promise<Loaded> | null = null;
let loaded: Loaded | null = null;

function cacheFile() {
  return new File(Paths.cache, 'map-style-liberty.json');
}

function readCache(): StyleSpecification | null {
  try {
    const f = cacheFile();
    return f.exists ? (JSON.parse(f.textSync()) as StyleSpecification) : null;
  } catch {
    return null;
  }
}

async function fetchStyle(): Promise<StyleSpecification> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(MAP_STYLE, { signal: controller.signal });
    if (!response.ok) throw new Error(`Map style: HTTP ${response.status}`);
    const style = (await response.json()) as StyleSpecification;
    try {
      const f = cacheFile();
      if (!f.exists) f.create();
      f.write(JSON.stringify(style));
    } catch {
      // Without the cache the next start fetches the style again.
    }
    return style;
  } finally {
    clearTimeout(timer);
  }
}

function load(): Promise<Loaded> {
  if (!loading) {
    void prepareMapCache();
    const cached = readCache();
    const fresh = fetchStyle();
    // A cached style opens the map at once; the fresh copy is saved for the next start. Without
    // either, MapLibre loads the original style itself (from an offline area, if one was saved).
    loading = cached
      ? Promise.resolve({ style: cached, noCopy: false })
      : fresh.then(
          (style): Loaded => ({ style, noCopy: false }),
          (): Loaded => ({ style: MAP_STYLE, noCopy: true }),
        );
    fresh.catch(() => {});
    void loading.then((result) => {
      loaded = result;
    });
  }
  return loading;
}

/** Forgets a style that could not be fetched, so the next attempt asks the network again. */
function retryable(): boolean {
  if (!loaded?.noCopy) return false;
  loading = null;
  loaded = null;
  return true;
}

export type MapStyleResult = {
  /** The prepared style (or the style URL as a last resort); null while it loads. */
  style: MapStyle | null;
  /**
   * The first launch without internet: there is no copy of the map style yet. Show
   * `map.placeholder` with a note until the map has loaded (MapLibre may still find an offline area).
   */
  noCopy: boolean;
};

/**
 * The map style for the current colour scheme (the calm recolour, 2.1.1) with local place names
 * and country names in the app's language. It switches when the scheme or language changes, and
 * tries the network again when the phone comes back online after a first launch offline.
 */
export function useMapStyle(): MapStyleResult {
  const { lang } = useI18n();
  const { scheme } = useTheme();
  const network = useNetworkState();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const [result, setResult] = useState<Loaded | null>(loaded);
  const [attempt, setAttempt] = useState(0);
  // A style that could not be fetched is asked for again once, each time the phone comes online.
  const wasOnline = useRef(!loaded?.noCopy);

  useEffect(() => {
    const cameOnline = online && !wasOnline.current;
    wasOnline.current = online;
    if (cameOnline && retryable()) setAttempt((a) => a + 1);
  }, [online]);

  useEffect(() => {
    let cancelled = false;
    void load().then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const style = useMemo(
    () => (result && typeof result.style === 'object' ? prepareStyle(result.style, lang, scheme) : (result?.style ?? null)),
    [result, lang, scheme],
  );
  return { style, noCopy: result?.noCopy ?? false };
}
