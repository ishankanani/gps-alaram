import { describe, expect, it } from 'vitest';

import {
  applyRemote,
  diffLocal,
  enforceRecency,
  hashValue,
  markPushed,
  nextCursor,
  orderMerged,
  pending,
  pullSince,
  rowToItem,
  TOMBSTONE_TTL_MS,
  type Ledger,
} from '../cloudSync';

const m = (entries: [string, unknown][]) => new Map(entries);

describe('hashValue', () => {
  it('ignores key order and undefined fields', () => {
    expect(hashValue({ a: 1, b: [1, { c: 2 }] })).toBe(hashValue({ b: [1, { c: 2 }], a: 1, x: undefined }));
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
  });
});

describe('a sync round', () => {
  it('signing in merges the phone into the account and the account into the phone', () => {
    const local = m([['a', { n: 'A' }], ['b', { n: 'B' }]]);
    const ledger = diffLocal({}, local, 1000);
    expect(Object.keys(ledger)).toEqual(['a', 'b']);
    const merged = applyRemote(local, ledger, [{ key: 'c', value: { n: 'C' }, deleted: false, updatedAt: 500 }]);
    expect([...merged.items.keys()]).toEqual(['a', 'b', 'c']);
    expect(merged.changed).toBe(true);
    const push = pending(merged.items, merged.ledger);
    expect(push.map((p) => p.key)).toEqual(['a', 'b']);
    const after = markPushed(merged.ledger, push);
    expect(pending(merged.items, after)).toEqual([]);
  });

  it('last write wins in both directions', () => {
    const local = m([['a', { n: 'mine' }]]);
    const ledger: Ledger = { a: { u: 2000, h: hashValue({ n: 'mine' }) } };
    const older = applyRemote(local, ledger, [{ key: 'a', value: { n: 'theirs' }, deleted: false, updatedAt: 1000 }]);
    expect(older.items.get('a')).toEqual({ n: 'mine' });
    const newer = applyRemote(local, ledger, [{ key: 'a', value: { n: 'theirs' }, deleted: false, updatedAt: 3000 }]);
    expect(newer.items.get('a')).toEqual({ n: 'theirs' });
    expect(pending(newer.items, newer.ledger)).toEqual([]);
  });

  it('local edits and deletions become pushes; remote deletions remove the item', () => {
    let ledger = diffLocal({}, m([['a', 1], ['b', 2]]), 1000);
    ledger = markPushed(ledger, pending(m([['a', 1], ['b', 2]]), ledger));
    ledger = diffLocal(ledger, m([['a', 5]]), 2000);
    expect(pending(m([['a', 5]]), ledger)).toEqual([
      { key: 'a', value: 5, deleted: false, updatedAt: 2000 },
      { key: 'b', value: null, deleted: true, updatedAt: 2000 },
    ]);
    const removed = applyRemote(m([['a', 5]]), ledger, [{ key: 'a', value: null, deleted: true, updatedAt: 9000 }]);
    expect(removed.items.has('a')).toBe(false);
    expect(removed.ledger.a.d).toBe(true);
  });

  it('forgets pushed tombstones after a while', () => {
    const ledger: Ledger = { gone: { u: 0, h: '', d: true, p: true }, fresh: { u: 1000, h: '', d: true } };
    const next = diffLocal(ledger, m([]), TOMBSTONE_TTL_MS + 1);
    expect(Object.keys(next)).toEqual(['fresh']);
  });

  it('an unchanged list changes nothing', () => {
    const items = m([['a', { x: 1 }]]);
    const ledger = markPushed(diffLocal({}, items, 1000), pending(items, diffLocal({}, items, 1000)));
    expect(diffLocal(ledger, items, 5000)).toEqual(ledger);
  });
});

describe('recents and ordering', () => {
  it('bumps a recent that moved to the front', () => {
    const ledger: Ledger = { a: { u: 100, h: 'x', p: true }, b: { u: 200, h: 'y', p: true } };
    const next = enforceRecency(ledger, ['a', 'b'], 1000);
    expect(next.a.u).toBe(1000);
    expect(next.a.p).toBeUndefined();
    expect(next.b).toBe(ledger.b);
  });

  it('orders recents by clock and keeps the favourites’ order', () => {
    const ledger: Ledger = { a: { u: 1, h: '' }, b: { u: 3, h: '' }, c: { u: 2, h: '' } };
    const merged = m([['a', 'A'], ['b', 'B'], ['c', 'C']]);
    expect(orderMerged(['a', 'b'], merged, ledger, true)).toEqual(['B', 'C', 'A']);
    expect(orderMerged(['a', 'b'], merged, ledger, false)).toEqual(['C', 'A', 'B']);
  });
});

describe('pulled rows and the cursor', () => {
  it('reads rows and moves the cursor to the newest synced_at', () => {
    const rows = [
      { item_key: 'a', value: { v: 1 }, deleted: false, updated_at: '2026-01-01T00:00:00Z', synced_at: '2026-01-02T00:00:00Z' },
      { item_key: 'b', value: null, deleted: true, updated_at: '2026-01-01T00:00:00Z', synced_at: '2026-01-03T00:00:00Z' },
    ];
    expect(rowToItem(rows[1])).toEqual({ key: 'b', value: null, deleted: true, updatedAt: Date.parse('2026-01-01T00:00:00Z') });
    const cursor = nextCursor(null, rows);
    expect(cursor).toBe('2026-01-03T00:00:00.000Z');
    expect(nextCursor(cursor, [])).toBe(cursor);
    expect(pullSince(cursor)).toBe('2026-01-02T23:55:00.000Z');
    expect(pullSince(null)).toBeNull();
  });
});
