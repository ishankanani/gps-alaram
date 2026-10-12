/**
 * English strings of user-facing API errors: errors.<code> from src/api/types.ts, plus errors.network and errors.timeout.
 * Owned by package A: account, plan, paywall. Keys use the prefix "errors." and define the set the other
 * languages translate.
 *
 * Every message says what happened and what to do (ui-direction-a 5). Where each one shows:
 * inline under its field (validation, codes, credentials), a Banner on the screen (rate limits,
 * disabled, mail), or a toast (network failures of background actions).
 */
export const errors = {
  // ---- Server codes (backend-spec 2.3) ----
  'errors.bad_request': 'Something in that request wasn’t right. Please try again.',
  'errors.validation_failed': 'Some details need a fix. Check the fields above.',
  'errors.unsupported_media_type': 'This version of StopWake can’t do that. Update the app.',
  'errors.payload_too_large': 'That’s too much text. Shorten it and try again.',
  'errors.unauthorized': 'You were signed out on this phone. Sign in again.',
  'errors.invalid_credentials': 'Email or password is wrong.',
  'errors.reauth_required': 'Confirm it’s you: enter your password again.',
  'errors.forbidden': 'Your account can’t do this.',
  'errors.account_disabled': 'This account is disabled. Contact support.',
  'errors.signup_disabled': 'Creating accounts is paused right now. Try again later.',
  'errors.redeem_disabled': 'Codes can’t be redeemed right now. Try again later.',
  'errors.not_found': 'We couldn’t find that. It may have been removed.',
  'errors.method_not_allowed': 'This version of StopWake can’t do that. Update the app.',
  'errors.email_taken': 'An account with this email exists.',
  'errors.already_signed_up': 'You’re already signed in to an account.',
  'errors.not_an_account': 'Create a free account first.',
  'errors.subscription_active': 'Your Google Play subscription is still running.',
  'errors.last_admin': 'You’re the only admin. Make someone else an admin first.',
  'errors.cannot_target_self': 'You can’t do this to your own account.',
  'errors.confirm_mismatch': 'That doesn’t match. Type the ID exactly as shown.',
  'errors.already_revoked': 'This has already ended.',
  'errors.already_lifetime': 'You have Pro for life already, so you don’t need a code.',
  'errors.promo_invalid': 'We don’t know this code. Check the spelling.',
  'errors.promo_expired': 'This code has expired.',
  'errors.promo_exhausted': 'This code has been used up.',
  'errors.promo_already_redeemed': 'You’ve already used this code.',
  'errors.code_taken': 'This code exists already. Choose another one.',
  'errors.promo_in_use': 'This code has been used, so it can’t be changed like that.',
  'errors.invalid_reset_code': 'This code is wrong or has expired.',
  'errors.rate_limited': 'Too many tries. Wait a few minutes, then try again.',
  'errors.mail_unavailable': 'We can’t send emails right now. Email support for a code.',
  'errors.not_configured': 'This build works without an account.',
  'errors.unavailable': 'StopWake is busy right now. Try again in a minute.',
  'errors.internal': 'Something went wrong on our side. Try again later.',

  // ---- No answer ----
  'errors.network': 'Couldn’t reach StopWake. Check your connection.',
  'errors.timeout': 'StopWake took too long to answer. Try again.',
  'errors.bad_response': 'StopWake sent an answer we didn’t expect. Try again later.',

  // ---- With details ----
  'errors.rate_limitedMinutes': 'Too many tries. Try again in {minutes} min.',
  'errors.rate_limitedSeconds': 'Too many tries. Try again in {seconds} s.',
  'errors.retry': 'Retry',

  // ---- Field errors (validation_failed) ----
  'errors.field.required': 'Fill this in.',
  'errors.field.invalid': 'This doesn’t look right.',
  'errors.field.invalid_email': 'Enter an email address like name@example.com.',
  'errors.field.too_short': 'This is too short.',
  'errors.field.too_long': 'This is too long.',
  'errors.field.too_common': 'This password is too common. Try a longer one.',
  'errors.field.same_as_email': 'Your password can’t be your email.',
  'errors.field.out_of_range': 'This number is out of range.',
  'errors.field.invalid_date': 'Enter a real date.',
  'errors.field.in_past': 'Pick a date in the future.',
  'errors.field.unknown_key': 'This setting doesn’t exist.',
  'errors.field.not_allowed': 'This can’t be changed.',
  'errors.password.too_short': 'Use at least 8 characters.',
  'errors.password.too_long': 'Use at most 128 characters.',
  'errors.name.too_long': 'Use at most 60 characters.',
} as const satisfies Record<string, string>;
