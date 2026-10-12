// Helpers shared by the account, auth and paywall screens (package A): dates, error texts, plan
// names and links. Screen-only code: it may use react-native.
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useCallback } from 'react';
import { Linking } from 'react-native';

import { deviceRegion } from '../../api';
import { ApiError, errorKey, fieldErrorKey, isApiError } from '../../api/errors';
import type { FieldError, PlanId } from '../../api/types';
import { useI18n, type Key, type Lang, type T } from '../../i18n';

/** A BCP 47 tag for Intl: the app language with the phone's region (en-DE writes "12 Oct 2027"). */
export function localeTag(lang: Lang): string {
  const region = deviceRegion();
  return region ? `${lang}-${region}` : lang;
}

/** "12 Oct 2027" (long) or "17 Oct" (short), in the app language. */
export function formatDate(value: string | number | Date | null | undefined, lang: Lang, style: 'long' | 'short' = 'long'): string {
  if (value == null) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const options: Intl.DateTimeFormatOptions =
    style === 'long' ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' };
  try {
    return new Intl.DateTimeFormat(localeTag(lang), options).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** "2 h ago" for the offline banner. */
export function agoText(since: number, now: number, tr: T): string {
  const minutes = Math.max(0, Math.floor((now - since) / 60_000));
  if (minutes < 1) return tr('account.ago.now');
  if (minutes < 60) return tr('account.ago.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return tr('account.ago.hours', { count: hours });
  return tr('account.ago.days', { count: Math.floor(hours / 24) });
}

export function planName(plan: PlanId, tr: T): string {
  if (plan === 'monthly') return tr('account.planName.monthly');
  if (plan === 'yearly') return tr('account.planName.yearly');
  if (plan === 'lifetime') return tr('account.planName.lifetime');
  return tr('account.plan.free');
}

/** The user-facing text of any error from the API (or anything else that was thrown). */
export function errorText(e: unknown, tr: T): string {
  if (!isApiError(e)) return tr('errors.internal');
  if (e.code === 'rate_limited' && e.retryAfterSeconds != null && e.retryAfterSeconds > 0) {
    return e.retryAfterSeconds >= 90
      ? tr('errors.rate_limitedMinutes', { minutes: Math.ceil(e.retryAfterSeconds / 60) })
      : tr('errors.rate_limitedSeconds', { seconds: e.retryAfterSeconds });
  }
  return tr(errorKey(e.code) as Key);
}

/** The error of one field of a validation_failed answer, translated; null when that field is fine. */
export function fieldErrorText(e: unknown, field: string, tr: T, kind?: 'password' | 'name'): string | null {
  if (!(e instanceof ApiError) || e.code !== 'validation_failed' || !e.fields?.[field]) return null;
  const error: FieldError = e.fields[field];
  if (kind === 'password' && (error === 'too_short' || error === 'too_long')) return tr(`errors.password.${error}`);
  if (kind === 'name' && error === 'too_long') return tr('errors.name.too_long');
  return tr(fieldErrorKey(error) as Key);
}

/** errorText for screens. */
export function useErrorText(): (e: unknown) => string {
  const { t: tr } = useI18n();
  return useCallback((e: unknown) => errorText(e, tr), [tr]);
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

/** The same check as the server (4.4), so most typos never leave the phone. */
export function looksLikeEmail(email: string): boolean {
  return email.trim().length <= 254 && EMAIL_RE.test(email.trim());
}

/** Opens a web page in an in-app browser tab (falls back to the system browser). */
export async function openWeb(url: string): Promise<void> {
  if (!url) return;
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    Linking.openURL(url).catch(() => {});
  }
}

/** Opens an app or store link (Google Play's subscriptions page). */
export function openExternal(url: string) {
  Linking.openURL(url).catch(() => {
    void openWeb(url);
  });
}

/** A prefilled mail to support. */
export function mailSupport(to: string, subject: string, body = '') {
  if (!to) return;
  const url = `mailto:${to}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
  Linking.openURL(url).catch(() => {});
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

/** "a•••@example.com" for "the code we sent to …". */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local[0]}•••@${domain}`;
}
