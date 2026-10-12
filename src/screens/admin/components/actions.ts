import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';

import { confirmAdminPassword, toAdminError } from '../../../api/admin';
import { useI18n } from '../../../i18n';
import { haptics, useDialogs, useToast, type ConfirmValues, type IconName } from '../../../ui';
import type { AdminKey, AdminT } from '../lib/text';
import { useAdminContext } from './AdminFrame';

const ERROR_TEXT: Partial<Record<string, AdminKey>> = {
  network: 'admin.error.network',
  timeout: 'admin.error.timeout',
  not_found: 'admin.error.notFound',
  cannot_target_self: 'admin.common.selfBlocked',
  last_admin: 'admin.error.lastAdmin',
  not_an_account: 'admin.error.notAnAccount',
  already_revoked: 'admin.error.alreadyRevoked',
  already_lifetime: 'admin.error.alreadyLifetime',
  code_taken: 'admin.error.codeTaken',
  promo_in_use: 'admin.error.promoInUse',
  email_taken: 'admin.error.emailTaken',
  confirm_mismatch: 'admin.error.confirmMismatch',
  not_configured: 'admin.error.notConfigured',
  forbidden: 'admin.lostRole',
  reauth_required: 'admin.error.reauth',
  unavailable: 'admin.error.unavailable',
  invalid_credentials: 'admin.reauth.wrong',
  payload_too_large: 'admin.error.tooLarge',
};

/** An admin-facing sentence for a failed request; the server's own message where we have none. */
export function errorText(e: unknown, t: AdminT): string {
  const err = toAdminError(e);
  if (err.code === 'rate_limited') return t('admin.error.rateLimited', { seconds: err.retryAfterSeconds ?? 60 });
  if (err.code === 'validation_failed' && err.fields) {
    const fields = Object.entries(err.fields)
      .map(([name, why]) => `${name} (${why.replace(/_/g, ' ')})`)
      .join(', ');
    return t('admin.error.validation', { fields });
  }
  if (err.code === 'internal') return t('admin.error.internal', { message: err.message });
  const key = ERROR_TEXT[err.code];
  return key ? t(key) : err.message || t('admin.error.generic');
}

export type ActionRequest<R> = {
  title: string;
  message?: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  icon?: IconName;
  /** A reason field (3–500 characters), wherever the API stores one. */
  reason?: boolean;
  reasonLabel?: string;
  /** The acting admin's password, checked by signing in again before the change. */
  password?: boolean;
  /** Type-to-confirm text (a public id, RESET). */
  requireText?: string;
  run: (values: { reason: string; password: string }) => Promise<R>;
  /** The toast after success. */
  success?: (result: R) => string;
  /** After the dialog closed (navigate, open a result dialog). */
  after?: (result: R) => void;
};

/**
 * Every admin mutation goes through here (backend-spec 7.7): a confirmation dialog (with a reason
 * or the admin's password where needed) whose button spins while the request runs, the error inline
 * in the dialog (the form stays), then a toast. Resolves with the result, or null when cancelled.
 */
export function useAdminAction() {
  const { t } = useI18n();
  const dialogs = useDialogs();
  const toast = useToast();
  const { offline } = useAdminContext();

  return useCallback(
    async <R>(req: ActionRequest<R>): Promise<R | null> => {
      if (offline) {
        toast.show({ id: 'admin-offline', message: t('admin.error.network'), icon: 'wifi-off' });
        return null;
      }
      let result: { value: R } | null = null;
      const values: ConfirmValues | null = await dialogs.confirm({
        title: req.title,
        message: req.message,
        confirmLabel: req.confirmLabel,
        cancelLabel: t('admin.common.cancel'),
        tone: req.tone,
        icon: req.icon,
        reasonRequired: req.reason,
        reasonLabel: req.reasonLabel ?? t('admin.common.reasonLabel'),
        requirePassword: req.password,
        requireText: req.requireText,
        onConfirm: async ({ reason, password }) => {
          try {
            if (req.password) {
              try {
                await confirmAdminPassword(password ?? '');
              } catch (e) {
                const err = toAdminError(e);
                throw new Error(err.code === 'invalid_credentials' ? t('admin.reauth.wrong') : errorText(err, t));
              }
            }
            result = { value: await req.run({ reason: reason ?? '', password: password ?? '' }) };
          } catch (e) {
            haptics.warning();
            throw e instanceof Error && !('code' in e) ? e : new Error(errorText(e, t));
          }
        },
      });
      if (!values || !result) return null;
      const done = result as { value: R };
      haptics.success();
      const message = req.success?.(done.value);
      if (message) toast.show({ message, icon: 'check-circle' });
      req.after?.(done.value);
      return done.value;
    },
    [dialogs, offline, t, toast],
  );
}

/** Copies text and confirms with a toast ("SW-7K3P-92QX copied"). */
export function useCopy() {
  const { t } = useI18n();
  const toast = useToast();
  return useCallback(
    (text: string, what?: string) => {
      void Clipboard.setStringAsync(text).then(() => {
        haptics.selection();
        toast.show({
          id: 'admin-copy',
          message: what ? t('admin.common.copiedWhat', { what }) : t('admin.common.copied'),
          icon: 'content-copy',
        });
      });
    },
    [t, toast],
  );
}

/**
 * The current time for rendering ("in 3 days", plan previews), kept in state so render stays pure;
 * it ticks every minute.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Queries that show a user somewhere, reloaded after every change to one. */
export const USER_CHANGED = ['user:', 'users', 'dashboard', 'audit', 'promo'];
