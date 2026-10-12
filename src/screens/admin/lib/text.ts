// The translator the admin helpers take. Admin texts are English only (src/i18n/en/admin.ts); the
// screens pass useI18n().t, the tests a translator built from the English dictionary. Pure.

import type { admin } from '../../../i18n/en/admin';

export type AdminKey = keyof typeof admin;
export type AdminParams = Record<string, string | number>;
export type AdminT = (key: AdminKey, params?: AdminParams) => string;

/** Fills {placeholders} the way src/i18n does. */
export function fill(text: string, params?: AdminParams): string {
  if (!params) return text;
  let out = text;
  for (const [name, value] of Object.entries(params)) out = out.split(`{${name}}`).join(String(value));
  return out;
}
