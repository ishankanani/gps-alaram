import { useSyncExternalStore } from 'react';

// The signed-in account's role, as far as navigation needs it (the admin guard, backend-spec 7.7).
// Package A's account store calls setSessionRole() from the cached session (on start, after
// sign-in and sign-out, and when a request answers 403). Until then nobody is an admin.

export type SessionRole = 'user' | 'admin' | null;

let role: SessionRole = null;
const listeners = new Set<() => void>();
const changeListeners = new Set<(previous: SessionRole, next: SessionRole) => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Updates the role; the admin routes appear or disappear at once. */
export function setSessionRole(next: SessionRole) {
  if (next === role) return;
  const previous = role;
  role = next;
  // Before React re-renders: listeners still see the screen the user is on.
  changeListeners.forEach((l) => l(previous, next));
  listeners.forEach((l) => l());
}

/** Calls `listener` on every role change, synchronously; returns the unsubscribe function. */
export function onSessionRoleChange(listener: (previous: SessionRole, next: SessionRole) => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

export function getSessionRole(): SessionRole {
  return role;
}

/** Whether the cached session belongs to an admin: the admin stack is registered only then. */
export function useIsAdmin(): boolean {
  return useSyncExternalStore(subscribe, () => role === 'admin');
}
