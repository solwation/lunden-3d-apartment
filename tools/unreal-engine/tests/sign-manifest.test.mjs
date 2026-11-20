import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { fetchManifest, signManifest, uploadSignature } from '../sign-manifest.mjs';
import { readVerifiedManifest } from '../verify-published.mjs';

const cli = fileURLToPath(new URL('../sign-manifest.mjs', import.meta.url));
const run = promisify(execFile);
const pair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }), pem: publicKey.export({ type: 'spki', format: 'pem' }) };
};
const { privatePem, pem } = pair();
const other = pair();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const file = { url: 'https://fixture.invalid/game', size: 7, sha256: sha('program') };
const manifestFor = channel => Buffer.from(JSON.stringify({ formatVersion: 1, channel, published: '2026-11-21T08:00:00Z',
  app: { version: '0.1.0', contentAbi: 'abi', minLauncher: '0.1.0', files: [{ path: 'Lunden/Binaries/Win64/Lunden-Win64-Shipping.exe', ...file }] },
  content: { version: 3, requiresAbi: 'abi', packages: [{ id: 'zone', files: [{ path: 'Lunden/Content/Paks/zone.pak', ...file }] }] },
  launcher: { version: '0.1.0', ...file } }));
const manifest = manifestFor('test');

test('produce the launcher format: 64 raw P1363 bytes over the exact manifest bytes', () => {
  const signature = signManifest(manifest, privatePem, pem, 'test');
  assert.equal(signature.length, 64);
  assert(verify('sha256', manifest, { key: pem, dsaEncoding: 'ieee-p1363' }, signature));
  assert.equal(readVerifiedManifest(manifest, signature, pem, 'test').content.version, 3);
  const tampered = Buffer.from(manifest);
  tampered[tampered.indexOf('"version":3') + 10] = '4'.charCodeAt(0);
  assert.throws(() => readVerifiedManifest(tampered, signature, pem, 'test'), /signature/);
  assert.throws(() => readVerifiedManifest(Buffer.concat([manifest, Buffer.from('\n')]), signature, pem, 'test'), /signature/);
  assert.throws(() => readVerifiedManifest(manifest, signature, other.pem, 'test'), /signature/);
  // Optional C# cross-check: unreal/Launcher.Tests/NodeSignedManifestTests.cs reads these bytes.
  const out = process.env.LUNDEN_NODE_SIGNED_MANIFEST_DIR;
  if (out) return mkdir(out, { recursive: true }).then(() => Promise.all([
    writeFile(join(out, 'lunden-manifest-test.json'), manifest), writeFile(join(out, 'lunden-manifest-test.json.sig'), signature),
    writeFile(join(out, 'manifest-public.pem'), pem), writeFile(join(out, 'other-public.pem'), other.pem)]));
});

test('refuse wrong, foreign-curve or non-public keys and invalid manifests before keeping a signature', () => {
  assert.throws(() => signManifest(manifest, other.privatePem, pem, 'test'), /does not belong/);
  const p384 = generateKeyPairSync('ec', { namedCurve: 'P-384' });
  assert.throws(() => signManifest(manifest, p384.privateKey.export({ type: 'pkcs8', format: 'pem' }), pem, 'test'), /must be ECDSA P-256/);
  assert.throws(() => signManifest(manifest, privatePem, p384.publicKey.export({ type: 'spki', format: 'pem' }), 'test'), /P-256/);
  assert.throws(() => signManifest(manifest, privatePem, privatePem, 'test'), /public SPKI/);
  assert.throws(() => signManifest(manifest, undefined, pem, 'test'), /missing, encrypted/);
  const encrypted = generateKeyPairSync('ec', { namedCurve: 'P-256', privateKeyEncoding: { type: 'pkcs8', format: 'pem',
    cipher: 'aes-256-cbc', passphrase: 'x' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  assert.throws(() => signManifest(manifest, encrypted.privateKey, encrypted.publicKey, 'test'), /missing, encrypted/);
  const lines = privatePem.split('\n');
  const garbled = [lines[0], lines[1].slice(0, 40) + 'A'.repeat(lines[1].length - 40), ...lines.slice(2)].join('\n');
  assert.notEqual(garbled, privatePem);
  assert.throws(() => signManifest(manifest, garbled, pem, 'test'), error => !error.message.includes(lines[2].slice(0, 16)));
  assert.throws(() => signManifest(manifest, privatePem, pem, 'stable'), /channel/);
  assert.throws(() => signManifest(Buffer.from('{}'), privatePem, pem, 'test'), /missing required|formatVersion|schema/i);
});

test('CLI signs from the environment or stdin, never overwrites and writes no key', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'lunden-sign-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'lunden-manifest-test.json');
  await writeFile(path, manifest);
  const env = { ...process.env, LUNDEN_MANIFEST_PUBLIC_KEY: pem, LUNDEN_MANIFEST_PRIVATE_KEY: privatePem };
  const { stdout } = await run(process.execPath, [cli, 'sign', '--channel', 'test', '--manifest', path], { env });
  assert.match(stdout, /Signed lunden-manifest-test\.json \(test/);
  const first = await readFile(path + '.sig');
  assert(readVerifiedManifest(manifest, first, pem, 'test'));
  await assert.rejects(run(process.execPath, [cli, 'sign', '--channel', 'test', '--manifest', path], { env }), /EEXIST/);
  assert.deepEqual(await readFile(path + '.sig'), first);
  const child = execFile(process.execPath, [cli, 'sign', '--channel', 'test', '--manifest', path, '--out', join(dir, 'stdin.sig'),
    '--private-key-stdin'], { env: { ...process.env, LUNDEN_MANIFEST_PUBLIC_KEY: pem, LUNDEN_MANIFEST_PRIVATE_KEY: '' } });
  child.stdin.end(privatePem);
  assert.equal(await new Promise(done => child.on('exit', done)), 0);
  assert(readVerifiedManifest(manifest, await readFile(join(dir, 'stdin.sig')), pem, 'test'));
  await assert.rejects(run(process.execPath, [cli, 'sign', '--channel', 'test', '--manifest', path, '--out', join(dir, 'wrong.sig')],
    { env: { ...env, LUNDEN_MANIFEST_PRIVATE_KEY: other.privatePem } }), error => /does not belong/.test(error.stderr) &&
    !error.stderr.includes('PRIVATE KEY'));
  assert.deepEqual((await readdir(dir)).sort(), ['lunden-manifest-test.json', 'lunden-manifest-test.json.sig', 'stdin.sig']);
  for (const name of await readdir(dir)) assert(!(await readFile(join(dir, name), 'utf8')).includes('PRIVATE KEY'));
});

// Simulated GitHub release API for the Actions fetch → sign → upload path.
const prefix = '/repos/solwation/lunden-3d-apartment/releases';
function api(t, { latest = 7, tag = 'content-13', draft = true } = {}) {
  const asset = { id: 91, name: 'lunden-manifest-test.json', size: manifest.length, state: 'uploaded',
    digest: 'sha256:' + sha(manifest), updated_at: '2026-11-21T08:00:00Z' };
  const state = { requests: [], assets: [asset], releases: [{ id: 7, tag_name: 'content-12', draft: false }, { id: 8, tag_name: tag, draft }],
    blobs: new Map([[91, manifest]]), latest };
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    const method = options.method ?? 'GET';
    const headers = new Headers(options.headers);
    state.requests.push([method, url.host + url.pathname]);
    if (url.hostname === 'objects.fixture.invalid') {
      assert.equal(headers.get('Authorization'), null);
      return new Response(state.blobs.get(Number(url.pathname.slice(1))));
    }
    assert.equal(headers.get('Authorization'), 'Bearer fixture-token');
    if (method === 'POST') {
      assert.equal(url.href, `https://uploads.github.com${prefix}/8/assets?name=lunden-manifest-test.json.sig`);
      assert.equal(options.redirect, 'error');
      const body = Buffer.from(options.body);
      state.blobs.set(92, body);
      state.assets.push({ id: 92, name: url.searchParams.get('name'), size: body.length, state: 'uploaded' });
      return Response.json(state.assets.at(-1), { status: 201 });
    }
    assert.equal(method, 'GET');
    assert.equal(url.hostname, 'api.github.com');
    if (url.pathname === prefix) return Response.json(state.releases);
    if (url.pathname === prefix + '/latest') return Response.json({ id: state.latest });
    if (url.pathname === prefix + '/8/assets') return Response.json(state.assets);
    const id = /\/assets\/(\d+)$/.exec(url.pathname)?.[1];
    if (id) {
      assert.equal(headers.get('Accept'), 'application/octet-stream');
      assert.equal(options.redirect, 'manual');
      return new Response(null, { status: 302, headers: { location: 'https://objects.fixture.invalid/' + id } });
    }
    throw Error('Unmocked request: ' + url.href);
  });
  const writes = () => state.requests.filter(([method]) => method !== 'GET');
  return { state, writes };
}

test('fetch a draft manifest, sign without network access and upload only the verified .sig', async t => {
  const { state, writes } = api(t);
  const fetched = await fetchManifest({ tag: 'content-13', asset: 'lunden-manifest-test.json', token: 'fixture-token' });
  assert.deepEqual(fetched.bytes, manifest);
  assert.equal(fetched.state.id, 8);
  const signature = signManifest(fetched.bytes, privatePem, pem, fetched.state.channel);
  const result = await uploadSignature({ ...fetched, signature, publicKey: pem, token: 'fixture-token' });
  assert.deepEqual(result, { id: 8, asset: 'lunden-manifest-test.json.sig' });
  assert.deepEqual(writes(), [['POST', 'uploads.github.com' + prefix + '/8/assets']]);
  assert.deepEqual(state.blobs.get(92), signature);
});

test('refuse the latest release, an existing .sig, a changed asset, a foreign signature or an unknown asset', async t => {
  const token = 'fixture-token';
  await t.test('latest', async t => {
    const { writes } = api(t, { latest: 8, draft: false });
    await assert.rejects(fetchManifest({ tag: 'content-13', asset: 'lunden-manifest-test.json', token }), /latest/);
    assert.deepEqual(writes(), []);
  });
  await t.test('existing signature', async t => {
    const { state, writes } = api(t);
    state.assets.push({ id: 99, name: 'lunden-manifest-test.json.sig', size: 64, state: 'uploaded' });
    await assert.rejects(fetchManifest({ tag: 'content-13', asset: 'lunden-manifest-test.json', token }), /already exists/);
    assert.deepEqual(writes(), []);
  });
  await t.test('manifest replaced after fetch', async t => {
    const { state, writes } = api(t);
    const fetched = await fetchManifest({ tag: 'content-13', asset: 'lunden-manifest-test.json', token });
    const signature = signManifest(fetched.bytes, privatePem, pem, 'test');
    state.assets[0] = { ...state.assets[0], updated_at: '2026-11-21T09:00:00Z' };
    await assert.rejects(uploadSignature({ ...fetched, signature, publicKey: pem, token }), /changed after it was fetched/);
    assert.deepEqual(writes(), []);
  });
  await t.test('signature from another key', async t => {
    const { writes } = api(t);
    const fetched = await fetchManifest({ tag: 'content-13', asset: 'lunden-manifest-test.json', token });
    const signature = signManifest(fetched.bytes, other.privatePem, other.pem, 'test');
    await assert.rejects(uploadSignature({ ...fetched, signature, publicKey: pem, token }), /signature/);
    assert.deepEqual(writes(), []);
  });
  await t.test('asset name, tag and duplicate drafts', async t => {
    const { state } = api(t);
    await assert.rejects(fetchManifest({ tag: 'content-13', asset: 'other.json', token }), /manifest asset/);
    await assert.rejects(fetchManifest({ tag: 'main', asset: 'lunden-manifest-test.json', token }), /content-N/);
    state.releases.push({ id: 9, tag_name: 'content-13', draft: true });
    await assert.rejects(fetchManifest({ tag: 'content-13', asset: 'lunden-manifest-test.json', token }), /exactly one release/);
  });
});
