/**
 * The account sync of favourites, recents and trip history (offline-first, last write wins; the
 * rules are in src/lib/cloudSync.ts). The phone stays the source of what the app shows: a round
 * pulls rows newer than the last pull, merges them in, and pushes what the server lacks
 * (public.sync_push). Rounds run after sign-in (which merges the phone's data into the account),
 * on foreground, when the network returns, and a few seconds after a local change. Failures are
 * silent: the next round catches up. Signed out, nothing leaves the phone.
 */
import { File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

import {
  applyRemote,
  diffLocal,
  enforceRecency,
  markPushed,
  nextCursor,
  orderMerged,
  pending,
  pullSince,
  rowToItem,
  type Ledger,
  type RemoteRow,
  type SyncItem,
} from '../lib/cloudSync';
import type { Place } from '../lib/geocode';
import { getHistory, loadHistory, onHistoryChange, replaceTrips, type TripRecord } from '../lib/history';
import { getSession } from './secure';
import { getSupabase } from './supabase/client';

type Table = 'favourites' | 'recents' | 'trip_history';
const MAX_RECENTS = 8;
const PUSH_BATCH = 200;
const PULL_PAGE = 500;
const DEBOUNCE_MS = 3_000;

type ListState = { ledger: Ledger; cursor: string | null };
type SyncFile = { v: 1; userId: string; lists: Record<Table, ListState> };

// ---- The saved data bridge (src/state/saved.tsx registers it) ----

type SavedBridge = {
  get: () => { favourites: Place[]; recents: Place[] };
  set: (next: { favourites: Place[]; recents: Place[] }) => void;
};
let saved: SavedBridge | null = null;

export function registerSavedData(bridge: SavedBridge): () => void {
  saved = bridge;
  return () => {
    if (saved === bridge) saved = null;
  };
}

/** The saved data changed on the phone: sync soon. */
export function notifySavedChanged() {
  schedule();
}

// ---- The ledger file ----

function file() {
  return new File(Paths.document, 'stopwake-sync.json');
}

function emptyLists(): Record<Table, ListState> {
  return { favourites: { ledger: {}, cursor: null }, recents: { ledger: {}, cursor: null }, trip_history: { ledger: {}, cursor: null } };
}

function readState(userId: string): SyncFile {
  try {
    const f = file();
    if (f.exists) {
      const parsed = JSON.parse(f.textSync()) as Partial<SyncFile>;
      if (parsed?.v === 1 && parsed.userId === userId && parsed.lists) return { v: 1, userId, lists: { ...emptyLists(), ...parsed.lists } };
    }
  } catch {
    // Start over: a fresh ledger only means everything is compared once more.
  }
  return { v: 1, userId, lists: emptyLists() };
}

function writeState(s: SyncFile) {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(s));
  } catch {
    // Next round rebuilds it.
  }
}

/** Forgets the ledger (sign-out, account deleted): the phone's data itself stays. */
export function resetSync() {
  try {
    const f = file();
    if (f.exists) f.delete();
  } catch {
    // Ignored: a ledger of another user is never used.
  }
}

// ---- One round ----

async function pull(table: Table, since: string | null): Promise<RemoteRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const rows: RemoteRow[] = [];
  for (let page = 0; page < 20; page++) {
    let q = sb.from(table).select('item_key,value,deleted,updated_at,synced_at').order('synced_at', { ascending: true });
    if (since) q = q.gt('synced_at', since);
    const { data, error } = await q.range(page * PULL_PAGE, page * PULL_PAGE + PULL_PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as RemoteRow[]));
    if (!data || data.length < PULL_PAGE) break;
  }
  return rows;
}

async function push(table: Table, items: SyncItem<unknown>[]): Promise<SyncItem<unknown>[]> {
  const sb = getSupabase();
  if (!sb || items.length === 0) return [];
  const done: SyncItem<unknown>[] = [];
  for (let i = 0; i < items.length; i += PUSH_BATCH) {
    const batch = items.slice(i, i + PUSH_BATCH);
    const { error } = await sb.rpc('sync_push', { p_table: table, p_items: batch });
    if (error) throw error;
    done.push(...batch);
  }
  return done;
}

/** One list: diff, pull, merge, push. Returns the merged map and the new list state. */
async function syncList<T>(table: Table, items: Map<string, T>, order: string[], s: ListState, now: number) {
  let ledger = diffLocal(s.ledger, items, now);
  if (table === 'recents') ledger = enforceRecency(ledger, order, now);
  const rows = await pull(table, pullSince(s.cursor));
  const remote = rows.map((r) => rowToItem<T>(r)).filter((r): r is SyncItem<T> => r !== null);
  const merged = applyRemote(items, ledger, remote);
  const pushed = await push(table, pending(merged.items, merged.ledger) as SyncItem<unknown>[]);
  return { merged, state: { ledger: markPushed(merged.ledger, pushed), cursor: nextCursor(s.cursor, rows) } };
}

let running: Promise<void> | null = null;
let again = false;

async function round() {
  const session = getSession();
  if (!session || session.kind !== 'account' || !getSupabase()) return;
  const userId = session.userId;
  const state = readState(userId);
  const now = Date.now();

  if (saved) {
    const local = saved.get();
    const favMap = new Map(local.favourites.map((p) => [p.id, p]));
    const recMap = new Map(local.recents.map((p) => [p.id, p]));
    const fav = await syncList('favourites', favMap, [...favMap.keys()], state.lists.favourites, now);
    const rec = await syncList('recents', recMap, [...recMap.keys()], state.lists.recents, now);
    if (getSession()?.userId !== userId) return;
    state.lists.favourites = fav.state;
    state.lists.recents = rec.state;
    if (fav.merged.changed || rec.merged.changed) {
      saved.set({
        favourites: orderMerged([...favMap.keys()], fav.merged.items, fav.state.ledger, false),
        recents: orderMerged([...recMap.keys()], rec.merged.items, rec.state.ledger, true).slice(0, MAX_RECENTS),
      });
    }
  }

  await loadHistory();
  const trips = new Map(getHistory().trips.map((t) => [t.id, t]));
  const tr = await syncList<TripRecord>('trip_history', trips, [...trips.keys()], state.lists.trip_history, now);
  if (getSession()?.userId !== userId) return;
  state.lists.trip_history = tr.state;
  if (tr.merged.changed) replaceTrips([...tr.merged.items.values()]);
  writeState(state);
}

/** Runs a round now (or right after the one in flight). Never throws. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await round();
      } while (again);
    } catch {
      // Offline or the server is down: the next trigger tries again.
    } finally {
      running = null;
    }
  })();
  return running;
}

let timer: ReturnType<typeof setTimeout> | null = null;

function schedule() {
  if (!getSession() || !getSupabase()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, DEBOUNCE_MS);
}

let started = false;

/** Starts the triggers once (startAccount() calls it). */
export function startSync() {
  if (started || !getSupabase()) return;
  started = true;
  onHistoryChange(schedule);
  AppState.addEventListener('change', (next) => {
    if (next === 'active') void syncNow();
  });
  try {
    Network.addNetworkStateListener((n) => {
      if (n.isConnected && n.isInternetReachable !== false) schedule();
    });
  } catch {
    // Foregrounds still sync.
  }
  void syncNow();
}
