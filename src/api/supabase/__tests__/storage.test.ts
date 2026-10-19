import { describe, expect, it } from 'vitest';

import { CHUNK_SIZE, createChunkedStorage, safeKey } from '../storage';

function memory() {
  const map = new Map<string, string>();
  return { map, store: { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), deleteItem: (k: string) => void map.delete(k) } };
}

describe('chunked SecureStore storage', () => {
  it('splits long values and reads them back', () => {
    const { map, store } = memory();
    const s = createChunkedStorage(store);
    const value = 'x'.repeat(CHUNK_SIZE * 2 + 5);
    s.setItem('sb-auth', value);
    expect(map.get('sb-auth')).toBe('chunks:3');
    expect(s.getItem('sb-auth')).toBe(value);
  });

  it('drops old chunks when a value shrinks, and removes all of them', () => {
    const { map, store } = memory();
    const s = createChunkedStorage(store);
    s.setItem('k', 'y'.repeat(CHUNK_SIZE * 3));
    s.setItem('k', 'short');
    expect(map.has('k.1')).toBe(false);
    expect(s.getItem('k')).toBe('short');
    s.removeItem('k');
    expect(map.size).toBe(0);
    expect(s.getItem('k')).toBeNull();
  });

  it('makes keys SecureStore accepts', () => {
    expect(safeKey('sb-abc-auth-token:code verifier')).toBe('sb-abc-auth-token_code_verifier');
  });
});
