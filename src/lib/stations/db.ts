import { Directory, File, Paths } from 'expo-file-system';
import { importDatabaseFromAssetAsync, openDatabaseAsync } from 'expo-sqlite';

import stopsAsset from '../../../assets/stations/germany-stops.db';
import type { StopsDb } from './search';

/** Change the name whenever the bundled file changes, so installed apps copy the new one. */
const DB_NAME = 'germany-stops-2025-03-v2.db';
const OLD_VERSIONS_PREFIX = 'germany-stops-';

let opening: Promise<StopsDb | null> | null = null;

/**
 * Copies the bundled database out of the app the first time (about a second). The copy gets a
 * temporary name until it is complete, so an app closed halfway never opens a broken file.
 */
async function install() {
  // expo-sqlite keeps its databases in files/SQLite.
  const dir = new Directory(Paths.document, 'SQLite');
  if (new File(dir, DB_NAME).exists) return;
  const partName = `${DB_NAME}.part`;
  const part = new File(dir, partName);
  if (part.exists) part.delete();
  await importDatabaseFromAssetAsync(partName, { assetId: stopsAsset });
  part.rename(DB_NAME);
  // Stops databases from older app versions are no longer needed.
  for (const entry of dir.list()) {
    if (entry instanceof File && entry.name.startsWith(OLD_VERSIONS_PREFIX) && !entry.name.startsWith(DB_NAME)) {
      entry.delete();
    }
  }
}

async function open(): Promise<StopsDb> {
  await install();
  const db = await openDatabaseAsync(DB_NAME);
  return {
    all: <T,>(sql: string, params: (string | number)[]) => db.getAllAsync<T>(sql, params),
  };
}

/**
 * The offline stops database. Resolves to null if it cannot be opened; search then falls back
 * to online results only.
 */
export function stopsDb(): Promise<StopsDb | null> {
  opening ??= open().catch(() => null);
  return opening;
}
