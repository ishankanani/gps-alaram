import { PlaceholderScreen } from '../../navigation/PlaceholderScreen';

/**
 * Route `SignIn` (ui-direction-a 4.3 "Sign in"; params in src/navigation/types.ts): package
 * A (account, plan, paywall) builds this screen. A placeholder until then.
 */
export function SignInScreen() {
  return <PlaceholderScreen presentation="modal" testID="screen-SignIn" />;
}
