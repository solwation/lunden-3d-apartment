import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { checkRelease, promoteCheckedRelease } from '../promote-release.mjs';

const tag = 'content-72';
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const sha = data => createHash('sha256').update(data).digest('hex');
const prefix = '/repos/solwation/lunden-3d-apartment/releases';
const candidate = { id: 37, tag_name: tag, draft: false, prerelease: false, published_at: '2026-11-20T12:00:00Z' };

function fixture(t) {
  const state = { previous: { id: 51, tag_name: 'content-70' }, target: { ...candidate },
    requests: [], candidateAssets: new Map(), previousAssets: new Map(), bodies: new Map(), objects: new Map() };
  function seedChannel(channel, previous = false) {
    const name = channel === 'stable' ? 'lunden-manifest.json' : 'lunden-manifest-test.json';
    const data = Buffer.from('fixture-' + channel);
    const url = 'https://fixture.invalid/' + channel;
    state.objects.set(url, data);
    const file = { url, size: data.length, sha256: sha(data) };
    const manifest = Buffer.from(JSON.stringify({ formatVersion: 1, channel, published: '2026-11-20T12:00:00Z',
      app: { version: '1.0', minLauncher: '1.0', contentAbi: 'x', files: [{ path: 'Lunden/Binaries/Win64/Lunden-Win64-Shipping.exe', ...file }] },
      content: { version: 72, requiresAbi: 'x', packages: [] }, launcher: { version: '1.0', ...file } }));
    const sig = sign('sha256', manifest, { key: privateKey, dsaEncoding: 'ieee-p1363' });
    const inventory = previous ? state.previousAssets : state.candidateAssets;
    for (const [asset, bytes] of [[name, manifest], [name + '.sig', sig]]) {
      inventory.set(asset, { name: asset, id: inventory.size + 1, size: bytes.length, digest: 'sha256:' + sha(bytes), state: 'uploaded' });
      if (!previous) state.bodies.set(asset, bytes);
    }
  }
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    const method = options.method ?? 'GET';
    const auth = new Headers(options.headers).get('Authorization');
    state.requests.push([method, url.href]);
    if (method === 'PATCH') {
      assert.equal(auth, 'Bearer fixture-token');
      assert.equal(options.redirect, 'error');
      assert.equal(url.hostname, 'api.github.com');
      assert.equal(url.pathname, prefix + '/37');
      assert.deepEqual(JSON.parse(options.body), { make_latest: 'true' });
      return Response.json(state.target);
    }
    assert.equal(method, 'GET');
    assert.equal(auth, null);
    assert.equal(options.credentials, 'omit');
    if (url.hostname === 'api.github.com') {
      if (url.pathname === prefix + '/tags/' + tag) return Response.json(state.target);
      if (url.pathname === prefix + '/latest') return state.previous ? Response.json(state.previous) : new Response(null, { status: 404 });
      if (url.pathname === prefix + '/37/assets') return Response.json([...state.candidateAssets.values()]);
      if (url.pathname === prefix + '/51/assets') return Response.json([...state.previousAssets.values()]);
    } else if (url.hostname === 'github.com') {
      assert(url.pathname.startsWith('/solwation/lunden-3d-apartment/releases/download/content-72/'));
      const bytes = state.bodies.get(url.pathname.split('/').at(-1));
      return new Response(bytes, { status: bytes ? 200 : 404 });
    } else if (url.hostname === 'fixture.invalid') {
      const bytes = state.objects.get(url.href);
      return new Response(bytes, { status: bytes ? 200 : 404 });
    }
    throw Error('Unmocked request: ' + url.href);
  });
  const dispatch = async () => {
    const checked = await checkRelease(tag, pem);
    return promoteCheckedRelease(tag, checked, 'fixture-token');
  };
  const writes = () => state.requests.filter(([method]) => method !== 'GET');
  return { state, seedChannel, dispatch, writes };
}

test('check both manifest pairs and every payload before the single PATCH to the checked ID', async t => {
  const { seedChannel, dispatch, writes, state } = fixture(t);
  for (const channel of ['test', 'stable']) {
    seedChannel(channel, true);
    seedChannel(channel);
  }
  await dispatch();
  assert.deepEqual(writes(), [['PATCH', 'https://api.github.com' + prefix + '/37']]);
  assert.deepEqual(state.requests.at(-1), writes()[0]);
  assert.deepEqual(state.requests.filter(([, url]) => url.startsWith('https://fixture.invalid/')),
    [['GET', 'https://fixture.invalid/stable'], ['GET', 'https://fixture.invalid/test']]);
});

test('first release may publish the test channel alone', async t => {
  const { state, seedChannel, dispatch, writes } = fixture(t);
  state.previous = null;
  seedChannel('test');
  await dispatch();
  assert.equal(writes().length, 1);
});

for (const channel of ['stable', 'test']) {
  test('preserve the existing ' + channel + ' channel', async t => {
    const { seedChannel, dispatch, writes } = fixture(t);
    seedChannel(channel, true);
    seedChannel(channel === 'test' ? 'stable' : 'test');
    await assert.rejects(dispatch(), /Missing published asset/);
    assert.deepEqual(writes(), []);
  });
}

test('missing file, invalid signature or incomplete pair prevents any write', async t => {
  const { state, seedChannel, dispatch, writes } = fixture(t);
  seedChannel('test');
  state.objects.clear();
  await assert.rejects(dispatch(), /HTTP 404/);
  seedChannel('test');
  const name = 'lunden-manifest-test.json.sig';
  const invalid = Buffer.alloc(64);
  state.bodies.set(name, invalid);
  state.candidateAssets.get(name).digest = 'sha256:' + sha(invalid);
  await assert.rejects(dispatch(), /Invalid P-256/);
  state.candidateAssets.delete(name);
  await assert.rejects(dispatch(), /Missing published asset/);
  assert.deepEqual(writes(), []);
});

test('changed inventory or latest release between jobs prevents the write', async t => {
  const { state, seedChannel, writes } = fixture(t);
  seedChannel('test');
  const checked = await checkRelease(tag, pem);
  state.candidateAssets.get('lunden-manifest-test.json').id += 100;
  await assert.rejects(promoteCheckedRelease(tag, checked, 'fixture-token'), /changed/);
  state.candidateAssets.get('lunden-manifest-test.json').id -= 100;
  state.previous = null;
  await assert.rejects(promoteCheckedRelease(tag, checked, 'fixture-token'), /changed/);
  assert.deepEqual(writes(), []);
});

test('reject unsafe tags before requests, and reject drafts and prereleases', async t => {
  const { state, seedChannel, dispatch, writes } = fixture(t);
  for (const name of ['../content-1', 'app-v1.0.0-beta', 'content-2\n', 'latest', 'content-1/2'])
    await assert.rejects(checkRelease(name, pem), /Expected app-v/);
  assert.equal(state.requests.length, 0);
  seedChannel('test');
  state.target.draft = true;
  await assert.rejects(dispatch(), /published full release/);
  state.target.draft = false;
  state.target.prerelease = true;
  await assert.rejects(dispatch(), /published full release/);
  assert.deepEqual(writes(), []);
});
