/**
 * Supabase Auth's session storage on top of expo-secure-store. SecureStore warns above 2048 bytes
 * per value and a Supabase session (two JWTs plus the user) is larger, so values are split into
 * chunks: `<key>` holds the chunk count, `<key>.0`, `<key>.1`, … the parts. Pure: the store is
 * injected (Vitest uses a Map).
 */

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  deleteItem(key: string): void;
};

export const CHUNK_SIZE = 1800;
const MAX_CHUNKS = 32;

/** SecureStore keys may only contain letters, digits, ".", "-" and "_". */
export function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function createChunkedStorage(store: KeyValueStore) {
  function count(key: string): number {
    const raw = store.getItem(key);
    const n = raw && /^chunks:\d+$/.test(raw) ? Number(raw.slice(7)) : 0;
    return Math.min(n, MAX_CHUNKS);
  }

  function remove(key: string) {
    const k = safeKey(key);
    const n = count(k);
    for (let i = 0; i < n; i++) store.deleteItem(`${k}.${i}`);
    store.deleteItem(k);
  }

  return {
    getItem(key: string): string | null {
      try {
        const k = safeKey(key);
        const n = count(k);
        if (n === 0) return null;
        let out = '';
        for (let i = 0; i < n; i++) {
          const part = store.getItem(`${k}.${i}`);
          if (part === null) return null;
          out += part;
        }
        return out;
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string): void {
      try {
        const k = safeKey(key);
        const old = count(k);
        const parts: string[] = [];
        for (let i = 0; i < value.length; i += CHUNK_SIZE) parts.push(value.slice(i, i + CHUNK_SIZE));
        if (parts.length > MAX_CHUNKS) return;
        parts.forEach((part, i) => store.setItem(`${k}.${i}`, part));
        for (let i = parts.length; i < old; i++) store.deleteItem(`${k}.${i}`);
        store.setItem(k, `chunks:${parts.length}`);
      } catch {
        // Keystore trouble: the session lives in memory for this run.
      }
    },
    removeItem(key: string): void {
      try {
        remove(key);
      } catch {
        // Nothing stored.
      }
    },
  };
}
