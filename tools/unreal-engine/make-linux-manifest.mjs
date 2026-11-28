// #2422: Linux archive adapter for the same P-256 manifest/update protocol.
// Only produces a draft and upload plan; signing and publishing stay protected operations.
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { draft } from './make-manifest.mjs';
import { readVerifiedManifest } from './verify-published.mjs';

const runtime = 'Engine/Binaries/Linux/UnrealGame-Linux-Shipping';
const check = (ok, message) => { if (!ok) throw Error(message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function elfX64(bytes) {
  return bytes.length >= 20 && bytes.subarray(0, 7).equals(Buffer.from([127, 69, 76, 70, 2, 1, 1]))
    && bytes[18] === 62 && bytes[19] === 0;
}

function groupFor(name) {
  if (!name.startsWith('Lunden/Content/Paks/')) return null;
  const container = name.slice('Lunden/Content/Paks/'.length);
  if (/^global\.(utoc|ucas)$/.test(container)) return 'global';
  if (/^Lunden-Linux(?:\.(?:pak|utoc|ucas|sig)|_s[1-9]\d*\.ucas)$/.test(container)) return 'base';
  const chunk = /^pakchunk(0|[1-9]\d*)-Linux(?:\.(?:pak|utoc|ucas|sig)|_s[1-9]\d*\.ucas)$/.exec(container);
  check(chunk, 'Unknown Linux IoStore container: ' + name);
  return 'chunk-' + chunk[1];
}

export async function inspectLinuxFile(filename) {
  const file = await open(filename, 'r');
  try {
    const before = await file.stat({ bigint: true }), head = Buffer.alloc(20);
    check(before.isFile() && before.size < 2n ** 31n, 'Release assets must be regular files smaller than 2 GiB.');
    const { bytesRead } = await file.read(head, 0, 20, 0), digest = createHash('sha256');
    for await (const data of file.createReadStream({ start: 0, autoClose: false })) digest.update(data);
    const after = await file.stat({ bigint: true }), named = await lstat(filename, { bigint: true });
    check(named.isFile() && !named.isSymbolicLink() && before.dev === named.dev && before.ino === named.ino
      && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs, 'Release file changed during hashing.');
    const executable = elfX64(head.subarray(0, bytesRead));
    check(!(head[0] === 127 && head[1] === 69 && head[2] === 76 && head[3] === 70) || executable,
      'Only Linux ELF x86_64 program binaries are supported.');
    check(head[0] !== 77 || head[1] !== 90, 'Windows PE binary in Linux archive.');
    return { size: Number(before.size), sha256: digest.digest('hex'), ...(executable ? { executable: true } : {}) };
  } finally { await file.close(); }
}

export async function scanLinuxArchive(directory) {
  const root = path.resolve(directory), files = [], names = new Set();
  // Never traverse symlinked parents or entries in release input.
  for (let p = root; p !== path.dirname(p); p = path.dirname(p))
    check(!(await lstat(p)).isSymbolicLink(), 'Linked Linux archive root.');
  async function visit(relative) {
    for (const name of (await readdir(path.join(root, relative))).sort()) {
      const local = relative ? relative + '/' + name : name, absolute = path.join(root, local);
      check(/^[A-Za-z0-9._ -]{1,255}$/.test(name) && !/[. ]$/.test(name)
        && name !== '.' && name !== '..' && !names.has(local.toLowerCase()), 'Invalid or duplicate release path: ' + local);
      names.add(local.toLowerCase());
      const stat = await lstat(absolute);
      check(!stat.isSymbolicLink(), 'Linked Linux archive entry: ' + local);
      if (stat.isDirectory()) { await visit(local); continue; }
      check(stat.isFile(), 'Special Linux archive entry: ' + local);
      if (local === 'build-info.json' || /^Manifest_(?:NonUFSFiles|UFSFiles|DebugFiles)_Linux\.txt$/.test(local)) continue;
      check(!/\.(exe|dll)$/i.test(local) && !local.split('/').some(p => ['Win64', 'Windows'].includes(p)), 'Windows file in Linux archive.');
      files.push({ path: local, group: groupFor(local), ...await inspectLinuxFile(absolute) });
    }
  }
  await visit('');
  check(files.some(f => f.path === runtime && f.executable), 'Missing ELF x86_64 Linux Shipping runtime.');
  check(files.some(f => f.group === 'base') !== files.some(f => f.group === 'chunk-0'), 'Expected exactly one stock or chunked Linux base.');
  const groups = new Set(files.map(f => f.group).filter(Boolean));
  check(groups.has('global'), 'Missing global Linux IoStore container.');
  for (const group of groups)
    for (const ext of group === 'global' ? ['utoc', 'ucas'] : ['utoc', 'ucas', 'pak'])
      check(files.some(f => f.group === group && f.size > 0 && f.path.endsWith('.' + ext) && !/_s\d+\.ucas$/.test(f.path)),
        'Incomplete Linux container: ' + group + '.' + ext);
  return files;
}

export async function generateLinux(options) {
  const { archive, launcherDir, publicKey, previous, out } = options;
  const info = JSON.parse(await readFile(path.join(archive, 'build-info.json')));
  const record = JSON.parse(await readFile(path.join(launcherDir, 'launcher-build-linux.json')));
  const key = await readFile(publicKey, 'utf8');
  check(/^-----BEGIN PUBLIC KEY-----[\s\S]*-----END PUBLIC KEY-----\s*$/.test(key) && !key.includes('PRIVATE'), 'Expected public SPKI key.');
  check(info.platform === 'linux-x64' && info.commit === options.archiveCommit && /^[a-f0-9]{40}$/.test(info.commit)
    && /^[a-f0-9]{40}$/.test(info.releaseScriptBlob) && info.engineVersion === '5.8.4'
    && info.appVersion === options.appVersion && info.contentVersion === options.contentVersion
    && info.runtime?.path === runtime && info.import?.gate === 'passed', 'Linux archive completion/provenance mismatch.');
  check(record.platform === 'linux-x64' && record.commit === options.launcherCommit && /^[a-f0-9]{40}$/.test(record.commit)
    && record.manifestPublicKeySha256 === hash(key) && record.version === options.launcherVersion,
    'Linux launcher completion/provenance mismatch.');
  const binary = await inspectLinuxFile(path.join(launcherDir, 'Lunden'));
  check(binary.executable && binary.sha256 === record.sha256, 'Linux launcher bytes differ from completed build.');
  const files = await scanLinuxArchive(archive);
  check(files.find(f => f.path === runtime).sha256 === info.runtime.sha256, 'Linux runtime completion hash differs.');
  const prior = previous ? readVerifiedManifest(await readFile(previous), await readFile(previous + '.sig'), key, options.channel, 'linux-x64') : undefined;
  const launcher = { version: options.launcherVersion, size: binary.size, sha256: binary.sha256,
    url: `https://github.com/solwation/lunden-3d-apartment/releases/download/${options.tag}/Lunden-linux-x64` };
  const result = draft(files, launcher, { ...options, platform: 'linux-x64' }, prior);
  Object.assign(result.plan, { archiveCommit: info.commit, launcherCommit: record.commit, platform: 'linux-x64' });
  const destination = path.resolve(out);
  for (const input of [archive, launcherDir]) {
    const relative = path.relative(path.resolve(input), destination);
    check(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative),
      'Write the draft outside both input directories.');
  }
  await mkdir(destination);
  const name = `lunden-manifest-linux-x64${options.channel === 'test' ? '-test' : ''}.json`;
  try {
    await writeFile(path.join(destination, 'upload-plan.json'), JSON.stringify(result.plan, null, 2) + '\n', { flag: 'wx' });
    await writeFile(path.join(destination, name + '.tmp'), JSON.stringify(result.manifest, null, 2) + '\n', { flag: 'wx' });
    await rename(path.join(destination, name + '.tmp'), path.join(destination, name));
  } catch (e) { await rm(destination, { force: true, recursive: true }); throw e; }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const keys = ['archive', 'launcher-dir', 'public-key', 'previous', 'out', 'archive-commit', 'launcher-commit',
    'launcher-version', 'app-version', 'content-version', 'min-launcher', 'tag', 'channel', 'published'];
  const { values } = parseArgs({ options: Object.fromEntries(keys.map(k => [k, { type: 'string' }])) });
  for (const k of keys.filter(k => k !== 'previous')) check(values[k], 'Missing --' + k);
  check(/^(0|[1-9]\d*)$/.test(values['content-version']), 'Invalid --content-version.');
  const options = Object.fromEntries(Object.entries(values).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v]));
  options.contentVersion = Number(options.contentVersion);
  await generateLinux(options);
}
