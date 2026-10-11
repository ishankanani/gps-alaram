import { PlaceholderScreen } from '../../navigation/PlaceholderScreen';

/**
 * Route `AdminUser` (backend-spec 7.7, ui-direction-a 4.3 "Admin area"; params in
 * src/navigation/types.ts): package D (admin) builds this screen. A placeholder until then.
 */
export function AdminUserScreen() {
  return <PlaceholderScreen presentation="card" admin testID="screen-AdminUser" />;
}
