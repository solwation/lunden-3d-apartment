// Sign a Lunden release manifest with the protected ECDSA P-256 key (#2248).
// The output is the launcher's detached signature: 64 bytes, IEEE P1363, SHA-256,
// over the exact manifest bytes. The private key is read from the environment or
// stdin, never from a file argument, and is never written anywhere. Every signature
// is checked with the public key and the release manifest rules before it is kept.
//
// Modes (see tools/unreal-engine/manifests.md):
//   sign    local or Actions: sign one manifest file, no network access
//   fetch   Actions: download a manifest asset from an unpublished or non-latest release
//   upload  Actions: recheck the release and upload the verified `.sig` asset
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { readVerifiedManifest } from './verify-published.mjs';

const repo = 'solwation/lunden-3d-apartment';
const api = 'https://api.github.com/repos/' + repo + '/releases';
const uploads = 'https://uploads.github.com/repos/' + repo + '/releases';
const tags = /^(?:(?:app-)?v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)|content-(?:0|[1-9]\d*))$/;
const maxManifest = 4 * 1024 * 1024;
export const manifestAssets = { stable: 'lunden-manifest.json', test: 'lunden-manifest-test.json' };
const linuxManifestAssets = { stable: 'lunden-manifest-linux-x64.json', test: 'lunden-manifest-linux-x64-test.json' };
const publicPem = /^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PUBLIC KEY-----$/;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function channelOf(asset) {
  const channel = Object.keys(manifestAssets).find(name => manifestAssets[name] === asset || linuxManifestAssets[name] === asset);
  if (!channel) throw Error('Expected a named Windows or linux-x64 channel manifest asset.');
  return channel;
}

function publicKeyOf(pem) {
  if (typeof pem !== 'string' || !publicPem.test(pem.trim()))
    throw Error('LUNDEN_MANIFEST_PUBLIC_KEY must contain exactly one public SPKI PEM.');
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails.namedCurve !== 'prime256v1')
    throw Error('LUNDEN_MANIFEST_PUBLIC_KEY must be an ECDSA P-256 key.');
  return key;
}

function privateKeyOf(pem) {
  let key;
  // Never echo the input or the crypto error text: either could carry key material.
  try { key = createPrivateKey({ key: pem, format: 'pem' }); } catch {
    throw Error('The manifest private key is missing, encrypted or not a PEM private key.');
  }
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails.namedCurve !== 'prime256v1')
    throw Error('The manifest private key must be ECDSA P-256.');
  return key;
}

// Returns the 64-byte signature only after the verifier used by promotion accepts it.
export function signManifest(bytes, privatePem, publicKeyPem, channel, platform = 'win-x64') {
  const publicKey = publicKeyOf(publicKeyPem);
  const privateKey = privateKeyOf(privatePem);
  const derived = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  if (!derived.equals(publicKey.export({ type: 'spki', format: 'der' })))
    throw Error('The manifest private key does not belong to LUNDEN_MANIFEST_PUBLIC_KEY.');
  const signature = sign('sha256', bytes, { key: privateKey, dsaEncoding: 'ieee-p1363' });
  if (signature.length !== 64) throw Error('Unexpected P-256 signature length.');
  readVerifiedManifest(bytes, signature, publicKeyPem, channel, platform);
  return signature;
}

function headers(token, accept = 'application/vnd.github+json') {
  if (!token) throw Error('Missing GH_TOKEN for the release API.');
  return { Authorization: 'Bearer ' + token, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' };
}

async function json(url, token, optional = false) {
  const response = await fetch(url, { headers: headers(token), redirect: 'error' });
  if (optional && response.status === 404) return null;
  if (!response.ok) throw Error(`Release API HTTP ${response.status}.`);
  return response.json();
}

// Drafts are not reachable through /releases/tags/{tag}, so search the authenticated list.
async function snapshot(tag, asset, token) {
  if (typeof tag !== 'string' || tag.length > 128 || !tags.test(tag))
    throw Error('Expected app-vMAJOR.MINOR.PATCH, vMAJOR.MINOR.PATCH or content-N.');
  channelOf(asset);
  const matches = [];
  for (let page = 1; page <= 50; page++) {
    const entries = await json(`${api}?per_page=100&page=${page}`, token);
    matches.push(...entries.filter(release => release.tag_name === tag));
    if (entries.length < 100) break;
  }
  if (matches.length !== 1 || !Number.isSafeInteger(matches[0].id) || matches[0].id <= 0)
    throw Error('Expected exactly one release for ' + tag + '.');
  const release = matches[0];
  const latest = await json(api + '/latest', token, true);
  if (latest?.id === release.id) throw Error('Refusing to change the current latest release; sign before promotion.');
  const files = new Map();
  for (let page = 1; ; page++) {
    const entries = await json(`${api}/${release.id}/assets?per_page=100&page=${page}`, token);
    for (const file of entries) {
      if (files.has(file.name)) throw Error('Duplicate release asset: ' + file.name);
      files.set(file.name, file);
    }
    if (entries.length < 100) break;
  }
  const manifest = files.get(asset);
  if (manifest?.state !== 'uploaded' || !Number.isSafeInteger(manifest.id))
    throw Error('Missing uploaded release asset ' + asset + '.');
  if (files.has(asset + '.sig'))
    throw Error(`${asset}.sig already exists; delete it deliberately before signing again.`);
  const { id, size, digest, updated_at } = manifest;
  return { tag, id: release.id, draft: release.draft === true, asset, channel: channelOf(asset),
    manifest: { id, size, digest: digest ?? null, updated_at } };
}

async function download(id, limit, token) {
  let url = new URL(`${api}/assets/${id}`);
  let auth = headers(token, 'application/octet-stream');
  for (let count = 0; count <= 10; count++) {
    // Follow redirects manually so the token never leaves api.github.com.
    const response = await fetch(url, { headers: auth, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw Error('Missing asset redirect.');
      url = new URL(location, url);
      if (url.protocol !== 'https:' || url.username || url.password) throw Error('Invalid asset redirect.');
      if (url.hostname !== 'api.github.com') auth = { Accept: 'application/octet-stream' };
      continue;
    }
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel();
      throw Error(`Asset download HTTP ${response.status}.`);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > limit) throw Error('Release asset exceeds its expected size.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw Error('Too many asset redirects.');
}

export async function fetchManifest({ tag, asset, token }) {
  const state = await snapshot(tag, asset, token);
  if (!Number.isSafeInteger(state.manifest.size) || state.manifest.size <= 0 || state.manifest.size > maxManifest)
    throw Error('Invalid manifest asset size.');
  const bytes = await download(state.manifest.id, state.manifest.size, token);
  if (bytes.length !== state.manifest.size) throw Error('Manifest size mismatch.');
  if (state.manifest.digest && state.manifest.digest !== 'sha256:' + sha256(bytes))
    throw Error('GitHub asset digest mismatch for ' + asset + '.');
  return { state: { ...state, sha256: sha256(bytes) }, bytes };
}

export async function uploadSignature({ state, bytes, signature, publicKey, token }) {
  if (sha256(bytes) !== state.sha256) throw Error('The local manifest differs from the fetched asset.');
  channelOf(state.asset);
  readVerifiedManifest(bytes, signature, publicKey, state.channel,
    Object.values(linuxManifestAssets).includes(state.asset) ? 'linux-x64' : 'win-x64');
  const current = await snapshot(state.tag, state.asset, token);
  if (current.id !== state.id || JSON.stringify(current.manifest) !== JSON.stringify(state.manifest))
    throw Error('The release or its manifest asset changed after it was fetched; sign again.');
  const name = state.asset + '.sig';
  const response = await fetch(`${uploads}/${state.id}/assets?name=${encodeURIComponent(name)}`, {
    method: 'POST', redirect: 'error', body: signature,
    headers: { ...headers(token), 'Content-Type': 'application/octet-stream' } });
  if (response.status !== 201) throw Error('Signature upload failed: HTTP ' + response.status);
  const uploaded = await response.json();
  if (uploaded.name !== name || uploaded.size !== 64 || !Number.isSafeInteger(uploaded.id))
    throw Error('Unexpected signature asset in the upload response.');
  const echoed = await download(uploaded.id, 64, token);
  if (!echoed.equals(signature)) throw Error(`Uploaded ${name} differs from the verified signature; delete it.`);
  return { id: state.id, asset: name };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main(mode, args) {
  const env = process.env;
  const options = {
    manifest: { type: 'string' }, channel: { type: 'string' }, platform: { type: 'string' }, out: { type: 'string' },
    'private-key-stdin': { type: 'boolean' }, tag: { type: 'string' }, asset: { type: 'string' }, dir: { type: 'string' }
  };
  const { values } = parseArgs({ args, options, strict: true });
  switch (mode) {
    case 'sign': {
      if (!values.manifest || !['stable', 'test'].includes(values.channel))
        throw Error('Usage: sign-manifest.mjs sign --channel test|stable --manifest FILE [--out FILE.sig] [--private-key-stdin]');
      const privatePem = values['private-key-stdin'] ? await readStdin() : env.LUNDEN_MANIFEST_PRIVATE_KEY;
      delete env.LUNDEN_MANIFEST_PRIVATE_KEY;
      const bytes = await readFile(values.manifest);
      if (bytes.length > maxManifest) throw Error('Manifest exceeds launcher size limit.');
      const signature = signManifest(bytes, privatePem, env.LUNDEN_MANIFEST_PUBLIC_KEY, values.channel, values.platform ?? 'win-x64');
      const out = values.out ?? values.manifest + '.sig';
      await writeFile(out, signature, { flag: 'wx' });
      console.log(`Signed ${basename(values.manifest)} (${values.channel}, sha256 ${sha256(bytes)}) -> ${basename(out)}.`);
      return;
    }
    case 'fetch': {
      if (!values.tag || !values.asset || !values.dir) throw Error('Usage: sign-manifest.mjs fetch --tag TAG --asset NAME --dir DIR');
      const { state, bytes } = await fetchManifest({ tag: values.tag, asset: values.asset, token: env.GH_TOKEN });
      await writeFile(join(values.dir, state.asset), bytes, { flag: 'wx' });
      await writeFile(join(values.dir, 'release.json'), JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
      console.log(`Fetched ${state.asset} from ${state.draft ? 'draft' : 'published'} release ${state.tag} (sha256 ${state.sha256}).`);
      if (env.GITHUB_OUTPUT) await writeFile(env.GITHUB_OUTPUT, `channel=${state.channel}\nasset=${state.asset}\nplatform=${Object.values(linuxManifestAssets).includes(state.asset) ? 'linux-x64' : 'win-x64'}\n`, { flag: 'a' });
      return;
    }
    case 'upload': {
      if (!values.dir) throw Error('Usage: sign-manifest.mjs upload --dir DIR');
      const state = JSON.parse(await readFile(join(values.dir, 'release.json'), 'utf8'));
      channelOf(state.asset);
      const [bytes, signature] = await Promise.all([readFile(join(values.dir, state.asset)), readFile(join(values.dir, state.asset + '.sig'))]);
      const result = await uploadSignature({ state, bytes, signature, publicKey: env.LUNDEN_MANIFEST_PUBLIC_KEY, token: env.GH_TOKEN });
      console.log(`Uploaded the verified ${result.asset} to release ${state.tag}; latest is unchanged.`);
      return;
    }
    default: throw Error('Specify sign, fetch or upload.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main(process.argv[2], process.argv.slice(3));
  } catch (error) {
    console.error('Manifest signing stopped:', error.message);
    process.exitCode = 1;
  }
}
