// Read-only release gate. Verify the proposed manifest before requesting any of its URLs.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isIPv4 } from 'node:net';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { validate } from './json-schema.mjs';

const schema = JSON.parse(await readFile(new URL('../../shared/schema/release-manifest.schema.json', import.meta.url)));
const stockInventory = JSON.parse(await readFile(new URL('../../unreal/Launcher/Unreal-5.8.4-win64.json', import.meta.url)));
const projectExe = 'Lunden/Binaries/Win64/Lunden-Win64-Shipping.exe';
const stockExe = 'Engine/Binaries/Win64/UnrealGame-Win64-Shipping.exe';
const linuxEntries = ['Engine/Binaries/Linux/UnrealGame-Linux-Shipping', 'Lunden/Binaries/Linux/Lunden-Linux-Shipping'];

function parseManifest(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    throw Error('The launcher requires UTF-8 JSON without a BOM.');
  const manifest = JSON.parse(text, (key, value, context) => {
    if (typeof value === 'number' && ['formatVersion', 'size', 'version'].includes(key) && !/^-?\d+$/.test(context.source))
      throw Error('Expected a decimal integer for ' + key);
    return value;
  });
  // JSON.parse accepts duplicate properties that the launcher rejects. After its syntax
  // check, consume every complete string (including escaped quotes) to identify keys.
  const scopes = [];
  for (const match of text.matchAll(/("(?:\\.|[^"\\])*")\s*(:)?|[{}]/gu)) {
    if (match[0] === '{') scopes.push(new Set());
    else if (match[0] === '}') scopes.pop();
    else if (match[2]) {
      const key = JSON.parse(match[1]);
      if (scopes.at(-1).has(key)) throw Error('Duplicate JSON property: ' + key);
      scopes.at(-1).add(key);
    }
  }
  return manifest;
}

function downloadUrl(value, channel, publicOnly = false) {
  const url = new URL(value);
  const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' || isIPv4(url.hostname) && url.hostname.startsWith('127.');
  if (publicOnly && (url.protocol !== 'https:' || loopback)) throw Error('Published releases require public HTTPS asset URLs.');
  if (url.username || url.password || url.href.includes('#') ||
      !(url.protocol === 'https:' || channel === 'test' && url.protocol === 'http:' && loopback))
    throw Error('Expected HTTPS or test-channel loopback HTTP, without credentials or fragments.');
  if (url.hostname === 'github.com' && /\/releases\/latest(?:\/|$)/i.test(url.pathname))
    throw Error('Release assets must use a versioned URL.');
  return url;
}

function versionParts(version) {
  const parts = version.split('.').map(Number);
  if (parts.some(part => part > 2147483647)) throw Error('Launcher version exceeds Int32.');
  while (parts.length < 4) parts.push(-1); // System.Version uses -1 for omitted components.
  return parts;
}

function checkStock(app, files) {
  for (const vendor of stockInventory) {
    if (app.get(vendor.path)?.sha256.toLowerCase() !== vendor.sha256.toLowerCase())
      throw Error('Missing or different stock Unreal binary: ' + vendor.path);
  }
  const vendorPaths = new Set(stockInventory.map(v => v.path));
  for (const f of files) {
    if ((f.authenticode || /\.(exe|dll)$/i.test(f.path)) && !f.path.startsWith('Lunden/') && !vendorPaths.has(f.path))
      throw Error('Unknown executable in stock Unreal package: ' + f.path);
  }
  if (!files.some(f => f.path.startsWith('Lunden/Content/Paks/') && /\.pak$/i.test(f.path)))
    throw Error('Missing project pak in stock Unreal package.');
}

function releaseObjects(manifest, channel, platform = 'win-x64') {
  const errors = validate(manifest, schema);
  if (errors.length) throw Error(errors[0]);
  if (manifest.channel !== channel) throw Error('Wrong release channel.');
  if (!['win-x64', 'linux-x64'].includes(platform) || (manifest.platform ?? 'win-x64') !== platform)
    throw Error('Wrong release platform.');
  const { app, content, launcher } = manifest;
  if (app.contentAbi !== content.requiresAbi) throw Error('Incompatible content ABI.');
  const date = manifest.published;
  const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d\d):(\d\d):(\d\d)(?:\.\d{1,16})?(Z|[+-](\d\d):(\d\d))$/.exec(date);
  const epoch = Date.parse(date);
  if (!iso || !Number.isFinite(epoch) || epoch <= -62135596800000 || epoch > 253402300799999 ||
      new Date(date.slice(0, 10) + 'T00:00:00Z').getUTCDate() !== +iso[3] ||
      +iso[4] > 23 || +iso[8] * 60 + +iso[9] > 14 * 60)
    throw Error('Invalid publication timestamp.');
  const minimum = versionParts(app.minLauncher), offered = versionParts(launcher.version);
  const difference = offered.findIndex((part, i) => part !== minimum[i]);
  if (difference >= 0 && offered[difference] < minimum[difference]) throw Error('Offered launcher is too old.');
  if (new Set(content.packages.map(p => p.id)).size !== content.packages.length) throw Error('Duplicate content package ID.');

  const files = [...app.files, ...content.packages.flatMap(p => p.files)];
  if (platform === 'linux-x64' && files.some(f => f.authenticode || /\.(exe|dll)$/i.test(f.path)
      || f.path.split('/').some(p => ['Windows', 'Win64'].includes(p)))) throw Error('Windows files in Linux package.');
  if (platform === 'win-x64' && files.some(f => f.executable || f.path.split('/').includes('Linux')))
    throw Error('Linux files in Windows package.');
  const paths = new Set();
  for (const { path } of files) {
    if (path.split('/').some(s => s.length > 255 || /[^A-Za-z0-9._ -]|[. ]$|^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(s)))
      throw Error('Invalid Windows path: ' + path);
    if (paths.has(path.toLowerCase())) throw Error('Duplicate Windows path: ' + path);
    paths.add(path.toLowerCase());
  }
  for (const path of paths) {
    for (let i = path.indexOf('/'); i >= 0; i = path.indexOf('/', i + 1)) {
      if (paths.has(path.slice(0, i))) throw Error('File used as a directory: ' + path);
    }
  }
  const appFiles = new Map(app.files.map(f => [f.path, f]));
  if (platform === 'linux-x64') {
    if (!linuxEntries.some(p => appFiles.get(p)?.executable)) throw Error('Invalid Linux game entry point.');
    if (!files.some(f => /^Lunden\/Content\/Paks\/.+\.pak$/.test(f.path))) throw Error('Missing Linux project pak.');
  } else if (!appFiles.has(projectExe)) {
    if (!appFiles.has(stockExe) || paths.has(projectExe.toLowerCase())) throw Error('Invalid game entry point.');
    checkStock(appFiles, files);
  }

  const objects = new Map();
  for (const entry of [...files, launcher]) {
    const url = downloadUrl(entry.url, channel).href;
    const previous = objects.get(url);
    if (previous && (entry.size !== previous.size || entry.sha256.toLowerCase() !== previous.sha256.toLowerCase()))
      throw Error('Conflicting descriptions for one download URL.');
    objects.set(url, entry);
  }
  return objects;
}

export async function verifyDownload(url, entry, channel, publicOnly) {
  url = downloadUrl(url, channel, publicOnly);
  const name = entry.path ?? 'launcher';
  for (let redirect = 0; redirect <= 10; redirect++) {
    // Manual redirects apply the channel's URL policy at every hop, including GitHub's asset CDN.
    const response = await fetch(url, { credentials: 'omit', redirect: 'manual', headers: { 'Accept-Encoding': 'identity' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw Error('Missing redirect location for ' + name);
      url = downloadUrl(new URL(location, url), channel, publicOnly);
      continue;
    }
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel();
      throw Error(`HTTP ${response.status} for ${name}`);
    }
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > entry.size) throw Error('Size mismatch for ' + name);
      hash.update(chunk);
    }
    if (bytes !== entry.size) throw Error('Size mismatch for ' + name);
    if (hash.digest('hex') !== entry.sha256.toLowerCase()) throw Error('SHA-256 mismatch for ' + name);
    return;
  }
  throw Error('Too many redirects for ' + name);
}

export function validateReleaseManifest(manifest, channel, platform = 'win-x64') {
  releaseObjects(manifest, channel, platform);
}

function verifiedRelease(bytes, sig, publicKeyPem, channel, platform = 'win-x64') {
  const pem = typeof publicKeyPem === 'string' ? publicKeyPem : new TextDecoder('utf-8', { fatal: true }).decode(publicKeyPem);
  if (!['stable', 'test'].includes(channel)) throw Error('Specify the expected stable or test channel.');
  if (bytes.byteLength > 4 * 1024 * 1024) throw Error('Manifest exceeds launcher size limit.');
  if (!/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PUBLIC KEY-----$/.test(pem.trim()))
    throw Error('Expected a public SPKI PEM.');
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails.namedCurve !== 'prime256v1' ||
      sig.length !== 64 || !verify('sha256', bytes, { key, dsaEncoding: 'ieee-p1363' }, sig))
    throw Error('Invalid P-256 manifest signature.');
  const manifest = parseManifest(bytes);
  return { manifest, objects: releaseObjects(manifest, channel, platform) };
}

export function readVerifiedManifest(bytes, signatureBytes, publicKeyPem, channel, platform = 'win-x64') {
  return verifiedRelease(bytes, signatureBytes, publicKeyPem, channel, platform).manifest;
}

export async function verifyPublished({ manifest, signature, publicKey, channel, platform = 'win-x64' }) {
  const [bytes, sig, pem] = await Promise.all([readFile(manifest), readFile(signature), readFile(publicKey, 'utf8')]);
  return verifyPublishedBytes(bytes, sig, pem, channel, { platform });
}

export async function verifyPublishedBytes(bytes, sig, pem, channel, { publicOnly = false, platform = 'win-x64' } = {}) {
  const { objects } = verifiedRelease(bytes, sig, pem, channel, platform);
  let total = 0n;
  for (const [url, entry] of objects) {
    await verifyDownload(url, entry, channel, publicOnly);
    total += BigInt(entry.size);
  }
  return { objects: objects.size, bytes: total };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: {
      channel: { type: 'string' }, platform: { type: 'string' }, manifest: { type: 'string' },
      signature: { type: 'string' }, 'public-key': { type: 'string' }
    } });
    if (!values.manifest || !values.signature || !values['public-key'])
      throw Error('Usage: verify-published.mjs --channel test|stable --manifest FILE --signature FILE --public-key PEM');
    const result = await verifyPublished({ ...values, publicKey: values['public-key'] });
    console.log(`Verified ${result.objects} unique objects, ${result.bytes} bytes (${values.channel}).`);
  } catch (error) {
    console.error('Release verification failed:', error.message);
    process.exitCode = 1;
  }
}
