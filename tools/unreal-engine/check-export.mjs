// Is the Unreal export current? (#2245) Runs without Unreal and without a browser:
//   node tools/unreal-engine/check-export.mjs [--dir unreal/Lunden/Import] [--allow-missing]
// Compares the sources recorded in export-manifest.json (the export's import closure in src/, data/plan.json,
// data/elevation.json, models/*.glb and the exporter itself; tools/unreal-engine/sources.mjs) with the working tree, checks
// every exported file against its SHA-256, and validates the manifest, measurements.json and every GLB node's
// extras against shared/schema/, and that every node id is unique across all zone GLBs and each node carries its own
// file's zone (a node in exactly one zone, #2279). Exit codes: 0 current; 1 STALE (a source changed: re-export and re-import);
// 2 no export found (0 with --allow-missing, for checks on machines that never export); 3 invalid export
// (unknown format version, schema error, modified or missing file).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, sourceList, sha256File } from './sources.mjs';
import { validate, glbJson } from './json-schema.mjs';

export const SUPPORTED_FORMAT_VERSION = 1;

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const dir = path.resolve(ROOT, opt('dir', 'unreal/Lunden/Import'));
const schema = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'shared/schema', name), 'utf8'));
const rel = (p) => path.relative(ROOT, p) || '.';

function main() {
  const manifestPath = path.join(dir, 'export-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.log(`no Unreal export in ${rel(dir)} — build one with: tools/browsertest.sh node tools/unreal-engine/export-world.mjs`);
    return args.includes('--allow-missing') ? 0 : 2;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const problems = [];
  if (!Number.isInteger(manifest.formatVersion) || manifest.formatVersion > SUPPORTED_FORMAT_VERSION) {
    console.log(`INVALID: export-manifest.json formatVersion ${manifest.formatVersion} is newer than this checker (${SUPPORTED_FORMAT_VERSION}); update the tools`);
    return 3;
  }
  problems.push(...validate(manifest, schema('export-manifest.schema.json')).map((e) => `export-manifest.json ${e}`));
  const nodeSchema = schema('node-extras.schema.json'), measureSchema = schema('measurements.schema.json');
  let nodes = 0;
  const zoneOfId = new Map(); // every node id across all zone GLBs → its zone (#2279: a node is in exactly one zone)
  for (const f of manifest.files ?? []) {
    const abs = path.join(dir, f.path);
    if (!fs.existsSync(abs)) { problems.push(`${f.path}: missing`); continue; }
    if (sha256File(abs) !== f.sha256) { problems.push(`${f.path}: SHA-256 differs from the manifest (edited or from another export)`); continue; }
    if (f.kind === 'measurements') {
      const m = JSON.parse(fs.readFileSync(abs, 'utf8'));
      if (m.formatVersion > SUPPORTED_FORMAT_VERSION) problems.push(`${f.path}: formatVersion ${m.formatVersion} unknown`);
      problems.push(...validate(m, measureSchema).map((e) => `${f.path} ${e}`));
    } else if (f.kind === 'glb') {
      const j = glbJson(fs.readFileSync(abs)), ids = new Set();
      const root = j.nodes?.[j.scenes?.[j.scene ?? 0]?.nodes?.[0]];
      if (root?.extras?.kind !== 'zone' || root.extras.formatVersion > SUPPORTED_FORMAT_VERSION) problems.push(`${f.path}: root node is not a zone of a supported format`);
      for (const [i, n] of (j.nodes ?? []).entries()) {
        nodes++;
        if (!n.extras) { problems.push(`${f.path}: node ${i} (${n.name}) has no extras`); continue; }
        for (const e of validate(n.extras, nodeSchema)) problems.push(`${f.path}: node ${n.name} ${e}`);
        if (n.name !== n.extras.id) problems.push(`${f.path}: node ${i} name ${n.name} ≠ extras.id ${n.extras.id}`);
        if (ids.has(n.extras.id)) problems.push(`${f.path}: duplicate id ${n.extras.id}`);
        ids.add(n.extras.id);
        if (n.extras.zone !== undefined && n.extras.zone !== f.zone) problems.push(`${f.path}: node ${n.name} says zone ${n.extras.zone}, file is ${f.zone}`);
        if (zoneOfId.has(n.extras.id) && zoneOfId.get(n.extras.id) !== f.zone) problems.push(`${f.path}: id ${n.extras.id} is also in zone ${zoneOfId.get(n.extras.id)}`);
        zoneOfId.set(n.extras.id, f.zone);
      }
    }
  }
  if (problems.length) {
    console.log(`INVALID export in ${rel(dir)} (${problems.length} problem${problems.length > 1 ? 's' : ''}):`);
    for (const p of problems.slice(0, 40)) console.log(`  ${p}`);
    if (problems.length > 40) console.log(`  … ${problems.length - 40} more`);
    return 3;
  }

  // staleness: the recorded sources against the working tree
  const now = sourceList();
  const was = new Map(manifest.sources.map((s) => [s.path, s.sha256])), is = new Map(now.files.map((s) => [s.path, s.sha256]));
  const changed = [...is].filter(([p, h]) => was.has(p) && was.get(p) !== h).map(([p]) => p);
  const added = [...is.keys()].filter((p) => !was.has(p)), removed = [...was.keys()].filter((p) => !is.has(p));
  let head = null;
  try { head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
  const from = `exported from ${manifest.sourceCommit?.slice(0, 8) ?? '?'}${manifest.sourceDirty ? ' (dirty)' : ''}, HEAD ${head?.slice(0, 8) ?? '?'}`;
  if (now.sourceHash === manifest.sourceHash) {
    console.log(`Unreal export is current: ${manifest.files.length} files, ${nodes} nodes (${zoneOfId.size} ids, each in one zone), ${manifest.sources.length} sources (${from})`);
    return 0;
  }
  console.log(`STALE: the Unreal import is out of date — re-run tools/unreal-engine/export-world.mjs and the Unreal import (${from})`);
  for (const [what, list] of [['changed', changed], ['new', added], ['gone', removed]]) {
    if (!list.length) continue;
    console.log(`  ${what} (${list.length}): ${list.slice(0, 12).join(', ')}${list.length > 12 ? ', …' : ''}`);
  }
  return 1;
}

process.exit(main());
