/**
 * The install id and the session token in SecureStore (backend-spec 3.7). Both stay out of Android
 * Auto Backup (app.config.js sets configureAndroidBackup), so a restored phone starts as a new guest.
 * Reads are synchronous: the app renders before any network call.
 */
import * as SecureStore from 'expo-secure-store';
import { uuid } from 'expo-modules-core';

const INSTALL_KEY = 'stopwake.install';
const SESSION_KEY = 'stopwake.session';

const INSTALL_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type StoredSession = {
  token: string;
  /** users.id: also the RevenueCat app user id. */
  userId: string;
  /** SW-7K3P-92QX */
  publicId: string;
  kind: 'guest' | 'account';
};

let installId: string | null = null;
let session: StoredSession | null | undefined;

function read(key: string): string | null {
  try {
    return SecureStore.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    // Synchronous, so a clear followed at once by a new session can't land in the wrong order.
    SecureStore.setItem(key, value);
  } catch {
    // Keystore trouble: the value lives in memory for this run.
  }
}

/** This installation's id (a UUID v4), created on first use. */
export function getInstallId(): string {
  if (installId) return installId;
  const stored = read(INSTALL_KEY);
  if (stored && INSTALL_RE.test(stored)) {
    installId = stored;
    return stored;
  }
  const created = uuid.v4().toLowerCase();
  installId = created;
  write(INSTALL_KEY, created);
  return created;
}

function parseSession(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof value.token === 'string' &&
      typeof value.userId === 'string' &&
      typeof value.publicId === 'string' &&
      (value.kind === 'guest' || value.kind === 'account')
    ) {
      return { token: value.token, userId: value.userId, publicId: value.publicId, kind: value.kind };
    }
  } catch {
    // Unreadable: start over as a guest.
  }
  return null;
}

/** The stored session, or null (first launch, signed out, keystore reset). */
export function getSession(): StoredSession | null {
  if (session === undefined) session = parseSession(read(SESSION_KEY));
  return session;
}

export function setSession(next: StoredSession) {
  session = next;
  write(SESSION_KEY, JSON.stringify(next));
}

export function clearSession() {
  session = null;
  write(SESSION_KEY, '{}');
}

/** The bearer token for requests. */
export function getToken(): string | null {
  return getSession()?.token ?? null;
}
