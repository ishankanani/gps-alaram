import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Easing, type EasingFunction } from 'react-native';

import { motion, type DurationName, type EasingName } from './tokens';

// Motion tokens as React Native easing functions, and the reduced-motion switch (2.8): with
// reduced motion every duration becomes 0, springs become instant and skeletons stop pulsing.

const bezier = (p: readonly number[]) => Easing.bezier(p[0], p[1], p[2], p[3]);

export const easing: Record<EasingName, EasingFunction> = {
  standard: bezier(motion.easing.standard),
  enter: bezier(motion.easing.enter),
  exit: bezier(motion.easing.exit),
  inOut: bezier(motion.easing.inOut),
};

export type Durations = Record<DurationName, number>;

const ZERO: Durations = Object.fromEntries(Object.keys(motion.duration).map((k) => [k, 0])) as Durations;

export function durations(reduceMotion: boolean): Durations {
  return reduceMotion ? ZERO : { ...motion.duration };
}

let current = false;
let started = false;
const listeners = new Set<() => void>();

function set(value: boolean) {
  if (value === current) return;
  current = value;
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  AccessibilityInfo.isReduceMotionEnabled().then(set, () => {});
  AccessibilityInfo.addEventListener('reduceMotionChanged', set);
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the system asks for reduced motion (kept current by a listener). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => current);
}

/** The current reduced-motion setting outside React (for module-level animations). */
export function isReduceMotion(): boolean {
  return current;
}
