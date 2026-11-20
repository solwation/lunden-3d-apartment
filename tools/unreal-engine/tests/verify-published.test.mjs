import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { readVerifiedManifest, validateReleaseManifest, verifyPublished } from '../verify-published.mjs';

const cli = fileURLToPath(new URL('../verify-published.mjs', import.meta.url));
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const signed = bytes => sign('sha256', bytes, { key: privateKey, dsaEncoding: 'ieee-p1363' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = { '/game': 'program', '/pak': 'four', '/launcher': 'launcher' };
const projectExe = 'Lunden/Binaries/Win64/Lunden-Win64-Shipping.exe';

function fixture(base) {
  const item = (url, path) => ({ ...(path ? { path } : {}), url: base + url, sha256: hash(files[url]), size: files[url].length });
  return {
    formatVersion: 1, published: '2026-11-20T18:00:00.000Z', channel: 'test',
    app: { version: '0.1.0', contentAbi: 'test-abi', minLauncher: '1.0', files: [item('/game', projectExe)] },
    content: { version: 2, requiresAbi: 'test-abi', packages: [{ id: 'zone', files: [
      item('/pak', 'a/zone.pak'), item('/pak', 'b/zone.pak')
    ] }] }, launcher: { version: '1.0.0', ...item('/launcher') }
  };
}

function read(manifest, channel = 'test') {
  const bytes = Buffer.from(JSON.stringify(manifest));
  return readVerifiedManifest(bytes, signed(bytes), pem, channel);
}

test('read exactly signed bytes and reject invalid metadata before downloads', async t => {
  const value = fixture('http://127.0.0.1');
  assert.deepEqual(read(value), value);
  validateReleaseManifest(value, 'test');
  const bytes = Buffer.from(JSON.stringify(value));
  assert.throws(() => readVerifiedManifest(Buffer.concat([bytes, Buffer.from(' ')]), signed(bytes), pem, 'test'), /signature/);
  assert.throws(() => readVerifiedManifest(bytes, sign('sha256', bytes, privateKey), pem, 'test'), /signature/);
  assert.throws(() => readVerifiedManifest(bytes, signed(bytes), privateKey.export({ type: 'pkcs8', format: 'pem' }), 'test'), /public SPKI/);
  const duplicate = Buffer.from(JSON.stringify(value).replace('"channel":', '"chan\\u006eel":"test","channel":'));
  assert.throws(() => readVerifiedManifest(duplicate, signed(duplicate), pem, 'test'), /Duplicate JSON property/);
  const nonIntegerSyntax = Buffer.from(JSON.stringify(value).replace('"size":7', '"size":7.0'));
  assert.throws(() => readVerifiedManifest(nonIntegerSyntax, signed(nonIntegerSyntax), pem, 'test'), /decimal integer/);
  assert.throws(() => read(value, 'stable'), /channel/);
  const stock = JSON.parse(await readFile(new URL('../../../unreal/Launcher/Unreal-5.8.4-win64.json', import.meta.url)));
  const stockManifest = structuredClone(value);
  const example = value.app.files[0];
  stockManifest.app.files = stock.map(v => ({ ...example, path: v.path, sha256: v.sha256, url: example.url + '/' + v.sha256 }));
  stockManifest.content.packages[0].files[0].path = 'Lunden/Content/Paks/content.pak';
  assert.deepEqual(read(stockManifest), stockManifest);
  stockManifest.app.files[0].sha256 = '0'.repeat(64);
  assert.throws(() => read(stockManifest), /stock Unreal binary/);
  for (const [label, change, expected] of [
    ['schema', m => delete m.launcher.size, /missing required/],
    ['ABI', m => { m.content.requiresAbi = 'other'; }, /ABI/],
    ['publication date', m => { m.published = '2026-02-30T00:00:00Z'; }, /timestamp/],
    ['old launcher', m => { m.app.minLauncher = '1.1'; }, /too old/],
    ['package ID', m => m.content.packages.push(m.content.packages[0]), /package ID/],
    ['Windows alias', m => { m.content.packages[0].files[1].path = 'A/Zone.pak'; }, /Duplicate Windows/],
    ['reserved name', m => { m.content.packages[0].files[0].path = 'NUL.pak'; }, /Windows path/],
    ['file ancestor', m => { m.content.packages[0].files[1].path = 'a'; }, /directory/],
    ['entry point', m => { m.app.files[0].path = 'Game.exe'; }, /entry point/],
    ['conflicting sizes', m => { m.content.packages[0].files[1].size++; }, /Conflicting/],
    ['conflicting digests', m => { m.content.packages[0].files[1].sha256 = '0'.repeat(64); }, /Conflicting/],
    ['URL with credentials', m => { m.launcher.url = 'https://user@invalid.test/file'; }, /credentials/],
    ['external HTTP', m => { m.launcher.url = 'http://127.invalid.test/file'; }, /loopback/],
    ['moving asset', m => { m.launcher.url = 'https://github.com/owner/repo/releases/latest/download/file'; }, /versioned/]
  ]) await t.test(label, () => {
    const modified = structuredClone(value);
    change(modified);
    assert.throws(() => read(modified), expected);
  });
});

test('anonymous streamed delivery, unique URLs, errors and CLI exit status', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lunden-2248-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const requests = [];
  let failure = '';
  const server = createServer((request, response) => {
    requests.push([request.url, request.method, request.headers.authorization, request.headers.cookie]);
    if (request.url === '/launcher' && failure !== 'missing') {
      response.writeHead(302, { location: '/bytes' }).end();
      return;
    }
    const route = request.url === '/bytes' ? '/launcher' : request.url;
    if (!(route in files) || failure === 'missing' && route === '/launcher') {
      response.writeHead(404).end();
      return;
    }
    const data = route !== '/launcher' ? files[route] : ({ hash: 'LAUNCHER', short: 's', long: '123456789' }[failure] ?? files[route]);
    response.write(data.slice(0, 1)); // chunked, no advertised Content-Length
    setImmediate(() => response.end(data.slice(1)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const manifest = fixture('http://127.0.0.1:' + server.address().port);
  const paths = { channel: 'test', manifest: join(directory, 'release.json'),
    signature: join(directory, 'release.json.sig'), publicKey: join(directory, 'public.pem') };
  const data = Buffer.from(JSON.stringify(manifest));
  await Promise.all([writeFile(paths.manifest, data), writeFile(paths.signature, signed(data)), writeFile(paths.publicKey, pem)]);
  assert.deepEqual(await verifyPublished(paths), { objects: 3, bytes: 19n });
  assert.deepEqual(requests.map(r => r[0]), ['/game', '/pak', '/launcher', '/bytes']);
  assert(requests.every(([, method, auth, cookie]) => method === 'GET' && auth === undefined && cookie === undefined));

  const args = [cli, '--channel', 'test', '--manifest', paths.manifest, '--signature', paths.signature, '--public-key', paths.publicKey];
  const run = () => promisify(execFile)(process.execPath, args);
  assert.match((await run()).stdout, /3 unique objects, 19 bytes/);
  for (const [scenario, expected] of [['hash', /SHA-256/], ['short', /Size/], ['long', /Size/], ['missing', /HTTP 404/]]) {
    failure = scenario;
    await assert.rejects(run(), e => e.code === 1 && expected.test(e.stderr));
  }
  requests.length = 0;
  await writeFile(paths.signature, Buffer.alloc(64));
  await assert.rejects(run(), e => e.code === 1 && /signature/.test(e.stderr));
  assert.equal(requests.length, 0);
});
