import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { releaseInputs } from '../launcher-release-inputs.mjs';

const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ type: 'spki', format: 'pem' });
const pin = 'ab'.repeat(32);

test('release inputs bind the tag, exact leaf certificate and canonical public P-256 key', () => {
  const good = releaseInputs('app-v0.1.23', pin, key);
  assert.equal(good.version, '0.1.23');
  assert.equal(good.signer, pin.toUpperCase());
  assert.equal(good.canonical, key);
  assert.equal(releaseInputs('app-v0.1.23', pin.toUpperCase(), key.replaceAll('\n', '\r\n')).trust, good.trust);
  assert.notEqual(releaseInputs('app-v0.1.23', 'cd'.repeat(32), key).trust, good.trust);
  assert.notEqual(releaseInputs('app-v0.1.24', pin, key).trust, good.trust);
});

test('missing or unrelated identity, key or release tag cannot produce signing inputs', () => {
  for (const tag of ['main', 'app-v', 'content-1', 'app-v01.2.3', 'app-v1.2.3-extra', 'app-v65535.0.0'])
    assert.throws(() => releaseInputs(tag, pin, key));
  for (const invalid of [undefined, '', 'a'.repeat(40), 'x'.repeat(64)])
    assert.throws(() => releaseInputs('app-v0.1.0', invalid, key));
  const other = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
  for (const invalid of [undefined, '', key + key, other.publicKey.export({ type: 'spki', format: 'pem' }),
    other.privateKey.export({ type: 'pkcs8', format: 'pem' })])
    assert.throws(() => releaseInputs('app-v0.1.0', pin, invalid));
});

test('a branch, or signing configuration that differs from the build, cannot prepare a release', () => {
  const root = mkdtempSync(join(tmpdir(), 'lunden-release-inputs-'));
  try {
    const destination = join(root, 'trust');
    const env = { ...process.env, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'app-v0.4.2',
      GITHUB_OUTPUT: join(root, 'output'), LUNDEN_SIGNER_SHA256: pin, LUNDEN_MANIFEST_PUBLIC_KEY: key };
    delete env.EXPECTED_BUILD_TRUST;
    const script = fileURLToPath(new URL('../launcher-release-inputs.mjs', import.meta.url));
    const run = overrides => spawnSync(process.execPath, [script, destination], { env: { ...env, ...overrides } }).status;
    assert.notEqual(run({ GITHUB_REF_TYPE: 'branch' }), 0);
    assert.notEqual(run({ EXPECTED_BUILD_TRUST: 'different' }), 0);
    assert.equal(existsSync(destination), false);
    assert.equal(run({ EXPECTED_BUILD_TRUST: releaseInputs('app-v0.4.2', pin, key).trust }), 0);
    assert.equal(readFileSync(join(destination, 'manifest-public.pem'), 'utf8'), key);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
