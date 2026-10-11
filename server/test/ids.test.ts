import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CROCKFORD, installIdHash, newPromoCode, newPublicId, newResetCode, newSessionToken, normalizePromoCode, normalizePublicId,
  normalizeResetCode, PUBLIC_ID_RE, resetCodeHash, sha256Hex, TOKEN_RE, uuidFrom,
} from '../src/domain/ids.ts';
import { tokenHash } from '../src/domain/sessions.ts';

describe('public ids', () => {
  it('use only the Crockford alphabet and the SW-XXXX-XXXX format', () => {
    assert.equal(CROCKFORD.length, 32);
    for (const c of 'ILOU') assert.ok(!CROCKFORD.includes(c));
    for (let i = 0; i < 500; i++) {
      const id = newPublicId();
      assert.match(id, PUBLIC_ID_RE);
      for (const c of id.replace(/^SW-/, '').replace('-', '')) assert.ok(CROCKFORD.includes(c), `${c} in ${id}`);
    }
  });

  it('normalize every accepted form', () => {
    const want = 'SW-7K3P-92QX';
    for (const input of ['sw 7k3p 92qx', 'SW7K3P92QX', '7K3P-92QX', '7k3p92qx', 'SW-7K3P-92QX', ' sw-7k3p-92qx ', 'ＳＷ７Ｋ３Ｐ９２ＱＸ']) {
      assert.equal(normalizePublicId(input), want, input);
    }
  });

  it('map O to 0 and I, L to 1', () => {
    assert.equal(normalizePublicId('SW-AP9M-O668'), 'SW-AP9M-0668');
    assert.equal(normalizePublicId('sw-n0np-gyzk'), 'SW-N0NP-GYZK');
    assert.equal(normalizePublicId('SWIL00-0000'), 'SW-1100-0000');
  });

  it('drop a SW prefix only from 10-character input', () => {
    // An 8-character body that itself starts with SW stays as it is.
    assert.equal(normalizePublicId('SWAB-CDEF'), 'SW-SWAB-CDEF');
    assert.equal(normalizePublicId('SW-SWAB-CDEF'), 'SW-SWAB-CDEF');
  });

  it('reject invalid input', () => {
    for (const input of ['', 'SW-7K3P', 'SW-7K3P-92QX-1', '7K3P92Q', 'SW-7K3P-92QU', '!!!', 'x'.repeat(200)]) {
      assert.equal(normalizePublicId(input), null, input);
    }
  });
});

describe('reset codes', () => {
  it('are XXXX-XXXX and normalize like public ids without a prefix', () => {
    for (let i = 0; i < 100; i++) assert.match(newResetCode(), /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    assert.equal(normalizeResetCode('k3p9-7xq2'), 'K3P97XQ2');
    assert.equal(normalizeResetCode(' K3P9 7XQ2 '), 'K3P97XQ2');
    assert.equal(normalizeResetCode('K3P9-7XQO'), 'K3P97XQ0');
    assert.equal(normalizeResetCode('SWK3P97XQ2'), null);
    assert.equal(normalizeResetCode('K3P9-7XQ'), null);
  });

  it('hash as sha256(userId:code)', () => {
    assert.equal(resetCodeHash('u1', 'K3P97XQ2'), sha256Hex('u1:K3P97XQ2'));
  });
});

describe('promo codes', () => {
  it('generated codes are XXXX-XXXX-XXXX', () => {
    for (let i = 0; i < 100; i++) assert.match(newPromoCode(), /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$/);
  });

  it('normalize words without the O/I/L mapping', () => {
    assert.equal(normalizePromoCode('welcome 2026'), 'WELCOME-2026');
    assert.equal(normalizePromoCode('  Welcome   2026  '), 'WELCOME-2026');
    assert.equal(normalizePromoCode('--stop--wake--'), 'STOP-WAKE');
    assert.equal(normalizePromoCode('Sommer_Aktion!'), 'SOMMERAKTION');
    assert.equal(normalizePromoCode('ＢＥＴＡ　ＴＥＳＴＥＲＳ'), 'BETA-TESTERS');
    assert.equal(normalizePromoCode('LOOI'), 'LOOI');
  });
});

describe('tokens and hashes', () => {
  it('session tokens are sw_ + 43 base64url characters, stored as sha256', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const t = newSessionToken();
      assert.match(t, TOKEN_RE);
      assert.equal(tokenHash(t), sha256Hex(t));
      assert.equal(tokenHash(t).length, 64);
      seen.add(t);
    }
    assert.equal(seen.size, 100);
  });

  it('install ids are stored as sha256("install:" + id)', () => {
    const id = '6f1d0c2e-8a7b-4c1e-9d3f-2b5a7c9e1f04';
    assert.equal(installIdHash(id), sha256Hex(`install:${id}`));
  });

  it('uuidFrom is deterministic and a v4 UUID', () => {
    const a = uuidFrom('demo:SW-7K3P-92QX');
    assert.equal(a, uuidFrom('demo:SW-7K3P-92QX'));
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(a, uuidFrom('demo:SW-9M39-CQ1Z'));
  });
});
