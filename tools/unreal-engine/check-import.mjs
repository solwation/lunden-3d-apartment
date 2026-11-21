// Is the local Unreal import as new as the export? (#2305) The release gate: tools/unreal-engine/release.ps1 runs it
// before BuildCookRun and refuses to build on any non-zero exit. No Unreal and no browser are needed.
//   node tools/unreal-engine/check-import.mjs [--dir unreal/Lunden/Import] [--generated unreal/Lunden/Content/Lunden/Generated]
//   node tools/unreal-engine/check-import.mjs --write-sync-stamp --steps import,build_l1007,… [--partial]   (sync-import.ps1 only)
// Three checks, in order:
//   1. the export in --dir is current for the working tree (tools/unreal-engine/check-export.mjs: sources, hashes, schemas);
//   2. every zone of the export has Generated/<zone>/import-stamp.json (tools/unreal-engine/python/import_world.py) for
//      that exact GLB (SHA-256), the current importer version, material map and locked engine, and every package file
//      the stamp lists is still byte-identical (no lost or hand-edited asset, no partial import);
//   3. Generated/sync-stamp.json says the whole chain of tools/unreal-engine/sync-import.ps1 (import, the derived
//      levels, compose_world.py --check and the quick tests) last succeeded for this export manifest with the current
//      builder scripts, so a measurement that only reaches measurements.json (START, lamps) cannot ship stale either.
// Exit codes: 0 current; 1 the import is older than the export (or never ran / partial / builders changed);
// 2 no current export (missing, STALE or invalid). Both failures print the command that fixes them.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, sha256, sha256File } from './sources.mjs';

export const SYNC_STAMP = 'sync-stamp.json';
export const SYNC_STAMP_FORMAT = 1;
export const FIX = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\\unreal-engine\\sync-import.ps1';

/** CRLF-normalised SHA-256 of a text file (a Windows checkout hashes like Linux; as import_world.py's material map). */
const textSha = (abs) => sha256(Buffer.from(fs.readFileSync(abs).toString('latin1').replace(/\r\n/g, '\n'), 'latin1'));

/** What the importer and the derived-level builders are built from: a change makes the last sync stale. */
export function builderInputs(root = ROOT) {
  const py = path.join(root, 'tools/unreal-engine/python');
  const canvases = 'tools/unreal-engine/backdrop-textures';
  const files = [
    ...fs.readdirSync(path.join(root, canvases)).filter((f) => f.endsWith('.png')).map((f) => `${canvases}/${f}`),
    ...fs.readdirSync(py).filter((f) => f.endsWith('.py')).map((f) => `tools/unreal-engine/python/${f}`),
    'tools/unreal-engine/world-levels.json', 'tools/unreal-engine/material-map.json',
  ].filter((p) => fs.existsSync(path.join(root, p))).sort();
  return sha256(files.map((p) => {
    const abs = path.join(root, p);
    return `${p.endsWith('.png') ? sha256File(abs) : textSha(abs)}  ${p}\n`;
  }).join(''));
}

/** The importer's own version, material-map hash and the locked engine, read from the checkout. */
export function importerFacts(root = ROOT) {
  const src = fs.readFileSync(path.join(root, 'tools/unreal-engine/python/import_world.py'), 'utf8');
  const m = src.match(/^IMPORTER_VERSION\s*=\s*(\d+)/m);
  if (!m) throw new Error('tools/unreal-engine/python/import_world.py has no IMPORTER_VERSION');
  return {
    importerVersion: Number(m[1]),
    materialMap: textSha(path.join(root, 'tools/unreal-engine/material-map.json')),
    engine: fs.readFileSync(path.join(root, 'unreal/Lunden/ENGINE_VERSION'), 'utf8').trim(),
  };
}

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, base, out); else out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return out;
}

/** Problems of one zone's import against its export entry ([] = current). */
export function zoneProblems(entry, manifest, generated, facts) {
  const zone = entry.zone, dir = path.join(generated, zone), stampPath = path.join(dir, 'import-stamp.json');
  if (!fs.existsSync(stampPath)) return [`${zone}: never imported (no ${path.basename(generated)}/${zone}/import-stamp.json)`];
  let stamp;
  try { stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8')); } catch (e) { return [`${zone}: unreadable import-stamp.json (${e.message})`]; }
  const out = [];
  if (stamp.export?.sha256 !== entry.sha256) {
    out.push(`${zone}: imported from an older export (${stamp.export?.sha256?.slice(0, 12) ?? '?'} of ${stamp.export?.sourceCommit?.slice(0, 8) ?? '?'}; `
      + `the export has ${entry.sha256.slice(0, 12)} of ${manifest.sourceCommit?.slice(0, 8) ?? '?'})`);
  }
  if (stamp.importerVersion !== facts.importerVersion) out.push(`${zone}: imported by importer v${stamp.importerVersion}, the checkout has v${facts.importerVersion}`);
  if (stamp.materialMap !== facts.materialMap) out.push(`${zone}: imported with another material-map.json`);
  if (!(stamp.engine === facts.engine || String(stamp.engine ?? '').startsWith(`${facts.engine}-`))) out.push(`${zone}: imported on engine ${stamp.engine}, the project is locked to ${facts.engine}`);
  if (out.length) return out;
  const listed = stamp.files ?? {};
  const onDisk = new Set(walk(dir).filter((p) => p !== 'import-stamp.json'));
  const bad = [];
  for (const [rel, hash] of Object.entries(listed)) {
    if (!onDisk.has(rel)) bad.push(`${rel} missing`);
    else if (sha256File(path.join(dir, rel)) !== hash) bad.push(`${rel} changed`);
    onDisk.delete(rel);
  }
  for (const rel of onDisk) bad.push(`${rel} not written by the import`);
  if (bad.length) out.push(`${zone}: ${bad.length} package file(s) differ from the import stamp (hand edit or partial import), e.g. ${bad[0]}`);
  return out;
}

/** Problems of Generated/sync-stamp.json against the export manifest and the builder scripts. */
export function syncProblems(manifestSha, generated, inputs) {
  const p = path.join(generated, SYNC_STAMP);
  if (!fs.existsSync(p)) return ['no completed sync-import.ps1 run recorded (Generated/sync-stamp.json): the derived levels and checks never ran for this import'];
  let s;
  try { s = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return [`unreadable ${SYNC_STAMP} (${e.message})`]; }
  const out = [];
  if (s.exportManifestSha256 !== manifestSha) out.push(`the last sync-import ran for another export (${s.sourceCommit?.slice(0, 8) ?? '?'}): derived levels and checks are older than the export`);
  else if (!s.complete) out.push(`the last sync-import for this export was partial (${(s.steps ?? []).join(', ')}): derived levels and checks did not all run`);
  if (s.builderInputs !== inputs) out.push('the importer/builder scripts, world-levels.json or material-map.json changed since the last sync-import');
  return out;
}

const opt = (args, name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };

export function main(args = process.argv.slice(2), log = console.log) {
  const dir = path.resolve(ROOT, opt(args, 'dir', 'unreal/Lunden/Import'));
  const generated = path.resolve(ROOT, opt(args, 'generated', 'unreal/Lunden/Content/Lunden/Generated'));
  const manifestPath = path.join(dir, 'export-manifest.json');

  if (args.includes('--write-sync-stamp')) { // sync-import.ps1, after every step succeeded
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const stamp = { formatVersion: SYNC_STAMP_FORMAT, writer: 'tools/unreal-engine/sync-import.ps1', exportManifestSha256: sha256File(manifestPath),
      sourceHash: manifest.sourceHash, sourceCommit: manifest.sourceCommit, sourceDirty: manifest.sourceDirty,
      zones: manifest.files.filter((f) => f.kind === 'glb').map((f) => f.zone), steps: (opt(args, 'steps', '') || '').split(',').filter(Boolean),
      complete: !args.includes('--partial'), builderInputs: builderInputs(), completedUtc: new Date().toISOString() };
    fs.mkdirSync(generated, { recursive: true });
    fs.writeFileSync(path.join(generated, SYNC_STAMP), JSON.stringify(stamp, null, 1) + '\n');
    log(`sync stamp written: ${stamp.complete ? 'complete' : 'PARTIAL'} sync of ${stamp.sourceCommit?.slice(0, 8)} (${stamp.steps.join(', ')})`);
    return 0;
  }

  // 1. the export itself
  const ce = spawnSync(process.execPath, [path.join(ROOT, 'tools/unreal-engine/check-export.mjs'), '--dir', dir], { cwd: ROOT, encoding: 'utf8' });
  for (const line of (ce.stdout || '').trimEnd().split('\n')) if (line) log(`  ${line}`);
  if (ce.status !== 0) {
    log(`IMPORT GATE: no current Unreal export (check-export.mjs exit ${ce.status ?? ce.error?.message}).`);
    log(`Fix: ${FIX}   (fetches or rebuilds the export for this commit, then imports)`);
    return 2;
  }
  // 2. per zone, 3. the sync chain
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const facts = importerFacts();
  const zones = manifest.files.filter((f) => f.kind === 'glb');
  const problems = zones.flatMap((e) => zoneProblems(e, manifest, generated, facts));
  const current = zones.filter((e) => !problems.some((p) => p.startsWith(`${e.zone}:`))).map((e) => e.zone);
  if (!problems.length) problems.push(...syncProblems(sha256File(manifestPath), generated, builderInputs()));
  if (problems.length) {
    log(`IMPORT GATE: the Unreal import is older than the export of ${manifest.sourceCommit?.slice(0, 8) ?? '?'} (${problems.length} problem${problems.length > 1 ? 's' : ''}):`);
    for (const p of problems.slice(0, 30)) log(`  ${p}`);
    if (problems.length > 30) log(`  … ${problems.length - 30} more`);
    if (current.length && current.length < zones.length) log(`  current zones (skipped by the next import): ${current.join(', ')}`);
    log(`Fix: ${FIX}   (imports only the changed zones, rebuilds the derived levels, runs compose_world.py --check and the quick tests)`);
    return 1;
  }
  log(`Unreal import is current: ${zones.length} zones (${zones.map((z) => z.zone).join(', ')}) match the export of ${manifest.sourceCommit?.slice(0, 8)}; last sync-import complete`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exit(main());
