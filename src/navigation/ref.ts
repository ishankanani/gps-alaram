import { createNavigationContainerRef, StackActions } from '@react-navigation/native';

import type { RootRouteName, RootStackParamList } from './types';

/**
 * The root navigator, usable outside screens (the trip provider presents Trip and Arrived with
 * it, whatever screen or modal is open).
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let queued: (() => void)[] = [];

/** Runs `action` now, or once the navigation container is ready (cold start). */
export function whenNavigationReady(action: () => void) {
  if (navigationRef.isReady()) action();
  else queued.push(action);
}

/** Called by the NavigationContainer's onReady. */
export function flushNavigationQueue() {
  const pending = queued;
  queued = [];
  pending.forEach((action) => action());
}

/** The focused route of the root stack (nested tab routes report their own names). */
export function currentRouteName(): string | undefined {
  return navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
}

/** Back to the Map tab, closing every screen above the tabs. */
export function goToMap() {
  whenNavigationReady(() => navigationRef.navigate('Tabs', { screen: 'MapTab' }, { pop: true }));
}

/** Replaces the focused route when it is `from`, otherwise pushes `to`. */
export function replaceOrNavigate<T extends RootRouteName>(
  from: RootRouteName,
  to: T,
  ...params: undefined extends RootStackParamList[T] ? [RootStackParamList[T]?] : [RootStackParamList[T]]
) {
  whenNavigationReady(() => {
    const focused = navigationRef.getCurrentRoute()?.name;
    if (focused === from) navigationRef.dispatch(StackActions.replace(to, params[0]));
    else (navigationRef.navigate as (name: string, params?: object) => void)(to, params[0]);
  });
}
