// #2305: the release gate's per-zone and sync-stamp checks against synthetic import stamps (no Unreal).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { zoneProblems, syncProblems, importerFacts, builderInputs, SYNC_STAMP } from '../check-import.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const facts = { importerVersion: 6, materialMap: 'm'.repeat(64), engine: '5.8.4' };
const manifest = { sourceCommit: 'b'.repeat(40) };
const entry = (zone, glbSha) => ({ zone, path: `${zone}.glb`, kind: 'glb', sha256: glbSha });

function importZone(generated, zone, glbSha, over = {}) {
  const dir = path.join(generated, zone);
  fs.mkdirSync(path.join(dir, 'StaticMeshes'), { recursive: true });
  const files = {};
  for (const [rel, text] of [[`Level_${zone}.umap`, `level ${zone}`], [`StaticMeshes/${zone}_wall.uasset`, `mesh ${zone}`]]) {
    fs.writeFileSync(path.join(dir, rel), text);
    files[rel] = sha(text);
  }
  const stamp = { importerVersion: 6, materialMap: facts.materialMap, engine: '5.8.4-58902052+++UE5+Release-5.8',
    export: { path: `${zone}.glb`, sha256: glbSha, sourceCommit: 'a'.repeat(40) }, files, ...over };
  fs.writeFileSync(path.join(dir, 'import-stamp.json'), JSON.stringify(stamp));
  return dir;
}

test('a zone is current only for the same GLB, importer, material map, engine and untouched package files', (t) => {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
  t.after(() => fs.rmSync(g, { recursive: true, force: true }));
  importZone(g, 'fixture', 'f1');
  assert.deepEqual(zoneProblems(entry('fixture', 'f1'), manifest, g, facts), []);
  // the export moved on (a src/config.js measurement): the zone's import is older than the export
  assert.match(zoneProblems(entry('fixture', 'f2'), manifest, g, facts)[0], /^fixture: imported from an older export \(f1 of aaaaaaaa; the export has f2 of bbbbbbbb\)/);
  assert.match(zoneProblems(entry('gard', 'g1'), manifest, g, facts)[0], /^gard: never imported/);
  assert.match(zoneProblems(entry('fixture', 'f1'), manifest, g, { ...facts, importerVersion: 7 })[0], /importer v6, the checkout has v7/);
  assert.match(zoneProblems(entry('fixture', 'f1'), manifest, g, { ...facts, engine: '5.9.0' })[0], /locked to 5\.9\.0/);
  // a hand edit, a lost file and a stray file all count
  fs.appendFileSync(path.join(g, 'fixture/Level_fixture.umap'), 'edit');
  assert.match(zoneProblems(entry('fixture', 'f1'), manifest, g, facts)[0], /1 package file\(s\) differ .* Level_fixture\.umap changed/);
  importZone(g, 'fixture', 'f1');
  fs.writeFileSync(path.join(g, 'fixture/StaticMeshes/extra.uasset'), 'x');
  assert.match(zoneProblems(entry('fixture', 'f1'), manifest, g, facts)[0], /extra\.uasset not written by the import/);
  fs.rmSync(path.join(g, 'fixture/StaticMeshes'), { recursive: true });
  assert.match(zoneProblems(entry('fixture', 'f1'), manifest, g, facts)[0], /1 package file\(s\) differ .*fixture_wall\.uasset missing/);
});

test('the sync stamp must cover this export manifest, completely, with the current builder scripts', (t) => {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
  t.after(() => fs.rmSync(g, { recursive: true, force: true }));
  assert.match(syncProblems('M1', g, 'B1')[0], /no completed sync-import\.ps1 run/);
  const write = (s) => fs.writeFileSync(path.join(g, SYNC_STAMP), JSON.stringify(s));
  write({ exportManifestSha256: 'M1', complete: true, builderInputs: 'B1', sourceCommit: 'a'.repeat(40) });
  assert.deepEqual(syncProblems('M1', g, 'B1'), []);
  assert.match(syncProblems('M2', g, 'B1')[0], /ran for another export \(aaaaaaaa\)/);
  assert.match(syncProblems('M1', g, 'B2')[0], /builder scripts.*changed/);
  write({ exportManifestSha256: 'M1', complete: false, steps: ['import'], builderInputs: 'B1' });
  assert.match(syncProblems('M1', g, 'B1')[0], /was partial \(import\)/);
});

test('the checkout facts and builder-input hash are read from the repository', () => {
  const f = importerFacts();
  assert.ok(Number.isInteger(f.importerVersion) && f.importerVersion >= 6);
  assert.match(f.engine, /^\d+\.\d+\.\d+$/);
  assert.match(f.materialMap, /^[0-9a-f]{64}$/);
  assert.match(builderInputs(), /^[0-9a-f]{64}$/);
});
