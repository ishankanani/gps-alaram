import { Directory, File, Paths } from 'expo-file-system';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';

import { TripAlarm } from '../../../modules/trip-alarm/src';
import { BUILT_IN_PACK, PACKS, packById } from './countries';
import { stopsDb } from './db';
import type { StopsDb, StopsSource } from './search';

/** Where the stop-packs workflow publishes the packs and packs.json. */
export const PACKS_URL = 'https://github.com/ishankanani/gps-alaram/releases/download/stop-packs/';

export type ManifestEntry = {
  id: string;
  file: string;
  /** Download size. */
  bytes: number;
  /** Size once installed. */
  dbBytes: number;
  count: number;
  builtAt: string;
};

export type InstalledPack = { id: string; file: string; builtAt: string; count: number; dbBytes: number };

export type PackJob = { phase: 'download' | 'install'; progress: number };

export type PacksState = {
  installed: InstalledPack[];
  /** What can be downloaded; null until known. */
  available: ManifestEntry[] | null;
  /** The list could not be loaded (offline); `available` may be an older copy. */
  availableError: boolean;
  jobs: Record<string, PackJob>;
  failed: Record<string, true>;
};

const MANIFEST_TIMEOUT_MS = 10_000;

/** Unpacking needs the native module, which only the Android app has so far. */
export const packsSupported = TripAlarm != null;

function sqliteDir() {
  return new Directory(Paths.document, 'SQLite');
}

function registryFile() {
  return new File(Paths.document, 'stop-packs.json');
}

function manifestCache() {
  return new File(Paths.cache, 'stop-packs-manifest.json');
}

function readJson<T>(file: File): T | null {
  try {
    return file.exists ? (JSON.parse(file.textSync()) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(file: File, value: unknown) {
  if (!file.exists) file.create();
  file.write(JSON.stringify(value));
}

let state: PacksState = {
  installed: (readJson<InstalledPack[]>(registryFile()) ?? []).filter((p) => packById(p.id) && new File(sqliteDir(), p.file).exists),
  available: readJson<{ packs: ManifestEntry[] }>(manifestCache())?.packs ?? null,
  availableError: false,
  jobs: {},
  failed: {},
};
const listeners = new Set<() => void>();

function setState(change: Partial<PacksState>) {
  state = { ...state, ...change };
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Installed and downloadable packs, and downloads in progress. */
export function usePacks(): PacksState {
  return useSyncExternalStore(subscribe, () => state);
}

export function isInstalled(id: string): boolean {
  return id === BUILT_IN_PACK || state.installed.some((p) => p.id === id);
}

/** A newer build of an installed pack is available. */
export function hasUpdate(id: string, s: PacksState = state): boolean {
  const installed = s.installed.find((p) => p.id === id);
  const latest = s.available?.find((p) => p.id === id);
  return !!installed && !!latest && latest.builtAt > installed.builtAt;
}

let manifestRequest: Promise<void> | null = null;

/** Loads the list of downloadable packs (again). */
export function refreshAvailable(): Promise<void> {
  manifestRequest ??= (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${PACKS_URL}packs.json`, { signal: controller.signal });
      if (!res.ok) throw new Error(`packs.json: HTTP ${res.status}`);
      const json = (await res.json()) as { packs?: ManifestEntry[] };
      const packs = (json.packs ?? []).filter((p) => packById(p.id));
      try {
        writeJson(manifestCache(), { packs });
      } catch {
        // Without the cache the list loads again next time.
      }
      setState({ available: packs, availableError: false });
    } catch {
      setState({ availableError: true });
    } finally {
      clearTimeout(timer);
      manifestRequest = null;
    }
  })();
  return manifestRequest;
}

// Open databases of installed packs, by file name.
const open = new Map<string, Promise<SQLiteDatabase>>();
let sources: Promise<StopsSource[]> | null = null;

function asStopsDb(db: SQLiteDatabase): StopsDb {
  return { all: <T,>(sql: string, params: (string | number)[]) => db.getAllAsync<T>(sql, params) };
}

function slotOf(id: string): number {
  return PACKS.findIndex((p) => p.id === id);
}

async function buildSources(): Promise<StopsSource[]> {
  const out: StopsSource[] = [];
  const germany = await stopsDb();
  const de = packById(BUILT_IN_PACK);
  if (germany && de) out.push({ slot: slotOf(BUILT_IN_PACK), db: germany, bounds: [...de.box] });
  for (const pack of state.installed) {
    const info = packById(pack.id);
    if (!info) continue;
    try {
      let db = open.get(pack.file);
      if (!db) {
        db = openDatabaseAsync(pack.file);
        open.set(pack.file, db);
      }
      out.push({ slot: slotOf(pack.id), db: asStopsDb(await db), bounds: [...info.box] });
    } catch {
      open.delete(pack.file);
    }
  }
  return out;
}

/** Every stops database on the device: Germany and the downloaded countries. */
export function stopSources(): Promise<StopsSource[]> {
  sources ??= buildSources();
  return sources;
}

function changed(installed: InstalledPack[]) {
  try {
    writeJson(registryFile(), installed);
  } catch {
    // The pack files are still there; the next install writes the list again.
  }
  sources = null;
  setState({ installed });
}

async function closeAndDelete(file: string) {
  const db = open.get(file);
  open.delete(file);
  if (db) await db.then((d) => d.closeAsync()).catch(() => {});
  const f = new File(sqliteDir(), file);
  if (f.exists) f.delete();
}

function setJob(id: string, job: PackJob | null) {
  const jobs = { ...state.jobs };
  if (job) jobs[id] = job;
  else delete jobs[id];
  setState({ jobs });
}

/** Downloads and installs a pack, or a newer build of an installed one. */
export async function installPack(id: string): Promise<void> {
  const native = TripAlarm;
  const entry = state.available?.find((p) => p.id === id);
  if (!native || !entry || state.jobs[id]) return;
  const failed = { ...state.failed };
  delete failed[id];
  setState({ failed });
  setJob(id, { phase: 'download', progress: 0 });

  const gz = new File(Paths.cache, entry.file);
  const dir = sqliteDir();
  const name = `pack-${id}-${entry.builtAt.replace(/\D/g, '').slice(0, 14)}.db`;
  const part = new File(dir, `${name}.part`);
  try {
    let shown = 0;
    await File.downloadFileAsync(`${PACKS_URL}${entry.file}`, gz, {
      idempotent: true,
      onProgress: ({ bytesWritten, totalBytes }) => {
        const total = totalBytes > 0 ? totalBytes : entry.bytes;
        const progress = Math.min(1, bytesWritten / total);
        // Re-render at most every 2 %.
        if (progress - shown >= 0.02) {
          shown = progress;
          setJob(id, { phase: 'download', progress });
        }
      },
    });
    setJob(id, { phase: 'install', progress: 1 });
    if (!dir.exists) dir.create({ intermediates: true });
    if (part.exists) part.delete();
    await native.gunzip(gz.uri, part.uri);
    gz.delete();

    // Check the file before using it: a broken download must not replace a working pack.
    const check = await openDatabaseAsync(part.name);
    try {
      const row = await check.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM stops');
      if (!row || row.n !== entry.count) throw new Error(`Pack ${id}: ${row?.n} stops, expected ${entry.count}`);
    } finally {
      await check.closeAsync();
    }
    const target = new File(dir, name);
    if (target.exists) await closeAndDelete(name);
    part.rename(name);

    const previous = state.installed.find((p) => p.id === id);
    const installed: InstalledPack = { id, file: name, builtAt: entry.builtAt, count: entry.count, dbBytes: entry.dbBytes };
    changed([...state.installed.filter((p) => p.id !== id), installed]);
    if (previous && previous.file !== name) await closeAndDelete(previous.file);
  } catch {
    setState({ failed: { ...state.failed, [id]: true } });
    // The pack may have been rebuilt since the list was loaded: the next try uses the new list.
    void refreshAvailable();
    for (const f of [gz, part]) {
      try {
        if (f.exists) f.delete();
      } catch {
        // Left for the next attempt, which overwrites it.
      }
    }
  } finally {
    setJob(id, null);
  }
}

export async function removePack(id: string): Promise<void> {
  const pack = state.installed.find((p) => p.id === id);
  if (!pack) return;
  changed(state.installed.filter((p) => p.id !== id));
  await closeAndDelete(pack.file);
}
