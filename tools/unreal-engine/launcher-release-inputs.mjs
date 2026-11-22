// Public release inputs, shared by the build and the protected signing job.
import { createHash, createPublicKey } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The reviewed publisher identity compiled into the launcher (#2277). Artifact Signing replaces the
// leaf certificate every 72 hours, so a release binds the stable identity, never a leaf.
// #2415: the player-facing setup name; GitHub turns spaces in asset names into dots, hence the hyphens.
export const setupName = version => `Kv-Lunden-Unreal-L1007-Setup-${version}-win-x64.exe`;

export const publisherIdentityFile = fileURLToPath(new URL('../../unreal/Launcher/publisher-identity.json', import.meta.url));
const identityFields = ['commonName', 'organization', 'rootSha256', 'identityKeyUsage'];
const objectIdentifier = /^[0-2](\.(0|[1-9]\d{0,9}))+$/;

export function readPublisherIdentity(file = publisherIdentityFile) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

// Any Authenticode identity: test fixtures use other publishers and their code-signing usage.
export function validateIdentity(identity) {
  if (identity === null || typeof identity !== 'object' || Array.isArray(identity) ||
    Object.keys(identity).join() !== identityFields.join())
    throw new Error('The publisher identity must contain exactly ' + identityFields.join(', ') + '.');
  for (const name of [identity.commonName, identity.organization])
    if (typeof name !== 'string' || !name.trim() || name !== name.trim() || /\p{Cc}/u.test(name))
      throw new Error('The publisher identity needs the exact certificate common name and organization.');
  if (!/^[\da-f]{64}$/i.test(identity.rootSha256 ?? ''))
    throw new Error('rootSha256 must be the SHA-256 of the signing chain\'s root certificate.');
  if (!objectIdentifier.test(identity.identityKeyUsage ?? ''))
    throw new Error('identityKeyUsage must be an object identifier.');
  return { ...identity, rootSha256: identity.rootSha256.toUpperCase() };
}

export function releaseInputs(tag, identity, pem) {
  const version = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(tag)?.[1];
  if (!version || version.split('.').some(part => +part > 65534))
    throw new Error('Expected an vMAJOR.MINOR.PATCH tag with Windows version components 0–65534.');
  const signer = validateIdentity(identity);
  // A release requires the certificate profile's durable identity usage, not the one shared by all Artifact Signing customers.
  if (!signer.identityKeyUsage.startsWith('1.3.6.1.4.1.311.97.') || signer.identityKeyUsage === '1.3.6.1.4.1.311.97.1.0')
    throw new Error('identityKeyUsage must be the durable identity usage (1.3.6.1.4.1.311.97.*) of the approved Artifact Signing certificate profile.');
  if (typeof pem !== 'string' || !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PUBLIC KEY-----$/.test(pem.trim()))
    throw new Error('LUNDEN_MANIFEST_PUBLIC_KEY must contain exactly one public SPKI PEM.');
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails.namedCurve !== 'prime256v1')
    throw new Error('The manifest verification key must be ECDSA P-256.');
  const canonical = key.export({ type: 'spki', format: 'pem' });
  if (pem.trim().replace(/\s/g, '') !== canonical.trim().replace(/\s/g, ''))
    throw new Error('Unexpected data in manifest public key.');
  const keyDigest = createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
  const trust = createHash('sha256').update(JSON.stringify([version, ...identityFields.map(field => signer[field]), keyDigest])).digest('hex');
  return { version, signer, canonical, keyDigest, trust };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const env = process.env;
  const input = releaseInputs(env.GITHUB_REF_NAME, readPublisherIdentity(), env.LUNDEN_MANIFEST_PUBLIC_KEY);
  if (env.GITHUB_REF_TYPE !== 'tag') throw new Error('A release tag is required.');
  // The protected signing profile's configured name must be the identity this launcher trusts.
  if (env.SIGNING_EXPECTED_SUBJECT !== undefined && env.SIGNING_EXPECTED_SUBJECT !== input.signer.commonName)
    throw new Error('SIGNING_EXPECTED_SUBJECT differs from the publisher identity compiled into the launcher.');
  if (env.EXPECTED_BUILD_TRUST !== undefined && env.EXPECTED_BUILD_TRUST !== input.trust)
    throw new Error('The build and signing environment must agree on version, publisher and manifest key.');
  const directory = process.argv[2];
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, 'manifest-public.pem'), input.canonical);
  appendFileSync(env.GITHUB_OUTPUT, `version=${input.version}\ntrust=${input.trust}\nmanifest-key-sha256=${input.keyDigest}\n`);
}
