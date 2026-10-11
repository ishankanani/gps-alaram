import { BottomTabBarHeightCallbackContext, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CommonActions, useIsFocused } from '@react-navigation/native';
import { useContext, useState } from 'react';

import type { GpsHealth, TripStatus } from '../../modules/trip-alarm/src';
import { useI18n, type Key, type T } from '../i18n';
import { formatDistance, formatDuration } from '../lib/format';
import { useSetupNeedsAction } from '../state/setup';
import { useTrip } from '../state/trip';
import type { IconName } from '../ui/components/Icon';
import { TabBar, type TabItem } from '../ui/components/TabBar';
import { useToastInset } from '../ui/components/Toast';
import { TripBar } from '../ui/components/TripBar';
import { haptics } from '../ui/haptics';
import { useTabBarHidden } from './tabBar';
import type { TabParamList } from './types';

/** Tab labels and icons (2.6, 4.2): outline glyphs, the filled one when active. */
export const TABS: Record<keyof TabParamList, { label: Key; icon: IconName; activeIcon: IconName }> = {
  MapTab: { label: 'nav.tab.map', icon: 'map-outline', activeIcon: 'map' },
  SavedTab: { label: 'nav.tab.saved', icon: 'star-outline', activeIcon: 'star' },
  ActivityTab: { label: 'nav.tab.activity', icon: 'timeline-clock-outline', activeIcon: 'timeline-clock' },
  AccountTab: { label: 'nav.tab.account', icon: 'account-circle-outline', activeIcon: 'account-circle' },
};

const HEALTH: Record<GpsHealth, Key> = {
  waiting: 'trip.gps.waiting',
  good: 'trip.gps.good',
  weak: 'trip.gps.weak',
  lost: 'trip.gps.estimating',
};

/** "1.3 km · 6 min · GPS good"; estimated: "≈ 2.4 km · No GPS: estimating". */
function tripLine(status: TripStatus, tr: T, lang: string): string {
  const useMiles = status.trip?.useMiles ?? false;
  const approx = status.estimated ? '≈ ' : '';
  const parts: string[] = [];
  if (status.distanceM != null) parts.push(`${approx}${formatDistance(status.distanceM, useMiles, lang)}`);
  if (status.etaSec != null && !status.estimated) parts.push(formatDuration(status.etaSec));
  parts.push(tr(status.estimated ? 'trip.gps.estimating' : HEALTH[status.health ?? 'waiting']));
  return parts.join(' · ');
}

/**
 * The custom tab bar (3.25 with the critiques): absolutely positioned, it reports its own height
 * (tab roots pad by it, toasts float above it) and carries the TripBar while a trip runs, so the
 * TripBar hides with it. Pushed screens cover it and show no TripBar.
 */
export function AppTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const { t: tr, lang } = useI18n();
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const trip = useTrip();
  const hidden = useTabBarHidden();
  const setupNeedsAction = useSetupNeedsAction();
  // Focused: the tabs are on top (pushed screens cover the bar and place toasts themselves).
  const tabsFocused = useIsFocused();
  const [height, setHeight] = useState(0);
  useToastInset(height, tabsFocused && !hidden && height > 0);

  const items: TabItem[] = state.routes.map((route, index) => {
    const tab = TABS[route.name as keyof TabParamList];
    const focused = state.index === index;
    return {
      key: route.key,
      label: tr(tab.label),
      icon: tab.icon,
      activeIcon: tab.activeIcon,
      active: focused,
      // Only a missing required item lights the dot (a billing problem will join it).
      badge: route.name === 'AccountTab' && setupNeedsAction,
      testID: `tab-${route.name}`,
      onPress: () => {
        const event = navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
          data: { behavior: { scrollToTop: focused, popToTop: focused } },
        });
        if (!focused && !event.defaultPrevented) {
          haptics.selection();
          navigation.dispatch({ ...CommonActions.navigate(route.name, route.params), target: state.key });
        }
      },
      onLongPress: () => navigation.emit({ type: 'tabLongPress', target: route.key }),
    };
  });

  const status = trip.status;
  const ringing = status?.state === 'ringing';
  const tripBar =
    status?.trip != null ? (
      <TripBar
        testID="trip-bar"
        kind={trip.kind}
        title={ringing ? `${tr('trip.wakeUp')} ${status.trip.label}` : status.trip.label}
        subtitle={status.state === 'snoozed' ? tr('trip.snoozed') : ringing ? undefined : tripLine(status, tr, lang)}
        state={ringing ? 'ringing' : status.state === 'snoozed' ? 'snoozed' : 'tracking'}
        openAlarmLabel={tr('nav.openAlarm')}
        accessibilityHint={tr('nav.openTrip')}
        onPress={trip.openTrip}
      />
    ) : null;

  return (
    <TabBar
      items={items}
      top={tripBar}
      hidden={hidden}
      bottomInset={insets.bottom}
      onHeight={(h) => {
        setHeight(h);
        reportHeight?.(h);
      }}
    />
  );
}
