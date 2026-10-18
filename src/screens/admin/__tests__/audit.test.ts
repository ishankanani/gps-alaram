import { describe, expect, it } from 'vitest';

import type { AuditEntry } from '../../../api/types';
import { actorName, auditDiff, auditFilterFor, auditSubtitle, auditTitle, auditVisual } from '../lib/audit';
import { forgetAudit, recallAudit, rememberAudit } from '../lib/auditMemory';
import { t } from './t';

function entry(patch: Partial<AuditEntry>): AuditEntry {
  return {
    id: 7,
    at: new Date(2026, 9, 10, 14, 2).toISOString(),
    actor: { id: 'a1', label: 'SW-AP9M-0668', displayName: 'Alex Admin' },
    action: 'grant.create',
    target: { type: 'grant', id: '4', label: 'SW-GN9N-BGG8' },
    userId: 'u1',
    details: {},
    ip: '203.0.113.10',
    ...patch,
  };
}

describe('audit entries', () => {
  it('names people by display name or public id, never by email', () => {
    const e = entry({ details: { grantId: 4, plan: 'yearly', endsAt: new Date(2027, 8, 11).toISOString(), reason: 'Press review copy' } });
    expect(auditTitle(e, t)).toBe('Alex Admin gave Pro (Yearly) to SW-GN9N-BGG8');
    expect(auditSubtitle(e, t)).toBe('until 11 Sep 2027 · “Press review copy”');
    expect(auditVisual(e)).toEqual({ icon: 'gift-outline', tone: 'success' });
    expect(actorName({ id: null, label: 'cli', displayName: null }, t)).toBe('Command line');
    expect(auditTitle(entry({ actor: { id: 'x', label: 'SW-B80G-CJRN', displayName: null }, action: 'user.disable' }), t)).toBe(
      'SW-B80G-CJRN disabled SW-GN9N-BGG8',
    );
  });

  it('flags failed admin sign-ins', () => {
    const e = entry({ action: 'admin.sign_in_failed', details: {} });
    expect(auditVisual(e).tone).toBe('warning');
    expect(auditSubtitle(e, t)).toBe('From 203.0.113.10');
  });

  it('builds before → after rows', () => {
    const promo = entry({ action: 'promo.update', details: { before: { active: true, maxRedemptions: 100 }, after: { active: false, maxRedemptions: 100 } } });
    expect(auditDiff(promo, t)).toEqual([{ key: 'active', label: 'active', before: 'Yes', after: 'No' }]);
    const extend = entry({
      action: 'grant.extend',
      details: { grantId: 4, before: new Date(2026, 9, 10).toISOString(), after: new Date(2026, 10, 10).toISOString(), reason: 'x' },
    });
    const rows = auditDiff(extend, t);
    expect(rows[0]).toMatchObject({ label: 'Ends', before: '10 Oct 2026', after: '10 Nov 2026' });
    expect(rows.find((r) => r.key === 'reason')?.value).toBe('x');
    const role = entry({ action: 'user.role', details: { before: 'user', after: 'admin' } });
    expect(auditTitle(role, t)).toBe('Alex Admin made SW-GN9N-BGG8 an admin');
    expect(auditDiff(role, t)[0]).toMatchObject({ label: 'Role', before: 'user', after: 'admin' });
    const price = entry({ action: 'price.update', details: { country: 'PL', before: null, after: { currency: 'PLN', monthly: 899 } } });
    expect(auditDiff(price, t).filter((r) => r.before !== undefined)).toHaveLength(2);
  });

  it('maps action params to filter chips', () => {
    expect(auditFilterFor(undefined)).toBe('all');
    expect(auditFilterFor('grant.')).toBe('grant.');
    expect(auditFilterFor('user.disable')).toBe('user.');
    expect(auditFilterFor('nope')).toBe('all');
  });

  it('remembers entries seen in this session', () => {
    forgetAudit();
    rememberAudit([entry({ id: 1 }), entry({ id: 2 })]);
    expect(recallAudit(2)?.id).toBe(2);
    expect(recallAudit(3)).toBeUndefined();
  });
});
