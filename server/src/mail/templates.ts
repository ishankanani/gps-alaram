/**
 * Mail templates (spec 6.6), plain text UTF-8. The language is users.language with English as
 * the fallback; the translation pass adds the other ten languages to TEMPLATES.
 */
import type { ApiLang } from '../../../src/api/types.ts';

export type MailKind = 'reset_code' | 'password_changed' | 'email_changed';
export const MAIL_KINDS: readonly MailKind[] = ['reset_code', 'password_changed', 'email_changed'];

export type MailVars = {
  supportEmail: string;
  /** reset_code: XXXX-XXXX */
  code?: string;
  /** reset_code: minutes until the code expires (30 for email codes). */
  minutes?: number;
  /** email_changed: the new address, masked (l***@example.com). */
  newEmailMasked?: string;
};

export type RenderedMail = { subject: string; text: string };
type Template = (v: MailVars) => RenderedMail;

const lines = (...l: string[]): string => l.join('\n');

const EN: Record<MailKind, Template> = {
  reset_code: (v) => ({
    subject: `Your StopWake reset code: ${v.code ?? ''}`,
    text: lines(
      'Hello,',
      '',
      `your StopWake password reset code is: ${v.code ?? ''}`,
      '',
      `Enter it in the app to choose a new password. The code expires in ${v.minutes ?? 30} minutes.`,
      '',
      'If you did not ask for this, ignore this email. Your password stays the same.',
      '',
      `Questions? Write to ${v.supportEmail}.`,
      '',
      'StopWake',
    ),
  }),
  password_changed: (v) => ({
    subject: 'Your StopWake password was changed',
    text: lines(
      'Hello,',
      '',
      'the password of your StopWake account was just changed, and your other devices were signed out.',
      '',
      `If this was not you, reset your password in the app (Account → Sign in → Forgot password) and write to ${v.supportEmail}.`,
      '',
      'StopWake',
    ),
  }),
  email_changed: (v) => ({
    subject: 'Your StopWake email address was changed',
    text: lines(
      'Hello,',
      '',
      `the email address of your StopWake account was changed to ${v.newEmailMasked ?? 'a new address'}.`,
      'This is the last message we send to this address.',
      '',
      `If this was not you, write to ${v.supportEmail} right away.`,
      '',
      'StopWake',
    ),
  }),
};

export const TEMPLATES: Partial<Record<ApiLang, Partial<Record<MailKind, Template>>>> = { en: EN };

export function renderMail(kind: MailKind, lang: ApiLang | null, vars: MailVars): RenderedMail {
  const t = (lang ? TEMPLATES[lang]?.[kind] : undefined) ?? EN[kind];
  return t(vars);
}
