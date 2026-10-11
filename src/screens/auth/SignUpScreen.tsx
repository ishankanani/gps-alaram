import { PlaceholderScreen } from '../../navigation/PlaceholderScreen';

/**
 * Route `SignUp` (ui-direction-a 4.3 "Sign up"; params in src/navigation/types.ts): package
 * A (account, plan, paywall) builds this screen. A placeholder until then.
 */
export function SignUpScreen() {
  return <PlaceholderScreen presentation="modal" testID="screen-SignUp" />;
}
