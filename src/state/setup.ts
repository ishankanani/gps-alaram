import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { TripAlarm, type SetupStatus } from '../../modules/trip-alarm/src';

/** True when everything a trip cannot run without is in place (precise location, location on, notifications). */
export function setupReady(status: SetupStatus | null | undefined): boolean {
  return !!status && status.location === 'precise' && status.locationServices && status.notifications;
}

function read(): SetupStatus | null {
  try {
    return TripAlarm?.getSetupStatus() ?? null;
  } catch {
    return null;
  }
}

/**
 * The alarm checklist from the native module, refreshed whenever the app comes back to the
 * foreground (the user may have changed a system setting). Null where the module is missing.
 */
export function useSetupStatus(): SetupStatus | null {
  const [status, setStatus] = useState<SetupStatus | null>(read);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setStatus(read());
    });
    return () => sub.remove();
  }, []);
  return status;
}

/** Whether a required item is missing: the Account tab shows a dot. */
export function useSetupNeedsAction(): boolean {
  const status = useSetupStatus();
  return !!TripAlarm && !!status && !setupReady(status);
}
