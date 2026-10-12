import { getCalendars } from 'expo-localization';
import { useSyncExternalStore } from 'react';

// "Now" for labels like Today and Yesterday, re-rendering once a minute (so a list left open past
// midnight moves on), and the phone's 12- or 24-hour clock setting.

let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function snapshot() {
  return now;
}

/** The current time, updated every minute while anything shows it. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

let clock24: boolean | null = null;

/** Whether the phone uses a 24-hour clock (true when it doesn't say). */
export function uses24HourClock(): boolean {
  if (clock24 == null) {
    try {
      clock24 = getCalendars()[0]?.uses24hourClock ?? true;
    } catch {
      clock24 = true;
    }
  }
  return clock24;
}
