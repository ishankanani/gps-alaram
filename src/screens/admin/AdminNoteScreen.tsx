import { PlaceholderScreen } from '../../navigation/PlaceholderScreen';

/**
 * Route `AdminNote` (backend-spec 7.7, ui-direction-a 4.3 "Admin area"; params in
 * src/navigation/types.ts): package D (admin) builds this screen. A placeholder until then.
 */
export function AdminNoteScreen() {
  return <PlaceholderScreen presentation="modal" admin testID="screen-AdminNote" />;
}
