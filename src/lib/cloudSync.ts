/**
 * Offline-first sync of favourites, recents and trip history with the account (pure: no React
 * Native, Vitest checks it; the engine is src/api/sync.ts).
 *
 * The phone keeps a small ledger per synced list: for every item key the time it last changed
 * (`u`, the last-write-wins clock), a hash of its value (`h`, to notice local edits), whether it is
 * a deletion (`d`, a tombstone) and whether the server has it (`p`). Each round:
 *   1. diffLocal: compare the list with the ledger; new or edited items get u = now, removed items
 *      become tombstones with u = now.
 *   2. applyRemote: rows pulled from Supabase replace the local item when their updatedAt is newer.
 *   3. pending: everything not yet pushed goes up; the server keeps the newer of the two as well.
 * Signing in with data on the phone is the same round with an empty ledger: every local item is
 * new, so it is pushed into the account, and the account's items come down (the merge).
 */

export type LedgerEntry = { u: number; h: string; d?: true; p?: true };
export type Ledger = Record<string, LedgerEntry>;

/** An item as it travels (sync_push input and pulled rows). */
export type SyncItem<T> = { key: string; value: T | null; deleted: boolean; updatedAt: number };

/** Tombstones the server has are forgotten after this long. */
export const TOMBSTONE_TTL_MS = 60 * 24 * 3_600_000;

/** A short, stable hash of a JSON value (FNV-1a over the canonical JSON). */
export function hashValue(value: unknown): string {
  const text = canonical(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + ':' + text.length.toString(36);
}

/** JSON with sorted object keys, so the same value always hashes the same. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).filter((k) => (value as Record<string, unknown>)[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

/** Step 1: the ledger after looking at the current list. Unchanged items keep their entry. */
export function diffLocal<T>(ledger: Ledger, items: ReadonlyMap<string, T>, now: number): Ledger {
  const next: Ledger = {};
  for (const [key, value] of items) {
    const h = hashValue(value);
    const old = ledger[key];
    if (old && !old.d && old.h === h) next[key] = old;
    else next[key] = { u: Math.max(now, old ? old.u + 1 : 0), h };
  }
  for (const [key, old] of Object.entries(ledger)) {
    if (items.has(key)) continue;
    if (old.d) {
      if (!(old.p && now - old.u > TOMBSTONE_TTL_MS)) next[key] = old;
    } else {
      next[key] = { u: Math.max(now, old.u + 1), h: '', d: true };
    }
  }
  return next;
}

/**
 * Step 2: applies pulled rows that are newer than the ledger. Returns the new list (as a map in
 * the old order, new keys appended) and ledger, and whether anything changed locally.
 */
export function applyRemote<T>(
  items: ReadonlyMap<string, T>,
  ledger: Ledger,
  remote: readonly SyncItem<T>[],
): { items: Map<string, T>; ledger: Ledger; changed: boolean } {
  const out = new Map(items);
  const next: Ledger = { ...ledger };
  let changed = false;
  for (const r of remote) {
    const mine = next[r.key];
    if (mine && mine.u > r.updatedAt) continue;
    if (mine && mine.u === r.updatedAt) {
      // Same clock: the server has this version (ours or an identical one).
      next[r.key] = { ...mine, p: true };
      continue;
    }
    if (r.deleted || r.value === null) {
      if (out.delete(r.key)) changed = true;
      next[r.key] = { u: r.updatedAt, h: '', d: true, p: true };
    } else {
      const h = hashValue(r.value);
      if (!out.has(r.key) || hashValue(out.get(r.key)) !== h) changed = true;
      out.set(r.key, r.value);
      next[r.key] = { u: r.updatedAt, h, p: true };
    }
  }
  return { items: out, ledger: next, changed };
}

/** Step 3: what to push (everything the server doesn't have yet). */
export function pending<T>(items: ReadonlyMap<string, T>, ledger: Ledger): SyncItem<T>[] {
  const out: SyncItem<T>[] = [];
  for (const [key, e] of Object.entries(ledger)) {
    if (e.p) continue;
    if (e.d) out.push({ key, value: null, deleted: true, updatedAt: e.u });
    else if (items.has(key)) out.push({ key, value: items.get(key) as T, deleted: false, updatedAt: e.u });
  }
  return out;
}

/** After a successful push: those entries are on the server (unless they changed meanwhile). */
export function markPushed(ledger: Ledger, pushed: readonly SyncItem<unknown>[]): Ledger {
  const next: Ledger = { ...ledger };
  for (const item of pushed) {
    const e = next[item.key];
    if (e && e.u === item.updatedAt) next[item.key] = { ...e, p: true };
  }
  return next;
}

/** Rows as PostgREST returns them from favourites / recents / trip_history. */
export type RemoteRow = { item_key: string; value: unknown; deleted: boolean; updated_at: string; synced_at: string };

export function rowToItem<T>(row: RemoteRow): SyncItem<T> | null {
  const updatedAt = Date.parse(row.updated_at);
  if (!row.item_key || !Number.isFinite(updatedAt)) return null;
  return { key: row.item_key, value: row.deleted ? null : (row.value as T), deleted: !!row.deleted, updatedAt };
}

/**
 * Orders a merged list: items whose ledger time is newer come first when `byRecency` (recents),
 * otherwise the old order is kept and new remote items go to the front (favourites).
 */
export function orderMerged<T>(
  before: readonly string[],
  merged: ReadonlyMap<string, T>,
  ledger: Ledger,
  byRecency: boolean,
): T[] {
  const keys = [...merged.keys()];
  if (byRecency) {
    const index = new Map(before.map((k, i) => [k, i]));
    keys.sort((a, b) => (ledger[b]?.u ?? 0) - (ledger[a]?.u ?? 0) || (index.get(a) ?? 1e9) - (index.get(b) ?? 1e9));
  } else {
    const known = new Set(before);
    const added = keys.filter((k) => !known.has(k)).sort((a, b) => (ledger[b]?.u ?? 0) - (ledger[a]?.u ?? 0));
    const kept = before.filter((k) => merged.has(k));
    return [...added, ...kept].map((k) => merged.get(k) as T);
  }
  return keys.map((k) => merged.get(k) as T);
}

/**
 * Recents are ordered by recency: when the phone moves an item up (used again), its clock must be
 * newer than every item after it. Walks the list from the end and bumps what is out of order.
 */
export function enforceRecency(ledger: Ledger, keysNewestFirst: readonly string[], now: number): Ledger {
  const next: Ledger = { ...ledger };
  let after = Number.NEGATIVE_INFINITY;
  for (let i = keysNewestFirst.length - 1; i >= 0; i--) {
    const key = keysNewestFirst[i];
    const e = next[key];
    if (!e || e.d) continue;
    if (e.u <= after) next[key] = { u: Math.max(now, after + 1), h: e.h };
    after = next[key].u;
  }
  return next;
}

/** The pull cursor: the newest synced_at seen so far (ISO), or null before the first pull. */
export function nextCursor(previous: string | null, rows: readonly RemoteRow[]): string | null {
  let max = previous ? Date.parse(previous) : Number.NEGATIVE_INFINITY;
  for (const r of rows) {
    const t = Date.parse(r.synced_at);
    if (Number.isFinite(t) && t > max) max = t;
  }
  return Number.isFinite(max) ? new Date(max).toISOString() : previous;
}

/** Where the next pull starts: the cursor minus an overlap for writes that committed late (merging is idempotent). */
export function pullSince(cursor: string | null, overlapMs = 5 * 60_000): string | null {
  if (!cursor) return null;
  const t = Date.parse(cursor);
  return Number.isFinite(t) ? new Date(t - overlapMs).toISOString() : null;
}
