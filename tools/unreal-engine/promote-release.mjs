// Manual GitHub Actions promotion: the read-only job verifies bytes; the write job
// checks the same release identity and asset inventory again immediately before PATCH.
import { createHash } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { verifyPublishedBytes } from './verify-published.mjs';

const repo = 'solwation/lunden-3d-apartment';
const api = 'https://api.github.com/repos/' + repo + '/releases';
const tags = /^(?:app-v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)|content-(?:0|[1-9]\d*))$/;
const channels = { stable: 'lunden-manifest.json', test: 'lunden-manifest-test.json' };

async function metadata(endpoint, optional = false) {
  const response = await fetch(api + endpoint, { headers: { Accept: 'application/vnd.github+json', 'Cache-Control': 'no-cache' }, redirect: 'error', credentials: 'omit' });
  if (optional && response.status === 404) return null;
  if (!response.ok) throw Error(`Release metadata HTTP ${response.status}.`);
  return response.json();
}

async function assets(id) {
  const files = new Map();
  for (let page = 1; ; page++) {
    const entries = await metadata(`/${id}/assets?per_page=100&page=${page}`);
    for (const file of entries) {
      if (files.has(file.name)) throw Error('Duplicate release asset: ' + file.name);
      files.set(file.name, file);
    }
    if (entries.length < 100) return files;
  }
}

function hasChannel(files, name) {
  return files.has(name) || files.has(name + '.sig');
}

async function snapshot(tag) {
  if (typeof tag !== 'string' || tag.length > 128 || !tags.test(tag) || tag !== tag.trim())
    throw Error('Expected app-vMAJOR.MINOR.PATCH or content-N.');
  const [candidate, latest] = await Promise.all([metadata('/tags/' + tag), metadata('/latest', true)]);
  if (candidate.tag_name !== tag || !Number.isSafeInteger(candidate.id) || candidate.id <= 0 ||
      candidate.draft !== false || candidate.prerelease !== false || !candidate.published_at)
    throw Error('The selected tag must identify an already published full release.');
  const files = await assets(candidate.id);
  const previous = latest?.id === candidate.id ? files : latest ? await assets(latest.id) : new Map();
  const required = [];
  for (const [channel, name] of Object.entries(channels)) {
    if (!hasChannel(files, name) && !hasChannel(previous, name)) continue;
    for (const asset of [name, name + '.sig']) {
      if (files.get(asset)?.state !== 'uploaded') throw Error('Missing published asset ' + asset);
    }
    required.push(channel);
  }
  if (!required.length) throw Error('Release has no channel manifests.');
  // Track every asset on the target, including files uploaded under existing names.
  const inventory = [...files.keys()].sort().map(name => {
    const { id, size, updated_at, digest, state } = files.get(name);
    return [name, id, size, updated_at, digest, state];
  });
  const digest = createHash('sha256').update(JSON.stringify([tag, candidate.id, latest?.id, required, inventory])).digest('hex');
  return { id: candidate.id, required, files, digest };
}

async function downloadAsset(tag, file, limit) {
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > limit) throw Error('Invalid size for ' + file.name);
  let url = new URL(`https://github.com/${repo}/releases/download/${tag}/${file.name}`);
  for (let count = 0; count <= 10; count++) {
    const response = await fetch(url, { redirect: 'manual', credentials: 'omit' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw Error('Missing asset redirect.');
      url = new URL(location, url);
      if (url.protocol !== 'https:' || url.username || url.password) throw Error('Invalid public asset redirect.');
      continue;
    }
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel();
      throw Error(`HTTP ${response.status} for ${file.name}`);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > file.size) throw Error('Size mismatch for ' + file.name);
      chunks.push(chunk);
    }
    if (size !== file.size) throw Error('Size mismatch for ' + file.name);
    const bytes = Buffer.concat(chunks);
    if (file.digest && file.digest !== 'sha256:' + createHash('sha256').update(bytes).digest('hex'))
      throw Error('GitHub asset digest mismatch for ' + file.name);
    return bytes;
  }
  throw Error('Too many redirects for ' + file.name);
}

export async function checkRelease(tag, publicKey) {
  const state = await snapshot(tag);
  for (const channel of state.required) {
    const name = channels[channel];
    const [manifest, signature] = await Promise.all([downloadAsset(tag, state.files.get(name), 4 * 1024 * 1024),
      downloadAsset(tag, state.files.get(name + '.sig'), 64)]);
    const result = await verifyPublishedBytes(manifest, signature, publicKey, channel, { publicOnly: true });
    console.log(`Verified ${tag} (${channel}): ${result.objects} objects, ${result.bytes} bytes.`);
  }
  return { id: state.id, digest: state.digest };
}

export async function promoteCheckedRelease(tag, checked, token) {
  if (!token) throw Error('Missing release write token.');
  const current = await snapshot(tag);
  if (current.id !== checked.id || current.digest !== checked.digest)
    throw Error('Release or latest changed after verification; run the gate again.');
  const response = await fetch(`${api}/${current.id}`, { method: 'PATCH', redirect: 'error',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ make_latest: 'true' }) });
  if (!response.ok) throw Error('Release promotion failed: HTTP ' + response.status);
  const result = await response.json();
  if (result.id !== current.id || result.tag_name !== tag) throw Error('Unexpected release in the promotion response.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const env = process.env;
    if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_REPOSITORY !== repo)
      throw Error('Requires manual dispatch from the original repository main branch.');
    switch (process.argv[2]) {
      case 'check': {
        const { id, digest } = await checkRelease(env.RELEASE_TAG, env.LUNDEN_MANIFEST_PUBLIC_KEY);
        await appendFile(env.GITHUB_OUTPUT, `id=${id}\ndigest=${digest}\n`);
        break;
      }
      case 'promote':
        await promoteCheckedRelease(env.RELEASE_TAG, { id: Number(env.CHECKED_ID), digest: env.CHECKED_DIGEST }, env.GH_TOKEN);
        break;
      default: throw Error('Specify check or promote.');
    }
  } catch (error) {
    console.error('Release promotion stopped:', error.message);
    process.exitCode = 1;
  }
}
