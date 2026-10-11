import { PlaceholderScreen } from '../../navigation/PlaceholderScreen';

/**
 * Route `AdminPrice` (backend-spec 7.7, ui-direction-a 4.3 "Admin area"; params in
 * src/navigation/types.ts): package D (admin) builds this screen. A placeholder until then.
 */
export function AdminPriceScreen() {
  return <PlaceholderScreen presentation="modal" admin testID="screen-AdminPrice" />;
}
