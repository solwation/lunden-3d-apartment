import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readPublisherIdentity, releaseInputs } from '../launcher-release-inputs.mjs';

const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ type: 'spki', format: 'pem' });
const identity = readPublisherIdentity();

test('the reviewed publisher identity is the stable Artifact Signing identity observed on booster-ai', () => {
  assert.deepEqual(identity, {
    commonName: 'Svep Design Center AB', organization: 'Svep Design Center AB',
    rootSha256: '5367F20C7ADE0E2BCA790915056D086B720C33C1FA2A2661ACF787E3292E1270',
    identityKeyUsage: '1.3.6.1.4.1.311.97.113607477.134038250.983402513.388203704' });
});

test('release inputs bind the tag, stable publisher identity and canonical public P-256 key', () => {
  const good = releaseInputs('v0.1.23', identity, key);
  assert.equal(good.version, '0.1.23');
  assert.deepEqual(good.signer, identity);
  assert.equal(good.canonical, key);
  assert.equal(releaseInputs('v0.1.23', { ...identity, rootSha256: identity.rootSha256.toLowerCase() }, key.replaceAll('\n', '\r\n')).trust, good.trust);
  for (const [field, value] of [['commonName', 'Other AB'], ['organization', 'Other AB'], ['rootSha256', 'cd'.repeat(32)],
    ['identityKeyUsage', '1.3.6.1.4.1.311.97.1.2.3.4']])
    assert.notEqual(releaseInputs('v0.1.23', { ...identity, [field]: value }, key).trust, good.trust, field);
  assert.notEqual(releaseInputs('v0.1.24', identity, key).trust, good.trust);
});

test('missing or unrelated identity, key or release tag cannot produce signing inputs', () => {
  for (const tag of ['main', 'v', 'content-1', 'v01.2.3', 'v1.2.3-extra', 'v65535.0.0'])
    assert.throws(() => releaseInputs(tag, identity, key));
  const { commonName, ...withoutName } = identity;
  for (const invalid of [undefined, null, [], {}, withoutName, { ...identity, leafSha256: 'ab'.repeat(32) },
    { ...identity, commonName: '' }, { ...identity, organization: ' Svep Design Center AB' },
    { ...identity, rootSha256: 'a'.repeat(40) }, { ...identity, rootSha256: 'x'.repeat(64) },
    { ...identity, identityKeyUsage: '1.3.6.1.5.5.7.3.3' }, { ...identity, identityKeyUsage: '1.3.6.1.4.1.311.97.1.0' },
    { ...identity, identityKeyUsage: '1.3.6.1.4.1.311.97.01' }, { ...identity, identityKeyUsage: 'Svep' }])
    assert.throws(() => releaseInputs('v0.1.0', invalid, key));
  assert.ok(commonName);
  const other = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
  for (const invalid of [undefined, '', key + key, other.publicKey.export({ type: 'spki', format: 'pem' }),
    other.privateKey.export({ type: 'pkcs8', format: 'pem' })])
    assert.throws(() => releaseInputs('v0.1.0', identity, invalid));
});

test('a branch, or signing configuration that differs from the build, cannot prepare a release', () => {
  const root = mkdtempSync(join(tmpdir(), 'lunden-release-inputs-'));
  try {
    const destination = join(root, 'trust');
    const env = { ...process.env, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.4.2',
      GITHUB_OUTPUT: join(root, 'output'), LUNDEN_MANIFEST_PUBLIC_KEY: key };
    delete env.EXPECTED_BUILD_TRUST;
    delete env.SIGNING_EXPECTED_SUBJECT;
    const script = fileURLToPath(new URL('../launcher-release-inputs.mjs', import.meta.url));
    const run = overrides => spawnSync(process.execPath, [script, destination], { env: { ...env, ...overrides } }).status;
    assert.notEqual(run({ GITHUB_REF_TYPE: 'branch' }), 0);
    assert.notEqual(run({ EXPECTED_BUILD_TRUST: 'different' }), 0);
    assert.notEqual(run({ SIGNING_EXPECTED_SUBJECT: 'Svep Design Center' }), 0);
    assert.notEqual(run({ SIGNING_EXPECTED_SUBJECT: '' }), 0);
    assert.equal(existsSync(destination), false);
    assert.equal(run({ EXPECTED_BUILD_TRUST: releaseInputs('v0.4.2', identity, key).trust, SIGNING_EXPECTED_SUBJECT: identity.commonName }), 0);
    assert.equal(readFileSync(join(destination, 'manifest-public.pem'), 'utf8'), key);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
