import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DialogProvider } from '../ui/components/ConfirmDialog';
import { ToastProvider } from '../ui/components/Toast';
import { ThemeProvider, type AppearancePreference } from '../ui/theme';
import { LanguageProvider } from './language';
import { SavedDataProvider, useSavedData } from './saved';
import { TripProvider } from './trip';

export { setupReady, useSetupNeedsAction, useSetupStatus } from './setup';
export { getSessionRole, onSessionRoleChange, setSessionRole, useIsAdmin, type SessionRole } from './session';
export { useSavedData, type SavedDataApi } from './saved';
export { isRunning, runningTripNow, useTrip, type EndedTrip, type PendingTrip, type TripApi } from './trip';
export { useDialogs } from '../ui/components/ConfirmDialog';
export { useToast } from '../ui/components/Toast';

/** Settings › Appearance from the saved preferences (anything unexpected follows the phone). */
function AppThemeProvider({ children }: { children: ReactNode }) {
  const { data } = useSavedData();
  const choice = data.preferences.appearance;
  const appearance: AppearancePreference = choice === 'light' || choice === 'dark' ? choice : 'system';
  return <ThemeProvider appearance={appearance}>{children}</ThemeProvider>;
}

/**
 * Everything the screens share, outermost first: safe-area insets, the saved data, the language,
 * the theme, dialogs and toasts (hosted above the navigation), and the trip lifecycle, which
 * needs all of them and presents Trip and Arrived through the navigation ref.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider>
      <SavedDataProvider>
        <LanguageProvider>
          <AppThemeProvider>
            <DialogProvider>
              <ToastProvider>
                <TripProvider>{children}</TripProvider>
              </ToastProvider>
            </DialogProvider>
          </AppThemeProvider>
        </LanguageProvider>
      </SavedDataProvider>
    </SafeAreaProvider>
  );
}
