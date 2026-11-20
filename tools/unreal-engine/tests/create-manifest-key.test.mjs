// Runs create-manifest-key.sh against a fake `gh` on PATH. The shim records argv and stores
// what it receives on stdin in its own directory; nothing else may appear on disk.
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { signManifest } from '../sign-manifest.mjs';

const script = fileURLToPath(new URL('../create-manifest-key.sh', import.meta.url));
const available = process.platform !== 'win32' && ['bash', 'openssl', 'sha256sum'].every(tool => {
  try { execFileSync('sh', ['-c', 'command -v ' + tool], { stdio: 'ignore' }); return true; } catch { return false; }
});

const shim = `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$SHIM_DIR/calls.log"
case "$1 $2" in
  "api repos/solwation/lunden-3d-apartment/environments/signing") echo signing ;;
  "secret list") cat "$SHIM_DIR/secret-names" 2>/dev/null || true ;;
  "variable list")
    if [[ "$*" == *name,value* ]]; then cat "$SHIM_DIR/stdin-variable-$LUNDEN_SHIM_VARIABLE"
    else cat "$SHIM_DIR/variable-names" 2>/dev/null || true; fi ;;
  "secret set") cat > "$SHIM_DIR/stdin-secret-$3"; echo "$3" >> "$SHIM_DIR/secret-names" ;;
  "variable set") cat > "$SHIM_DIR/stdin-variable-$3"; echo "$3" >> "$SHIM_DIR/variable-names" ;;
  *) echo "unexpected gh $*" >&2; exit 9 ;;
esac
`;

async function tree(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true }))
    if (!entry.isDirectory()) out.push(join(entry.parentPath ?? entry.path, entry.name));
  return out.sort();
}

async function sandbox(t) {
  const root = await mkdtemp(join(tmpdir(), 'lunden-key-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dirs = Object.fromEntries(['bin', 'shim', 'work', 'tmp', 'home'].map(name => [name, join(root, name)]));
  await Promise.all(Object.values(dirs).map(dir => mkdir(dir)));
  await writeFile(join(dirs.bin, 'gh'), shim);
  await chmod(join(dirs.bin, 'gh'), 0o755);
  const run = (...args) => new Promise(resolve => execFile('bash', [script, ...args], {
    cwd: dirs.work, env: { PATH: dirs.bin + ':' + process.env.PATH, HOME: dirs.home, TMPDIR: dirs.tmp,
      SHIM_DIR: dirs.shim, LUNDEN_SHIM_VARIABLE: 'LUNDEN_MANIFEST_PUBLIC_KEY' } },
  (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr })));
  const calls = async () => (await readFile(join(dirs.shim, 'calls.log'), 'utf8')).trim().split('\n');
  const captured = name => readFile(join(dirs.shim, name), 'utf8');
  return { dirs, run, calls, captured };
}

test('store a fresh P-256 pair only through gh stdin and leave no other file', { skip: !available }, async t => {
  const { dirs, run, calls, captured } = await sandbox(t);
  const result = await run();
  assert.equal(result.code, 0, result.stderr);
  const privatePem = await captured('stdin-secret-LUNDEN_MANIFEST_PRIVATE_KEY');
  const publicPem = await captured('stdin-variable-LUNDEN_MANIFEST_PUBLIC_KEY');
  const key = createPrivateKey(privatePem);
  assert.equal(key.asymmetricKeyDetails.namedCurve, 'prime256v1');
  assert.equal(createPublicKey(key).export({ type: 'spki', format: 'pem' }).trim(), publicPem.trim());
  assert(publicPem.startsWith('-----BEGIN PUBLIC KEY-----'));
  assert.match(result.stdout, /Public key SPKI SHA-256: [\da-f]{64}/);
  assert(!result.stdout.includes('PRIVATE KEY') && !result.stderr.includes('PRIVATE KEY'));
  // The generated pair works with the release signer.
  const file = { url: 'https://fixture.invalid/a', size: 1, sha256: 'a'.repeat(64) };
  const manifest = Buffer.from(JSON.stringify({ formatVersion: 1, channel: 'test', published: '2026-11-21T08:00:00Z',
    app: { version: '0.1.0', contentAbi: 'x', minLauncher: '0.1.0', files: [{ path: 'Lunden/Binaries/Win64/Lunden-Win64-Shipping.exe', ...file }] },
    content: { version: 1, requiresAbi: 'x', packages: [] }, launcher: { version: '0.1.0', ...file } }));
  assert.equal(signManifest(manifest, privatePem, publicPem, 'test').length, 64);
  const log = await calls();
  assert.deepEqual(log.map(line => line.split(' ').slice(0, 2).join(' ')),
    ['api repos/solwation/lunden-3d-apartment/environments/signing', 'secret list', 'variable list', 'secret set', 'variable set', 'variable list']);
  assert(log.includes('secret set LUNDEN_MANIFEST_PRIVATE_KEY --env signing -R solwation/lunden-3d-apartment'));
  assert(log.includes('variable set LUNDEN_MANIFEST_PUBLIC_KEY -R solwation/lunden-3d-apartment'));
  assert(!log.join('\n').includes('PRIVATE KEY'), 'no key material on argv');
  for (const dir of [dirs.work, dirs.tmp, dirs.home, dirs.bin]) assert.deepEqual(await tree(dir), dir === dirs.bin ? [join(dirs.bin, 'gh')] : []);
  assert.deepEqual((await tree(dirs.shim)).map(path => path.slice(dirs.shim.length + 1)),
    ['calls.log', 'secret-names', 'stdin-secret-LUNDEN_MANIFEST_PRIVATE_KEY', 'stdin-variable-LUNDEN_MANIFEST_PUBLIC_KEY', 'variable-names']);

  // A second run refuses; --rotate replaces both values.
  const again = await run();
  assert.equal(again.code, 1);
  assert.match(again.stderr, /Refusing: .*already exists/);
  assert.equal((await calls()).filter(line => line.includes(' set ')).length, 2);
  const rotated = await run('--rotate');
  assert.equal(rotated.code, 0, rotated.stderr);
  assert.match(rotated.stderr, /Rotating/);
  assert.notEqual(await captured('stdin-secret-LUNDEN_MANIFEST_PRIVATE_KEY'), privatePem);
  assert.equal((await calls()).filter(line => line.includes(' set ')).length, 4);
});

test('dry run and a lone public variable store nothing', { skip: !available }, async t => {
  const { dirs, run, calls } = await sandbox(t);
  const dry = await run('--dry-run');
  assert.equal(dry.code, 0, dry.stderr);
  assert.match(dry.stdout, /Dry run: nothing was stored[\s\S]*-----BEGIN PUBLIC KEY-----/);
  assert(!dry.stdout.includes('PRIVATE KEY'));
  assert(!(await calls()).some(line => line.includes(' set ')));
  await writeFile(join(dirs.shim, 'variable-names'), 'LUNDEN_MANIFEST_PUBLIC_KEY\n');
  const refused = await run();
  assert.equal(refused.code, 1);
  assert(!(await calls()).some(line => line.includes(' set ')));
  assert.equal((await run('--bogus')).code, 2);
  for (const dir of [dirs.work, dirs.tmp, dirs.home]) assert.deepEqual(await tree(dir), []);
});
