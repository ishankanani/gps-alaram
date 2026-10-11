import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createPasswordHasher, decodeHash, isCommonPassword, passwordPolicyError,
} from '../src/domain/passwords.ts';
import { ApiError } from '../src/http/errors.ts';

const hasher = createPasswordHasher({ N: 1024, p: 1 });

describe('password hashing', () => {
  it('round-trips and rejects a wrong password', async () => {
    const h = await hasher.hash('correct horse battery');
    assert.equal(await hasher.verify('correct horse battery', h), true);
    assert.equal(await hasher.verify('correct horse batterY', h), false);
    assert.equal(await hasher.verify('correct horse battery', 'not a hash'), false);
  });

  it('uses the encoded format scrypt$v=1$N=…,r=8,p=…$salt$hash', async () => {
    const h = await hasher.hash('correct horse battery');
    assert.match(h, /^scrypt\$v=1\$N=1024,r=8,p=1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    const d = decodeHash(h);
    assert.deepEqual(d?.params, { N: 1024, r: 8, p: 1 });
    assert.equal(d?.salt.length, 16);
    assert.equal(d?.key.length, 32);
    // A different salt every time.
    assert.notEqual(h, await hasher.hash('correct horse battery'));
  });

  it('needsRehash after a parameter change', async () => {
    const h = await hasher.hash('correct horse battery');
    assert.equal(hasher.needsRehash(h), false);
    const stronger = createPasswordHasher({ N: 2048, p: 1 });
    assert.equal(stronger.needsRehash(h), true);
    // Verification still works with the stored parameters.
    assert.equal(await stronger.verify('correct horse battery', h), true);
  });

  it('normalizes with NFKC (and never trims)', async () => {
    const h = await hasher.hash('ｐａｓｓｗｏｒｄ ｚｅｂｒａ');
    assert.equal(await hasher.verify('password zebra', h), true);
    const spaced = await hasher.hash(' padded secret ');
    assert.equal(await hasher.verify('padded secret', spaced), false);
  });

  it('rejects tampered parameters instead of burning CPU', () => {
    assert.equal(decodeHash('scrypt$v=1$N=1048576,r=8,p=3$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), null);
    assert.equal(decodeHash('scrypt$v=1$N=1000,r=8,p=3$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), null);
  });

  it('verifies against the dummy hash for unknown emails', async () => {
    await hasher.verifyDummy('whatever');
  });

  it('runs at most 2 at once, queues 50 and then answers unavailable', async () => {
    const slow = createPasswordHasher({ N: 16384, p: 1, maxConcurrent: 2, maxQueue: 3 });
    const results = await Promise.allSettled(Array.from({ length: 7 }, () => slow.hash('correct horse battery')));
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(rejected.length, 2);
    for (const r of rejected) {
      const err = (r as PromiseRejectedResult).reason as ApiError;
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 503);
      assert.equal(err.code, 'unavailable');
    }
    assert.deepEqual(slow.stats(), { running: 0, queued: 0 });
  });
});

describe('password policy', () => {
  it('length 8–128 code points, 12 for admins', () => {
    assert.equal(passwordPolicyError('short12', null), 'too_short');
    assert.equal(passwordPolicyError('eight ch', null), null);
    assert.equal(passwordPolicyError('x'.repeat(129), null), 'too_long');
    assert.equal(passwordPolicyError('😀'.repeat(128), null), null);
    assert.equal(passwordPolicyError('eleven char', null, { admin: true }), 'too_short');
    assert.equal(passwordPolicyError('twelve chars', null, { admin: true }), null);
  });

  it('refuses common passwords (case-insensitive)', () => {
    assert.equal(isCommonPassword('password'), true);
    assert.equal(passwordPolicyError('PASSWORD123', null), 'too_common');
    assert.equal(passwordPolicyError('stopwake2026', null), 'too_common');
    assert.equal(passwordPolicyError('demo-password-2026', null), null);
    assert.equal(passwordPolicyError('StopWake-admin-2026', null, { admin: true }), null);
  });

  it('refuses the email and its local part', () => {
    assert.equal(passwordPolicyError('lena.weber@example.com', 'lena.weber@example.com'), 'same_as_email');
    assert.equal(passwordPolicyError('Lena.Weber', 'lena.weber@example.com'), 'same_as_email');
    assert.equal(passwordPolicyError('lena.weber2', 'lena.weber@example.com'), null);
  });
});
