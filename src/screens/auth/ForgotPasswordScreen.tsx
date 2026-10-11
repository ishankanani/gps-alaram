import { PlaceholderScreen } from '../../navigation/PlaceholderScreen';

/**
 * Route `ForgotPassword` (ui-direction-a 4.3 "Forgot password"; params in src/navigation/types.ts): package
 * A (account, plan, paywall) builds this screen. A placeholder until then.
 */
export function ForgotPasswordScreen() {
  return <PlaceholderScreen presentation="modal" testID="screen-ForgotPassword" />;
}
