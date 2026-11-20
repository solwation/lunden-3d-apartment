import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { draft, inspectLauncher, scanArchive } from '../make-manifest.mjs';
import { readVerifiedManifest } from '../verify-published.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const vendors = JSON.parse(await readFile(new URL('../../../unreal/Launcher/Unreal-5.8.4-win64.json', import.meta.url)));
const release = { appVersion:'1.2.3', contentVersion:4, published:'2026-11-19T20:21:22.000Z',
  channel:'test', tag:'app-v1.2.3', minLauncher:'1.0.0' };
const launcher = { version:'1.0.0', size:15, sha256:hash('fixture'), url:'https://github.com/solwation/lunden-3d-apartment/releases/download/app-v1.0.0/Lunden.exe' };

function records() {
  const files = vendors.map(v => ({ path:v.path, group:null, size:100, sha256:v.sha256.toLowerCase() }));
  for (const [group, name, extensions] of [
    ['global','global',['ucas','utoc']], ['chunk-0','pakchunk0-Windows',['pak','ucas','utoc']],
    ['chunk-1','pakchunk1-Windows',['pak','ucas','utoc']], ['chunk-2','pakchunk2-Windows',['pak','ucas','utoc']]
  ]) {
    for (const ext of extensions) {
      const member = name + '.' + ext;
      files.push({ path:'Lunden/Content/Paks/' + member, group, size:100, sha256:hash(member) });
    }
  }
  files.push({ path:'info1.txt',size:9,sha256:hash('identical'),group:null },
    { path:'info2.txt',size:9,sha256:hash('identical'),group:null });
  return files.sort((a,b) => a.path < b.path ? -1 : 1);
}

test('deterministic schema-checked draft deduplicates identical files and C# reads the same signed bytes', async () => {
  const first = draft(records(), launcher, release);
  assert.deepEqual(first, draft(records().reverse(), launcher, release));
  assert.equal(first.plan.uploads.length, records().length - 1);
  assert.equal(first.manifest.app.files.filter(f => f.authenticode).length, 14);
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve:'P-256' });
  const bytes = Buffer.from(JSON.stringify(first.manifest, null, 2) + '\n');
  const sig = sign('sha256', bytes, { key:privateKey, dsaEncoding:'ieee-p1363' });
  assert.deepEqual(readVerifiedManifest(bytes, sig, publicKey.export({ type:'spki', format:'pem' }), 'test'), first.manifest);
  if (process.env.LUNDEN_GENERATED_TEST_MANIFEST) await writeFile(process.env.LUNDEN_GENERATED_TEST_MANIFEST, bytes);
});

test('content-only release reuses old immutable URLs, refreshes zone and base registry, and rejects base IoStore changes', () => {
  const files = records(), prev = draft(files, launcher, release).manifest;
  const next = { ...release, contentVersion:5, tag:'content-5', published:'2026-11-20T20:21:22Z' };
  for (const f of files.filter(f => /pakchunk0-Windows\.pak$|pakchunk1-Windows\.(utoc|ucas)$/.test(f.path))) f.sha256 = hash(f.sha256);
  const update = draft(files, launcher, next, prev);
  assert.equal(update.manifest.content.requiresAbi, prev.app.contentAbi);
  assert.equal(update.plan.uploads.length, 3);
  for (const row of update.plan.uploads) assert.match(row.source,/pakchunk[01]-Windows/);
  assert.equal(update.plan.mappings.filter(m => m.url.includes('/content-5/')).length,3);
  assert.throws(() => draft(files,launcher,next), /verified earlier/);
  files.find(f => f.path.endsWith('/global.utoc')).sha256 = hash('other global');
  assert.throws(() => draft(files,launcher,next,prev), /unchanged/);
  prev.app.files[0].url = 'https://example.invalid/payload';
  assert.throws(() => draft(files,launcher,next,prev), /ineligible/);
});

test('the protected artifact needs matching public trust, commit, final hashes and publisher verification', async t => {
  const root = await mkdtemp(path.join(tmpdir(),'manifest-launcher-'));
  t.after(() => rm(root, { recursive:true, force:true }));
  const text = 'fixture, not a signed launcher', sha = hash(text), commit = 'a'.repeat(40);
  const inputs = { version:'1.0.0', signer:'AB'.repeat(32), keyDigest:hash('key') };
  const record = { tag:'v1.0.0',commit,signerCertificateSha256:inputs.signer,manifestPublicKeySha256:inputs.keyDigest,launcherSha256:sha };
  const names = ['Lunden.exe','Lunden-Setup-1.0.0-win-x64.exe'];
  for (const name of names) await writeFile(path.join(root,name),text);
  await writeFile(path.join(root,'SHA256SUMS'),names.map(name => sha + '  ' + name).join('\n')+'\n');
  await writeFile(path.join(root,'launcher-build.json'),JSON.stringify(record));
  const fixtureVerifier = async (file,digest,pin) => { assert.equal(file,path.join(root,names[0])); assert.equal(digest,sha); assert.equal(pin,inputs.signer); };
  const valid = await inspectLauncher(root,inputs,commit,'app-v1.2.3',fixtureVerifier);
  assert.equal(valid.sha256,sha);
  assert.equal(valid.url,'https://github.com/solwation/lunden-3d-apartment/releases/download/app-v1.2.3/Lunden.exe');
  await assert.rejects(inspectLauncher(root,inputs,'b'.repeat(40),'app-v1.2.3',fixtureVerifier),/provenance/);
  await assert.rejects(inspectLauncher(root,inputs,commit,'app-v1.2.3',async () => { throw Error('untrusted signer'); }),/untrusted signer/);
  await writeFile(path.join(root,names[1]),'wrong bytes');
  await assert.rejects(inspectLauncher(root,inputs,commit,'app-v1.2.3',fixtureVerifier),/checksum/);
});

test('archives reject unreviewed program files, unsafe Windows paths, links and oversized assets', async t => {
  const root = await mkdtemp(path.join(tmpdir(),'manifest-archive-'));
  t.after(() => rm(root,{ recursive:true,force:true }));
  const invalid = path.join(root,'CON.txt');
  // Reserved DOS filenames cannot be created on Windows itself.
  if (process.platform !== 'win32') {
    await writeFile(invalid,'x');
    await assert.rejects(scanArchive(root),/Invalid.*Windows path/);
    await rm(invalid);
    await symlink(root,path.join(root,'loop'),'dir');
    await assert.rejects(scanArchive(root),/Linked archive entry/);
    await rm(path.join(root,'loop'));
  }
  const huge = path.join(root,'too-big.pak');
  await writeFile(huge,'');
  await truncate(huge, 2 ** 31);
  await assert.rejects(scanArchive(root),/smaller than 2 GiB/);
  await rm(huge);
  await assert.rejects(scanArchive(root),/missing vendor/);
});

test('the native publisher check accepts a timestamped Windows fixture and rejects a different pin',
  { skip: process.platform !== 'win32' }, async t => {
    const { execFileSync } = await import('node:child_process');
    const { copyFile } = await import('node:fs/promises');
    const root = await mkdtemp(path.join(tmpdir(),'signed-fixture-'));
    t.after(() => rm(root,{recursive:true,force:true}));
    const shell = path.join(process.env.ProgramFiles,'PowerShell','7','pwsh.exe');
    const fixture = JSON.parse(execFileSync(shell,['-NoProfile','-NonInteractive','-Command',
      "$f=(Get-Command dotnet.exe -CommandType Application | Select-Object -First 1).Source;" +
      "$s=Get-AuthenticodeSignature -LiteralPath $f; if ($s.Status -ne 'Valid' -or !$s.TimeStamperCertificate) {throw 'Unavailable signed test fixture'};" +
      "[pscustomobject]@{file=$f;pin=$s.SignerCertificate.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256)} | ConvertTo-Json -Compress"
    ],{encoding:'utf8'}));
    const names = ['Lunden.exe','Lunden-Setup-0.3.2-win-x64.exe'];
    const sha = hash(await readFile(fixture.file));
    for(const n of names) await copyFile(fixture.file,path.join(root,n));
    await writeFile(path.join(root,'SHA256SUMS'),names.map(n => sha+'  '+n).join('\n')+'\n');
    const inputs = { version:'0.3.2',signer:fixture.pin,keyDigest:hash('test key') }, commit='1'.repeat(40);
    const record = { tag:'v0.3.2',commit,signerCertificateSha256:inputs.signer,manifestPublicKeySha256:inputs.keyDigest,launcherSha256:sha };
    async function saveRecord() { await writeFile(path.join(root,'launcher-build.json'),JSON.stringify(record)); }
    await saveRecord();
    assert.equal((await inspectLauncher(root,inputs,commit,'v0.3.2')).sha256,sha);
    inputs.signer = record.signerCertificateSha256 = '0'.repeat(64);
    await saveRecord();
    await assert.rejects(inspectLauncher(root,inputs,commit,'v0.3.2'),/publisher leaf/);
});
