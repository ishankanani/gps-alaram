// Audit entries the admin has seen in this session (dashboard, user history, the audit log), so
// the entry sheet opens at once: the API has no GET for a single entry. Memory only. Pure.

import type { AuditEntry } from '../../../api/types';

const seen = new Map<number, AuditEntry>();
const MAX = 500;

export function rememberAudit(entries: readonly AuditEntry[] | undefined) {
  if (!entries) return;
  for (const e of entries) {
    seen.delete(e.id);
    seen.set(e.id, e);
  }
  while (seen.size > MAX) {
    const oldest = seen.keys().next().value;
    if (oldest === undefined) break;
    seen.delete(oldest);
  }
}

export function recallAudit(id: number): AuditEntry | undefined {
  return seen.get(id);
}

export function forgetAudit() {
  seen.clear();
}
