import { useEffect, useSyncExternalStore } from 'react';

// Counts open dialogs. On Android an RN Modal is its own window, so a toast shown while a dialog
// is open would sit under its scrim: toasts wait until every dialog has closed.

let open = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Marks a dialog as open while `visible`. */
export function useOverlayOpen(visible: boolean) {
  useEffect(() => {
    if (!visible) return;
    open += 1;
    emit();
    return () => {
      open = Math.max(0, open - 1);
      emit();
    };
  }, [visible]);
}

/** Whether any dialog is open. */
export function useAnyOverlayOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open > 0);
}
