import { importDatabaseFromAssetAsync, openDatabaseAsync } from 'expo-sqlite';

import stopsAsset from '../../../assets/stations/germany-stops.db';
import type { StopsDb } from './search';

/** Change the name whenever the bundled file changes, so installed apps copy the new one. */
const DB_NAME = 'germany-stops-2025-03-v1.db';

let opening: Promise<StopsDb | null> | null = null;

async function open(): Promise<StopsDb> {
  await importDatabaseFromAssetAsync(DB_NAME, { assetId: stopsAsset });
  const db = await openDatabaseAsync(DB_NAME);
  return {
    all: <T,>(sql: string, params: (string | number)[]) => db.getAllAsync<T>(sql, params),
  };
}

/**
 * The offline stops database (copied out of the app on first use, which takes a moment).
 * Resolves to null if it cannot be opened; search then falls back to online results only.
 */
export function stopsDb(): Promise<StopsDb | null> {
  opening ??= open().catch(() => null);
  return opening;
}
