import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { draft } from '../make-manifest.mjs';
import { elfX64, generateLinux, scanLinuxArchive } from '../make-linux-manifest.mjs';
import { signManifest } from '../sign-manifest.mjs';
import { readVerifiedManifest, verifyPublishedBytes } from '../verify-published.mjs';

const elf = Buffer.from([127,69,76,70,2,1,1,0,0,0,0,0,0,0,0,0,2,0,62,0]); // Header fixture; never executed.
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const runtime = 'Engine/Binaries/Linux/UnrealGame-Linux-Shipping';
const release = { appVersion:'1.2.3', contentVersion:4, published:'2026-11-19T20:21:22.000Z',
  channel:'test', tag:'app-v1.2.3', minLauncher:'1.0.0', platform:'linux-x64' };
const pair = generateKeyPairSync('ec', { namedCurve:'P-256' });
const pem = pair.publicKey.export({ type:'spki', format:'pem' });
const privatePem = pair.privateKey.export({ type:'pkcs8', format:'pem' });

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lunden-linux-manifest-'));
  t.after(() => rm(root, { recursive:true, force:true }));
  const archive = path.join(root, 'archive'), launcherDir = path.join(root, 'launcher');
  async function put(name, bytes) {
    const target = path.join(archive, name);
    await mkdir(path.dirname(target), { recursive:true }); await writeFile(target, bytes);
  }
  await put(runtime, elf);
  for (const [name, extensions] of [['global',['utoc','ucas']], ['Lunden-Linux',['pak','utoc','ucas']]])
    for (const ext of extensions) await put('Lunden/Content/Paks/' + name + '.' + ext, Buffer.from(name));
  const commit = 'a'.repeat(40), launcherCommit = 'b'.repeat(40);
  await put('build-info.json', JSON.stringify({ platform:'linux-x64',commit,releaseScriptBlob:'c'.repeat(40),
    appVersion:'1.2.3', contentVersion:4, engineVersion:'5.8.4', runtime:{path:runtime,sha256:hash(elf)}, import:{gate:'passed'} }));
  await mkdir(launcherDir); await writeFile(path.join(launcherDir,'Lunden'),elf);
  await writeFile(path.join(launcherDir,'launcher-build-linux.json'),JSON.stringify({ platform:'linux-x64',
    commit:launcherCommit, version:'1.0.0', sha256:hash(elf), manifestPublicKeySha256:hash(pem) }));
  const publicKey = path.join(root,'public.pem'); await writeFile(publicKey,pem);
  return { root, archive, launcherDir, publicKey, archiveCommit:commit, launcherCommit, launcherVersion:'1.0.0',
    out:path.join(root,'draft'), ...release, put };
}

test('real embedded archive bytes produce a signed Linux draft accepted only by the Linux reader', async t => {
  const f = await fixture(t), first = await generateLinux(f);
  assert.equal(first.manifest.platform,'linux-x64');
  assert.equal(first.manifest.app.files.find(f=>f.path===runtime).executable,true);
  assert(!first.manifest.app.files.some(f=>f.authenticode));
  const bytes = await readFile(path.join(f.out,'lunden-manifest-linux-x64-test.json'));
  const sig = signManifest(bytes,privatePem,pem,'test','linux-x64');
  assert.deepEqual(readVerifiedManifest(bytes,sig,pem,'test','linux-x64'),first.manifest);
  assert.throws(()=>readVerifiedManifest(bytes,sig,pem,'test'),/platform/);
  assert.throws(()=>signManifest(bytes,privatePem,pem,'test'),/platform/);
  let fetched = false; const old = globalThis.fetch;
  globalThis.fetch = () => { fetched=true; throw Error('must not request foreign payload'); };
  try { await assert.rejects(verifyPublishedBytes(bytes,sig,pem,'test'),/platform/); }
  finally { globalThis.fetch=old; }
  assert.equal(fetched,false);
  const exportFixture = process.env.LUNDEN_LINUX_SIGNED_MANIFEST_DIR;
  if (exportFixture) {
    await mkdir(exportFixture,{recursive:true});
    await Promise.all([writeFile(path.join(exportFixture,'manifest.json'),bytes),
      writeFile(path.join(exportFixture,'manifest.json.sig'),sig),writeFile(path.join(exportFixture,'public.pem'),pem)]);
  }
});

test('Linux archives reject Windows or foreign ELF, symbolic links and incomplete IoStore', async t => {
  const f = await fixture(t);
  await f.put('foreign.exe',Buffer.from('MZ'));
  await assert.rejects(scanLinuxArchive(f.archive),/Windows/); await rm(path.join(f.archive,'foreign.exe'));
  const arm = Buffer.from(elf); arm[18]=183; assert.equal(elfX64(arm),false);
  await f.put(runtime,arm); await assert.rejects(scanLinuxArchive(f.archive),/ELF x86_64/);
  await f.put(runtime,elf);
  if (process.platform !== 'win32') {
    await symlink(runtime,path.join(f.archive,'link')); await assert.rejects(scanLinuxArchive(f.archive),/Linked/);
    await rm(path.join(f.archive,'link'));
  }
  await rm(path.join(f.archive,'Lunden/Content/Paks/global.utoc'));
  await assert.rejects(scanLinuxArchive(f.archive),/Incomplete/);
});

test('Linux draft binds completed runtime, public key and launcher and cannot reuse Windows metadata', async t => {
  const f = await fixture(t);
  await assert.rejects(generateLinux({...f,archiveCommit:'d'.repeat(40)}),/provenance/);
  await writeFile(path.join(f.launcherDir,'Lunden'),Buffer.concat([elf,Buffer.from('changed')]));
  await assert.rejects(generateLinux(f),/launcher bytes/);
  await writeFile(path.join(f.launcherDir,'Lunden'),elf);
  const files = await scanLinuxArchive(f.archive);
  const launcher = {version:'1.0.0',size:20,sha256:hash(elf),url:'https://example.invalid/Lunden'};
  const previous = draft(files,launcher,release).manifest;
  assert.throws(()=>draft(files,launcher,{...release,published:'2026-11-20T20:21:22Z'}, {...previous,platform:'win-x64'}),/another platform/);
  const invalid = structuredClone(previous); invalid.app.files[0].path='Engine/Binaries/Win64/UnrealGame-Win64-Shipping.exe';
  assert.throws(()=>signManifest(Buffer.from(JSON.stringify(invalid)),privatePem,pem,'test','linux-x64'),/Windows files/);
  const missing = structuredClone(previous); delete missing.app.files.find(f=>f.path===runtime).executable;
  assert.throws(()=>signManifest(Buffer.from(JSON.stringify(missing)),privatePem,pem,'test','linux-x64'),/entry point/);
});
