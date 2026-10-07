import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { File, Paths } from 'expo-file-system';
import { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../i18n';
import { MAP_STYLE } from './geo';
import { prepareStyle } from './style';

type MapStyle = string | StyleSpecification;

const FETCH_TIMEOUT_MS = 6000;

// Loaded once per app run and shared by the home and trip maps.
let loading: Promise<MapStyle> | null = null;
let loaded: MapStyle | null = null;

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

function load(): Promise<MapStyle> {
  if (!loading) {
    const cached = readCache();
    const fresh = fetchStyle();
    // A cached style opens the map at once; the fresh copy is saved for the next start.
    // Without either, MapLibre loads the original style itself (English place names).
    loading = cached ? Promise.resolve(cached) : fresh.catch(() => MAP_STYLE);
    fresh.catch(() => {});
    void loading.then((style) => {
      loaded = style;
    });
  }
  return loading;
}

/**
 * The map style with local place names and country names in the app's language,
 * or null while it loads (usually a fraction of a second).
 */
export function useMapStyle(): MapStyle | null {
  const { lang } = useI18n();
  const [style, setStyle] = useState<MapStyle | null>(loaded);
  useEffect(() => {
    if (style) return;
    let cancelled = false;
    void load().then((s) => {
      if (!cancelled) setStyle(s);
    });
    return () => {
      cancelled = true;
    };
  }, [style]);
  return useMemo(() => (style && typeof style === 'object' ? prepareStyle(style, lang) : style), [style, lang]);
}
