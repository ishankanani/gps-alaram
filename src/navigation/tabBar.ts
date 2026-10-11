import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { Keyboard, Platform } from 'react-native';

// Who asked the tab bar to hide: the MapSheet in search and stop modes (3.25). It also hides while
// the keyboard is open. The bar slides out over 200 ms and comes back the same way.

const hiders = new Set<string>();
const listeners = new Set<() => void>();
let hiddenNow = false;

function emit() {
  const next = hiders.size > 0;
  if (next === hiddenNow) return;
  hiddenNow = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Hides the tab bar while `hidden` is true and the calling component is mounted. */
export function useHideTabBar(hidden: boolean) {
  const id = useId();
  useEffect(() => {
    if (!hidden) return;
    hiders.add(id);
    emit();
    return () => {
      hiders.delete(id);
      emit();
    };
  }, [hidden, id]);
}

function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

/** Whether the tab bar is out of the way (a screen asked for it, or the keyboard is open). */
export function useTabBarHidden(): boolean {
  const requested = useSyncExternalStore(subscribe, () => hiddenNow);
  const keyboard = useKeyboardOpen();
  return requested || keyboard;
}
