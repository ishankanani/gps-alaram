// Audit entries as rows and detail sheets (ui-direction-a 4.3 "AdminAudit", ui-critiques "Admin:
// audit log"): an icon and tone per action, a sentence naming people by display name or public id
// (details never hold emails), a subtitle, and the before → after rows. Pure.

import type { AuditAction, AuditEntry, PaidPlan, PlanId } from '../../../api/types';
import { formatDate, toDate } from './format';
import type { AdminKey, AdminT } from './text';
import { PLAN_LABEL } from './users';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'accent';

/** MaterialCommunityIcons names, kept as strings so this module stays free of React Native. */
export function auditVisual(entry: Pick<AuditEntry, 'action' | 'details'>): { icon: string; tone: Tone } {
  const a = entry.action;
  switch (a) {
    case 'grant.create':
      return { icon: 'gift-outline', tone: 'success' };
    case 'grant.extend':
      return { icon: 'calendar-clock', tone: 'primary' };
    case 'grant.revoke':
      return { icon: 'close-octagon-outline', tone: 'danger' };
    case 'plan.change':
      return { icon: 'swap-horizontal', tone: 'primary' };
    case 'user.role':
      return { icon: 'shield-account-outline', tone: 'warning' };
    case 'user.disable':
      return { icon: 'account-cancel-outline', tone: 'danger' };
    case 'user.enable':
      return { icon: 'account-check', tone: 'success' };
    case 'user.delete':
      return { icon: 'delete-forever-outline', tone: 'danger' };
    case 'user.update':
      return { icon: 'account-edit-outline', tone: 'neutral' };
    case 'user.sign_out_all':
      return { icon: 'logout', tone: 'neutral' };
    case 'user.reset_code':
      return { icon: 'form-textbox-password', tone: 'neutral' };
    case 'user.sync':
      return { icon: 'sync', tone: 'primary' };
    case 'user.merge':
      return { icon: 'call-merge', tone: 'neutral' };
    case 'note.create':
    case 'note.update':
    case 'note.delete':
      return { icon: 'note-text-outline', tone: 'neutral' };
    case 'promo.create':
    case 'promo.update':
    case 'promo.delete':
      return { icon: 'ticket-percent-outline', tone: 'primary' };
    case 'price.update':
    case 'price.delete':
    case 'price.reset':
      return { icon: 'cash-multiple', tone: 'primary' };
    case 'settings.update':
      return { icon: 'application-cog-outline', tone: 'primary' };
    case 'store_event.retry':
      return { icon: 'webhook', tone: 'primary' };
    case 'admin.sign_in':
      return { icon: 'login', tone: 'neutral' };
    case 'admin.sign_in_failed':
      return { icon: 'shield-alert-outline', tone: 'warning' };
    case 'admin.bootstrap':
      return { icon: 'shield-crown-outline', tone: 'neutral' };
    default:
      return { icon: 'history', tone: 'neutral' };
  }
}

/** Who acted: the display name, else the label (SW-…), with env, cli and system spelled out. */
export function actorName(actor: AuditEntry['actor'], t: AdminT): string {
  if (actor.displayName) return actor.displayName;
  if (actor.label === 'env') return t('admin.audit.actor.env');
  if (actor.label === 'cli') return t('admin.audit.actor.cli');
  if (actor.label === 'system') return t('admin.audit.actor.system');
  return actor.label;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function planText(v: unknown, t: AdminT): string {
  return typeof v === 'string' && v in PLAN_LABEL ? t(PLAN_LABEL[v as PlanId]) : '—';
}

/** The row sentence: "Alex Admin gave Pro (Yearly) to SW-GN9N-BGG8". */
export function auditTitle(entry: AuditEntry, t: AdminT): string {
  const actor = actorName(entry.actor, t);
  const target = entry.target.label ?? t('admin.audit.someone');
  const d = entry.details ?? {};
  const p = { actor, target };
  switch (entry.action) {
    case 'grant.create':
      return t('admin.audit.title.grantCreate', { ...p, plan: planText(d.plan, t) });
    case 'grant.extend':
      return t('admin.audit.title.grantExtend', p);
    case 'grant.revoke':
      return t('admin.audit.title.grantRevoke', p);
    case 'plan.change':
      return t('admin.audit.title.planChange', { ...p, plan: planText(d.to, t) });
    case 'user.update':
      return t('admin.audit.title.userUpdate', p);
    case 'user.role':
      return t(d.after === 'admin' ? 'admin.audit.title.roleAdmin' : 'admin.audit.title.roleUser', p);
    case 'user.disable':
      return t('admin.audit.title.disable', p);
    case 'user.enable':
      return t('admin.audit.title.enable', p);
    case 'user.delete':
      return t(d.by === 'self' ? 'admin.audit.title.deleteSelf' : 'admin.audit.title.delete', p);
    case 'user.sign_out_all':
      return t('admin.audit.title.signOutAll', p);
    case 'user.reset_code':
      return t('admin.audit.title.resetCode', p);
    case 'user.sync':
      return t('admin.audit.title.sync', p);
    case 'user.merge':
      return t('admin.audit.title.merge', { ...p, from: str(d.fromPublicId) ?? t('admin.audit.someone') });
    case 'note.create':
      return t('admin.audit.title.noteCreate', p);
    case 'note.update':
      return t('admin.audit.title.noteUpdate', p);
    case 'note.delete':
      return t('admin.audit.title.noteDelete', p);
    case 'promo.create':
      return t('admin.audit.title.promoCreate', p);
    case 'promo.update':
      return t('admin.audit.title.promoUpdate', p);
    case 'promo.delete':
      return t('admin.audit.title.promoDelete', p);
    case 'price.update':
      return t('admin.audit.title.priceUpdate', { ...p, country: str(d.country) ?? target });
    case 'price.delete':
      return t('admin.audit.title.priceDelete', { ...p, country: str(d.country) ?? target });
    case 'price.reset':
      return t('admin.audit.title.priceReset', p);
    case 'settings.update':
      return t('admin.audit.title.settings', p);
    case 'store_event.retry':
      return t('admin.audit.title.storeRetry', p);
    case 'admin.sign_in':
      return t('admin.audit.title.signIn', p);
    case 'admin.sign_in_failed':
      return t('admin.audit.title.signInFailed', p);
    case 'admin.bootstrap':
      return t('admin.audit.title.bootstrap', p);
    default:
      return t('admin.audit.title.other', { ...p, action: entry.action });
  }
}

/** The second line: the reason in quotes, or a short summary of the details. */
export function auditSubtitle(entry: AuditEntry, t: AdminT): string {
  const d = entry.details ?? {};
  const reason = str(d.reason);
  const quoted = reason ? `“${reason}”` : null;
  switch (entry.action) {
    case 'grant.create': {
      const end = d.endsAt === null ? t('admin.time.forever') : formatDate(str(d.endsAt));
      return [t('admin.audit.sub.until', { date: end }), quoted].filter(Boolean).join(' · ');
    }
    case 'grant.extend':
      return [`${formatDate(str(d.before))} → ${formatDate(str(d.after))}`, quoted].filter(Boolean).join(' · ');
    case 'plan.change': {
      const end = d.to === 'free' ? null : d.endsAt === null ? t('admin.time.forever') : formatDate(str(d.endsAt));
      return [end ? t('admin.audit.sub.until', { date: end }) : null, quoted].filter(Boolean).join(' · ');
    }
    case 'user.update':
      return Array.isArray(d.fields) ? t('admin.audit.sub.fields', { fields: d.fields.map(String).join(', ') }) : '';
    case 'user.sign_out_all':
      return t('admin.audit.sub.sessions', { count: typeof d.revoked === 'number' ? d.revoked : 0 });
    case 'user.sync':
      return t(d.synced ? 'admin.audit.sub.synced' : 'admin.audit.sub.notSynced');
    case 'promo.create':
      return [str(d.code), typeof d.plan === 'string' ? planText(d.plan, t) : null].filter(Boolean).join(' · ');
    case 'promo.update':
    case 'price.update':
      return changedKeys(d).join(', ');
    case 'store_event.retry':
      return `${str(d.before) ?? '—'} → ${str(d.after) ?? '—'}`;
    case 'price.reset':
      return t('admin.audit.sub.removed', { count: typeof d.removed === 'number' ? d.removed : 0 });
    case 'settings.update':
      return Array.isArray(d.keys) ? d.keys.map(String).join(', ') : '';
    case 'admin.sign_in':
    case 'admin.sign_in_failed':
      return entry.ip ? t('admin.audit.sub.ip', { ip: entry.ip }) : '';
    default:
      return quoted ?? '';
  }
}

function changedKeys(d: Record<string, unknown>): string[] {
  const before = d.before && typeof d.before === 'object' ? (d.before as Record<string, unknown>) : {};
  const after = d.after && typeof d.after === 'object' ? (d.after as Record<string, unknown>) : {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** A details value for display: dates as dates, plans by name, null as a dash, objects as JSON. */
export function formatValue(key: string, v: unknown, t: AdminT): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return t(v ? 'admin.common.yes' : 'admin.common.no');
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    if (ISO.test(v) && toDate(v)) return formatDate(v);
    if ((key === 'plan' || key === 'to') && v in PLAN_LABEL) return t(PLAN_LABEL[v as PaidPlan]);
    return v;
  }
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ') : '—';
  return JSON.stringify(v);
}

export type DiffRow = { key: string; label: string; before?: string; after?: string; value?: string };

const DETAIL_LABEL: Partial<Record<string, AdminKey>> = {
  plan: 'admin.audit.key.plan',
  to: 'admin.audit.key.to',
  endsAt: 'admin.audit.key.endsAt',
  reason: 'admin.audit.key.reason',
  grantId: 'admin.audit.key.grantId',
  newGrantId: 'admin.audit.key.newGrantId',
  revokedGrantIds: 'admin.audit.key.revokedGrantIds',
  warnings: 'admin.audit.key.warnings',
  fields: 'admin.audit.key.fields',
  revoked: 'admin.audit.key.revoked',
  expiresAt: 'admin.audit.key.expiresAt',
  synced: 'admin.audit.key.synced',
  noteId: 'admin.audit.key.noteId',
  code: 'admin.audit.key.code',
  durationDays: 'admin.audit.key.durationDays',
  maxRedemptions: 'admin.audit.key.maxRedemptions',
  country: 'admin.audit.key.country',
  removed: 'admin.audit.key.removed',
  keys: 'admin.audit.key.keys',
  via: 'admin.audit.key.via',
  by: 'admin.audit.key.by',
  hadStoreSubscription: 'admin.audit.key.hadStore',
  eventId: 'admin.audit.key.eventId',
  created: 'admin.audit.key.created',
};

function labelOf(key: string, t: AdminT): string {
  const k = DETAIL_LABEL[key];
  return k ? t(k) : key;
}

/**
 * The detail sheet rows. `before`/`after` objects become one row per changed key ("Plan: Monthly →
 * Yearly"); grant.extend's before/after dates become "Ends"; every other key is a plain row.
 */
export function auditDiff(entry: AuditEntry, t: AdminT): DiffRow[] {
  const d = entry.details ?? {};
  const rows: DiffRow[] = [];
  const hasBefore = 'before' in d || 'after' in d;
  if (hasBefore) {
    const before = d.before;
    const after = d.after;
    const objects = (before === null || typeof before === 'object') && (after === null || typeof after === 'object');
    if (objects && !Array.isArray(before) && !Array.isArray(after)) {
      const b = (before ?? {}) as Record<string, unknown>;
      const a = (after ?? {}) as Record<string, unknown>;
      const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
      for (const key of keys) {
        if (JSON.stringify(b[key]) === JSON.stringify(a[key])) continue;
        rows.push({ key, label: labelOf(key, t), before: formatValue(key, b[key], t), after: formatValue(key, a[key], t) });
      }
      if (before === null && after === null) rows.push({ key: 'value', label: t('admin.audit.key.value'), before: '—', after: '—' });
    } else {
      const label = t(
        entry.action === 'grant.extend'
          ? 'admin.audit.key.endsAt'
          : entry.action === 'user.role'
            ? 'admin.audit.key.role'
            : entry.action === 'store_event.retry'
              ? 'admin.audit.key.status'
              : 'admin.audit.key.value',
      );
      rows.push({ key: 'change', label, before: formatValue('change', before, t), after: formatValue('change', after, t) });
    }
  }
  for (const [key, value] of Object.entries(d)) {
    if (key === 'before' || key === 'after') continue;
    rows.push({ key, label: labelOf(key, t), value: formatValue(key, value, t) });
  }
  return rows;
}

export type AuditFilter = 'all' | 'grant.' | 'plan.' | 'user.' | 'note.' | 'promo.' | 'price.' | 'settings.' | 'store_event.' | 'admin.';

export const AUDIT_FILTERS: readonly AuditFilter[] = ['all', 'grant.', 'plan.', 'user.', 'promo.', 'price.', 'settings.', 'note.', 'store_event.', 'admin.'];

export const AUDIT_FILTER_LABEL: Record<AuditFilter, AdminKey> = {
  all: 'admin.audit.filter.all',
  'grant.': 'admin.audit.filter.gifts',
  'plan.': 'admin.audit.filter.plans',
  'user.': 'admin.audit.filter.accounts',
  'note.': 'admin.audit.filter.notes',
  'promo.': 'admin.audit.filter.codes',
  'price.': 'admin.audit.filter.prices',
  'settings.': 'admin.audit.filter.settings',
  'store_event.': 'admin.audit.filter.store',
  'admin.': 'admin.audit.filter.signIns',
};

/** The audit filter chip for an action route param ("grant." or a full action like "user.disable"). */
export function auditFilterFor(action: string | undefined): AuditFilter {
  if (!action) return 'all';
  const prefix = `${action.split('.')[0]}.`;
  return (AUDIT_FILTERS as readonly string[]).includes(prefix) ? (prefix as AuditFilter) : 'all';
}

/** Actions that touch a user (the detail sheet offers "Open user"). */
export function isUserAction(action: AuditAction): boolean {
  return action.startsWith('user.') || action.startsWith('grant.') || action.startsWith('plan.') || action.startsWith('note.');
}
