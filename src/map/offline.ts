import { OfflineManager, type OfflinePackStatus } from '@maplibre/maplibre-react-native';

import { MAP_STYLE } from './geo';

/** Map areas seen recently stay on the phone too: up to this much is kept automatically. */
const AMBIENT_CACHE_BYTES = 256 * 1024 * 1024;
/** Tiles above zoom 14 are drawn from the zoom 14 ones, so saving them would add nothing. */
const MIN_ZOOM = 8;
const MAX_ZOOM = 14;

export type OfflineArea = {
  id: string;
  name: string;
  radiusKm: number;
  percentage: number;
  sizeBytes: number;
  complete: boolean;
};

let cacheReady: Promise<void> | null = null;

/** Raises MapLibre's automatic tile cache once per app run. */
export function prepareMapCache(): Promise<void> {
  cacheReady ??= OfflineManager.setMaximumAmbientCacheSize(AMBIENT_CACHE_BYTES).catch(() => {});
  return cacheReady;
}

/** [west, south, east, north] of a square around a point. */
export function areaAround(latitude: number, longitude: number, radiusKm: number): [number, number, number, number] {
  const dLat = radiusKm / 110.54;
  const dLon = radiusKm / (111.32 * Math.cos((latitude * Math.PI) / 180));
  return [longitude - dLon, latitude - dLat, longitude + dLon, latitude + dLat];
}

function toArea(id: string, metadata: Record<string, unknown>, status: OfflinePackStatus | null): OfflineArea {
  return {
    id,
    name: typeof metadata.name === 'string' ? metadata.name : '',
    radiusKm: typeof metadata.radiusKm === 'number' ? metadata.radiusKm : 0,
    percentage: status?.percentage ?? 0,
    sizeBytes: status?.completedResourceSize ?? 0,
    complete: status?.state === 'complete' || (status?.percentage ?? 0) >= 100,
  };
}

export async function listAreas(): Promise<OfflineArea[]> {
  const packs = await OfflineManager.getPacks();
  return Promise.all(packs.map(async (p) => toArea(p.id, p.metadata, await p.status().catch(() => null))));
}

/** Saves the map around a point for use without internet; progress arrives through onProgress. */
export async function downloadArea(
  center: { latitude: number; longitude: number },
  radiusKm: number,
  name: string,
  onProgress: (area: OfflineArea) => void,
  onError: (message: string) => void,
): Promise<void> {
  await OfflineManager.createPack(
    {
      mapStyle: MAP_STYLE,
      bounds: areaAround(center.latitude, center.longitude, radiusKm),
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      metadata: { name, radiusKm, createdAt: Date.now() },
    },
    (pack, status) => onProgress(toArea(pack.id, pack.metadata, status)),
    (_pack, error) => onError(error.message),
  );
}

export function deleteArea(id: string): Promise<void> {
  return OfflineManager.deletePack(id);
}
