import { PlaceholderScreen } from '../../navigation/PlaceholderScreen';

/**
 * Route `AdminSettings` (backend-spec 7.7, ui-direction-a 4.3 "Admin area"; params in
 * src/navigation/types.ts): package D (admin) builds this screen. A placeholder until then.
 */
export function AdminSettingsScreen() {
  return <PlaceholderScreen presentation="card" admin testID="screen-AdminSettings" />;
}
