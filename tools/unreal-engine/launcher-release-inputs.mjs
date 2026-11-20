// Public release inputs, shared by the build and the protected signing job.
import { createHash, createPublicKey } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function releaseInputs(tag, fingerprint, pem) {
  const version = /^app-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(tag)?.[1];
  if (!version || version.split('.').some(part => +part > 65534))
    throw new Error('Expected an app-vMAJOR.MINOR.PATCH tag with Windows version components 0–65534.');
  if (!/^[\da-f]{64}$/i.test(fingerprint ?? ''))
    throw new Error('LUNDEN_SIGNER_SHA256 must be the verified SHA-256 fingerprint of the booster-ai signing certificate.');
  if (typeof pem !== 'string' || !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PUBLIC KEY-----$/.test(pem.trim()))
    throw new Error('LUNDEN_MANIFEST_PUBLIC_KEY must contain exactly one public SPKI PEM.');
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails.namedCurve !== 'prime256v1')
    throw new Error('The manifest verification key must be ECDSA P-256.');
  const canonical = key.export({ type: 'spki', format: 'pem' });
  if (pem.trim().replace(/\s/g, '') !== canonical.trim().replace(/\s/g, ''))
    throw new Error('Unexpected data in manifest public key.');
  const signer = fingerprint.toUpperCase();
  const keyDigest = createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
  const trust = createHash('sha256').update([version, signer, keyDigest].join('\n')).digest('hex');
  return { version, signer, canonical, keyDigest, trust };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const env = process.env;
  const input = releaseInputs(env.GITHUB_REF_NAME, env.LUNDEN_SIGNER_SHA256, env.LUNDEN_MANIFEST_PUBLIC_KEY);
  if (env.GITHUB_REF_TYPE !== 'tag') throw new Error('A release tag is required.');
  if (env.EXPECTED_BUILD_TRUST !== undefined && env.EXPECTED_BUILD_TRUST !== input.trust)
    throw new Error('The build and signing environment must agree on version, publisher and manifest key.');
  const directory = process.argv[2];
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, 'manifest-public.pem'), input.canonical);
  appendFileSync(env.GITHUB_OUTPUT, `version=${input.version}\ntrust=${input.trust}\nmanifest-key-sha256=${input.keyDigest}\n`);
}
