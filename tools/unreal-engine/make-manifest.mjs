// Generate local update manifests and a content-addressed upload plan from completed builds.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { releaseInputs } from './launcher-release-inputs.mjs';
import { readVerifiedManifest, validateReleaseManifest } from './verify-published.mjs';

const download = 'https://github.com/solwation/lunden-3d-apartment/releases/download/';
const inventory = JSON.parse(await readFile(new URL('../../unreal/Launcher/Unreal-5.8.4-win64.json', import.meta.url), 'utf8'));
const stockGame = 'Engine/Binaries/Win64/UnrealGame-Win64-Shipping.exe';
const maxAsset = 2 ** 31;
const signatureHelper = fileURLToPath(new URL('./get-signer-fingerprint.ps1', import.meta.url));
const ignore = new Set(['build-info.json', 'Manifest_NonUFSFiles_Win64.txt', 'Manifest_UFSFiles_Win64.txt', 'Manifest_DebugFiles_Win64.txt']);
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function check(ok, message) {
  if (!ok) throw new Error(message);
}

function version(value) {
  check(typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) &&
    value.split('.').every(part => Number(part) <= 65534), 'Expected a three-component Windows release version.');
  return value;
}

function safeName(name) {
  return /^[A-Za-z0-9._ -]{1,255}$/.test(name) && !/[. ]$/.test(name) &&
    !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name);
}

async function regularRoot(root) {
  const resolved = path.resolve(root);
  check((await lstat(resolved)).isDirectory() && (await realpath(resolved)) === resolved, 'Expected a directory without links: ' + resolved);
  return resolved;
}

async function inspectFile(filename, captureLimit = 0) {
  const before = await lstat(filename);
  check(before.isFile() && before.size < maxAsset, 'Expected a regular release asset smaller than 2 GiB: ' + filename);
  if (captureLimit) check(before.size <= captureLimit, 'Oversized metadata: ' + filename);
  const file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const start = await file.stat({ bigint: true });
    check(start.isFile() && start.size === BigInt(before.size), 'File changed while opening: ' + filename);
    const hash = createHash('sha256'), parts = [];
    let size = 0;
    for await (const data of file.createReadStream({ autoClose: false })) {
      hash.update(data);
      size += data.length;
      check(size < maxAsset && (!captureLimit || size <= captureLimit), 'Oversized asset: ' + filename);
      if (captureLimit) parts.push(data);
    }
    const end = await file.stat({ bigint: true }), named = await lstat(filename, { bigint: true });
    check(named.isFile() && start.dev === named.dev && start.ino === named.ino &&
      start.ctimeNs === end.ctimeNs && start.mtimeNs === end.mtimeNs && BigInt(size) === start.size,
    'File changed during hashing: ' + filename);
    return { size, sha256: hash.digest('hex'), bytes: captureLimit ? Buffer.concat(parts) : undefined };
  } finally { await file.close(); }
}

async function readSmall(filename, limit = 65536) {
  return (await inspectFile(filename, limit)).bytes;
}

// Only the UAT container names for the stock and chunked cooks are supported.
function groupFor(name) {
  if (!name.startsWith('Lunden/Content/Paks/')) return null;
  const container = name.slice('Lunden/Content/Paks/'.length);
  if (/^global\.(utoc|ucas)$/.test(container)) return 'global';
  if (/^Lunden-Windows(?:\.(?:pak|sig|utoc|ucas)|_s[1-9]\d*\.ucas)$/.test(container)) return 'base';
  const chunk = /^pakchunk(0|[1-9]\d*)-Windows(?:\.(?:pak|sig|utoc|ucas)|_s[1-9]\d*\.ucas)$/.exec(container);
  check(chunk, 'Unknown container in Lunden/Content/Paks: ' + name);
  return 'chunk-' + chunk[1];
}

export async function scanArchive(directory) {
  const root = await regularRoot(directory);
  const files = [], paths = new Set();
  async function visit(relative) {
    const dir = path.join(root, relative);
    const names = (await readdir(dir)).sort(compare);
    for (const name of names) {
      const local = relative ? relative + '/' + name : name;
      check(safeName(name) && !paths.has(local.toLowerCase()), 'Invalid or duplicate Windows path: ' + local);
      paths.add(local.toLowerCase());
      const absolute = path.join(root, local), stat = await lstat(absolute);
      check(!stat.isSymbolicLink() && await realpath(absolute) === absolute, 'Linked archive entry: ' + local);
      if (stat.isDirectory()) { await visit(local); continue; }
      check(stat.isFile(), 'Special archive entry: ' + local);
      if (ignore.has(local)) continue;
      const { size, sha256 } = await inspectFile(absolute);
      files.push({ path: local, size, sha256, group: groupFor(local) });
    }
  }
  await visit('');
  files.sort((left, right) => compare(left.path, right.path));
  const byPath = new Map(files.map(file => [file.path, file]));
  for (const trusted of inventory)
    check(byPath.get(trusted.path)?.sha256 === trusted.sha256.toLowerCase(), 'Unexpected or missing vendor binary: ' + trusted.path);
  for (const file of files.filter(f => /\.(exe|dll)$/i.test(f.path)))
    check(inventory.some(item => item.path === file.path), 'Unexpected program binary in this content-only cook: ' + file.path);
  check(files.some(file => file.group === 'base') !== files.some(file => file.group === 'chunk-0'), 'Expected exactly one stock or chunked base.');
  const groups = new Set(files.map(file => file.group).filter(Boolean));
  check(groups.has('global'), 'Missing global IoStore container.');
  for (const group of groups) {
    const members = files.filter(file => file.group === group);
    for (const ext of group === 'global' ? ['utoc','ucas'] : ['utoc','ucas','pak'])
      check(members.some(file => file.size > 0 && file.path.endsWith('.' + ext) && !/_s\d+\.ucas$/.test(file.path)), 'Incomplete ' + group + ' container: ' + ext);
  }
  return files;
}

async function verifyWindowsPublisher(filename, digest, pin) {
  check(process.platform === 'win32', 'Verify the protected signed-launcher artifact with Windows Node.js and Authenticode.');
  const pwsh = path.join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe');
  const shell = await lstat(pwsh).then(stat => stat.isFile(), () => false)
    ? pwsh : path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const leaf = execFileSync(shell, ['-NoProfile', '-NonInteractive', '-File', signatureHelper,
    '-Path', filename, '-ExpectedFileSha256', digest], { encoding: 'utf8' }).trim();
  check(leaf.toLowerCase() === pin.toLowerCase(), 'Unexpected Windows Authenticode publisher leaf.');
}

export async function inspectLauncher(directory, inputs, commit, distributionTag, verifyPublisher = verifyWindowsPublisher) {
  const distributionVersion = /^(?:app-)?v(.+)$/.exec(distributionTag)?.[1];
  version(distributionVersion);
  const root = await regularRoot(directory);
  const names = ['Lunden.exe', 'Lunden-Setup-' + inputs.version + '-win-x64.exe'];
  const record = JSON.parse(await readSmall(path.join(root, 'launcher-build.json')));
  check(/^[a-f\d]{40}$/i.test(commit) && record.commit.toLowerCase() === commit.toLowerCase() &&
    record.tag === 'v' + inputs.version && record.signerCertificateSha256.toUpperCase() === inputs.signer &&
    record.manifestPublicKeySha256.toLowerCase() === inputs.keyDigest, 'Signed launcher build provenance does not match the approved tag, commit or public trust anchors.');
  const sums = (await readSmall(path.join(root, 'SHA256SUMS'))).toString().trimEnd().split(/\r?\n/);
  check(sums.length === names.length, 'Unexpected number of launcher checksums.');
  let output;
  for (const [index, name] of names.entries()) {
    const { size, sha256 } = await inspectFile(path.join(root, name));
    check(size > 0 && sums[index] === sha256 + '  ' + name && record.launcherSha256 === sha256,
      'Signed-launcher checksum or installer copy mismatch: ' + name);
    if (index === 0) output = { version: inputs.version, size, sha256, url: download + distributionTag + '/Lunden.exe' };
  }
  await verifyPublisher(path.join(root, names[0]), output.sha256, inputs.signer);
  return output;
}

function immutableAsset(value) {
  if (typeof value !== 'string' || !value.startsWith(download)) return false;
  return /^(?:(?:app-)?v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)|content-(?:0|[1-9]\d*))\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value.slice(download.length));
}

export function draft(files, launcher, settings, previous) {
  const { appVersion, contentVersion, published, channel, tag, minLauncher } = settings;
  version(appVersion); version(minLauncher); version(launcher.version);
  check(['stable','test'].includes(channel) && Number.isInteger(contentVersion) && contentVersion >= 0 &&
    contentVersion <= 2147483647, 'Invalid release channel or content version.');
  check(typeof published === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(published) &&
    new Date(published).toISOString() === (published.includes('.') ? published : published.replace('Z','.000Z')), 'Supply an explicit UTC publication timestamp.');
  check(tag === 'app-v' + appVersion || tag === 'v' + appVersion || tag === 'content-' + contentVersion, 'Release tag must match the app or content version.');
  // The real B→C zone edit regenerated only AssetRegistry.bin in chunk 0's loose-file pak.
  // Deliver that pak atomically with the zone. Base IoStore and global files remain ABI inputs.
  files = [...files].sort((left, right) => compare(left.path, right.path));
  const program = files.filter(f => f.group === null || f.group === 'global' || f.group === 'base' ||
    f.group === 'chunk-0' && /\.(?:utoc|ucas)$/.test(f.path));
  const abi = 'sha256-v1-' + createHash('sha256').update(JSON.stringify(program.map(f => [f.path, f.size, f.sha256]))).digest('hex');
  const manifest = { formatVersion: 1, channel, published,
    app: { version: appVersion, contentAbi: abi, minLauncher, files: [] },
    content: { version: contentVersion, requiresAbi: abi, packages: [] }, launcher };
  const previousUrls = new Map();
  if (previous) {
    check(previous.channel === channel && Date.parse(previous.published) < Date.parse(published), 'Previous release must precede this release in the same channel.');
    const oldFiles = [...previous.app.files, ...previous.content.packages.flatMap(pkg => pkg.files)];
    for (const file of oldFiles) {
      check(immutableAsset(file.url), 'Previous release references an ineligible asset URL.');
      const key = file.sha256.toLowerCase() + ':' + file.size;
      if (!previousUrls.has(key)) previousUrls.set(key, file.url);
    }
  }
  if (tag.startsWith('content-'))
    check(previous && previous.app.version === appVersion && previous.app.contentAbi === abi && previous.content.version < contentVersion,
      'Content-only tags require a verified earlier manifest with unchanged program and base IoStore compatibility inputs.');
  const groups = new Map(), uploads = new Map(), mappings = [];
  for (const file of files) {
    const key = file.sha256 + ':' + file.size;
    const asset = 'sha256-' + file.sha256 + '.blob', reuse = previousUrls.get(key);
    const url = reuse ?? download + tag + '/' + asset;
    const entry = { path: file.path, url, size: file.size, sha256: file.sha256 };
    if (/\.(exe|dll)$/i.test(file.path)) entry.authenticode = true;
    if (file.group === null) manifest.app.files.push(entry);
    else {
      if (!groups.has(file.group)) groups.set(file.group, []);
      groups.get(file.group).push(entry);
    }
    mappings.push({ path: file.path, url });
    if (!reuse && !uploads.has(asset)) uploads.set(asset, { asset, source: file.path, size: file.size, sha256: file.sha256 });
  }
  manifest.content.packages = [...groups.keys()].sort(compare).map(id => ({ id, files: groups.get(id) }));
  validateReleaseManifest(manifest, channel);
  // app release also needs Lunden.exe, the setup, checksums, provenance and both channel manifest files.
  const signedArtifactsHere = launcher.url.startsWith(download + tag + '/') ? 4 : 0;
  check(uploads.size + signedArtifactsHere + 2 <= 1000, 'GitHub release exceeds the asset count limit.');
  return { manifest, plan: { tag, launcher: { source: 'Lunden.exe', ...launcher },
    uploads: [...uploads.values()].sort((a,b) => compare(a.asset,b.asset)), mappings } };
}

export async function generate(options) {
  const { archive, signedLauncher, publicKey, previous, out } = options;
  const key = (await readSmall(publicKey)).toString();
  const trust = releaseInputs(options.launcherTag, options.signerSha256, key);
  const archiveRoot = await regularRoot(archive), launcherRoot = await regularRoot(signedLauncher);
  const target = path.resolve(out);
  await regularRoot(path.dirname(target));
  for (const root of [archiveRoot, launcherRoot]) {
    const relative = path.relative(root, target);
    check(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'Write the output outside both input directories.');
  }
  // release.ps1 writes this completion marker only after checking the clean revision and Epic runtime.
  const info = JSON.parse(await readSmall(path.join(archiveRoot, 'build-info.json')));
  const epic = inventory.find(item => item.path === stockGame);
  check(info.commit.toLowerCase() === options.archiveCommit.toLowerCase() && info.appVersion === options.appVersion && info.contentVersion === options.contentVersion &&
    /^[a-f0-9]{40}$/i.test(info.commit) && /^[a-f0-9]{40}$/i.test(info.releaseScriptBlob) &&
    info.engineVersion === '5.8.4' && info.runtime?.path === stockGame &&
    info.runtime.sha256.toUpperCase() === epic.sha256 && info.runtime.publisher === epic.publisher,
  'Archive completion record does not match the requested versions and approved Epic runtime.');
  const signed = await inspectLauncher(launcherRoot, trust, options.launcherCommit, options.launcherReleaseTag);
  const prior = previous ? readVerifiedManifest(await readSmall(previous, 4 * 1024 * 1024),
    await readSmall(previous + '.sig', 64), key, options.channel) : undefined;
  const { manifest, plan } = draft(await scanArchive(archiveRoot), signed, options, prior);
  plan.archiveCommit = info.commit;
  plan.launcherCommit = options.launcherCommit;
  const name = options.channel === 'test' ? 'lunden-manifest-test.json' : 'lunden-manifest.json';
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  check(manifestBytes.length <= 4 * 1024 * 1024, 'Manifest exceeds the launcher limit.');
  // Reserve a new output directory. A manifest only becomes visible after its upload plan exists.
  await mkdir(target);
  try {
    await writeFile(path.join(target, 'upload-plan.json'), JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
    await writeFile(path.join(target, name + '.tmp'), manifestBytes, { flag: 'wx' });
    await rename(path.join(target, name + '.tmp'), path.join(target, name));
  } catch (error) { await rm(target, { recursive: true, force: true }); throw error; }
  return { name, uploads: plan.uploads.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const required = ['archive', 'signed-launcher', 'out', 'public-key', 'signer-sha256', 'launcher-tag', 'launcher-commit', 'launcher-release-tag', 'archive-commit',
    'tag', 'app-version', 'content-version', 'min-launcher', 'channel', 'published'];
  const { values } = parseArgs({ options: Object.fromEntries([...required, 'previous'].map(key => [key, { type: 'string' }])) });
  for (const key of required) check(values[key], 'Missing --' + key);
  check(/^(0|[1-9]\d*)$/.test(values['content-version']), 'Invalid --content-version.');
  const options = Object.fromEntries(Object.entries(values).map(([k,v]) => [k.replace(/-([a-z])/g, (_,c) => c.toUpperCase()),v]));
  options.contentVersion = Number(options.contentVersion);
  const result = await generate(options);
  console.log(result.name + ': ' + result.uploads + ' unique archive assets to upload.');
}
