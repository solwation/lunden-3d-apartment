// Export the web scene for Unreal (#2245): GLB per zone + measurements.json + export-manifest.json.
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright tools/browsertest.sh node tools/unreal-engine/export-world.mjs [--out DIR] [--zones l1007,l1007-uteplats,fixture]
// Runs the real scene builder (src/world.js buildWorld) headless in Chromium via tools/unreal-engine/export.html and
// tools/unreal-engine/export-scene.js, serving the repository itself from a private 127.0.0.1 port (no other server needed).
// Output (default unreal/Lunden/Import/, ignored by Git: rebuilt locally, never committed) is deterministic: Date is
// fixed, Math.random is seeded, nothing time-dependent is written, so two runs from the same commit give the same
// SHA-256 for every file. three.js is served from node_modules/three when its version matches the import map
// (offline and reproducible); otherwise the page loads it from the CDN like the game.
// Check staleness later without Unreal: node tools/unreal-engine/check-export.mjs (docs/development/unreal.md).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { ROOT, sourceList, sha256 } from './sources.mjs';

export const MANIFEST_FORMAT_VERSION = 1;
const FIXED_TIME = '2026-06-15T12:00:00Z'; // a summer noon: no seasonal extras (Christmas tree, snow) in the export
const RANDOM_SEED = 2245;
const THREE_VERSION = '0.170.0'; // must match tools/unreal-engine/export.html and index.html's import map

const MERGE_WRAPPER = `import * as real from '/src/merge.js?export-real';
export * from '/src/merge.js?export-real';
export function mergeStatic(root, keep = [], cellOf = () => '', opts = {}) {
  if (typeof cellOf === 'function' && cellOf.length === 1 && !opts?.tagged) { globalThis.__exportSkippedMerges = (globalThis.__exportSkippedMerges ?? 0) + 1; return { before: 0, after: 0 }; }
  return real.mergeStatic(root, keep, cellOf, opts);
}
`;

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const outDir = path.resolve(ROOT, opt('out', 'unreal/Lunden/Import'));
const zones = opt('zones', 'l1007,l1007-uteplats,fixture').split(',').map((s) => s.trim()).filter(Boolean);

const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } };

/** A minimal static server for the repository (GET only, no directory listings), on an ephemeral local port. */
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
    '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const abs = path.join(ROOT, p);
    if (!abs.startsWith(ROOT + path.sep) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(abs)] ?? 'application/octet-stream' });
    fs.createReadStream(abs).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function main() {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const commit = git('rev-parse', 'HEAD');
  const { files: sources, sourceHash } = sourceList();
  const dirty = git('status', '--porcelain', '--', ...sources.map((s) => s.path));
  const localThree = path.join(ROOT, 'node_modules/three');
  const threeOk = fs.existsSync(path.join(localThree, 'package.json'))
    && JSON.parse(fs.readFileSync(path.join(localThree, 'package.json'), 'utf8')).version === THREE_VERSION;
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
  let result;
  try {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 200 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (threeOk) await page.route(`https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/**`, (route) => {
      const rel = new URL(route.request().url()).pathname.replace(`/npm/three@${THREE_VERSION}/`, '');
      const abs = path.join(localThree, rel);
      return fs.existsSync(abs) ? route.fulfill({ path: abs, contentType: 'text/javascript' }) : route.abort();
    });
    // the world's own static bake (src/world.js: one mesh per material and level, #48) is a draw-call optimisation for the
    // web; the export wants the pieces (each wall its own node with its plan source). src/merge.js is served wrapped so
    // that only the cell-sorting calls (mergeStatic(root, keep, (o) => cell)) are skipped; doors, furniture pieces and
    // small models keep their per-object merge. Nothing in src/ changes; the game never sees this wrapper.
    await page.route((url) => url.pathname === '/src/merge.js' && !url.search, (route) => route.fulfill({ contentType: 'text/javascript', body: MERGE_WRAPPER }));
    await page.clock.setFixedTime(new Date(FIXED_TIME));
    await page.addInitScript((seed) => { // a seeded Math.random (mulberry32) before any module runs
      let a = seed >>> 0;
      Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }, RANDOM_SEED);
    await page.goto(`${base}/tools/unreal-engine/export.html`);
    result = await page.evaluate(async ({ zones, commit }) => {
      const m = await import('/tools/unreal-engine/export-scene.js');
      return m.exportWorld({ zones, commit });
    }, { zones, commit });
    result.report.skippedMerges = await page.evaluate(() => globalThis.__exportSkippedMerges ?? 0);
    if (errors.length) console.warn(`page errors (export continued):\n  ${errors.join('\n  ')}`);
  } finally {
    await browser.close();
    server.close();
  }

  // the terrain: a reference to data/elevation.json (its grid and hash), not a copy of the heights
  const elevation = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/elevation.json'), 'utf8'));
  result.measurements.terrain = { file: 'data/elevation.json', sha256: sources.find((s) => s.path === 'data/elevation.json')?.sha256 ?? null,
    id: elevation.id, x0: elevation.x0, z0: elevation.z0, step: elevation.step, cols: elevation.cols, rows: elevation.rowsN,
    unit: elevation.unit, ref: elevation.ref, refAbsM: elevation.refAbsM, source: elevation.source, licence: elevation.licence,
    grids: { h: 'heights (dm, rows north → south)', g: 'see data/elevation.json and src/elevation.js' } };

  // write: clear what an earlier export wrote (only the files its manifest lists), then the new files
  fs.mkdirSync(outDir, { recursive: true });
  const manifestPath = path.join(outDir, 'export-manifest.json');
  if (fs.existsSync(manifestPath)) {
    try { for (const f of JSON.parse(fs.readFileSync(manifestPath, 'utf8')).files ?? []) fs.rmSync(path.join(outDir, path.basename(f.path)), { force: true }); } catch { /* unreadable: overwrite */ }
  }
  const files = [];
  for (const [name, b64] of Object.entries(result.glbs).sort(([a], [b]) => a.localeCompare(b))) {
    const buf = Buffer.from(b64, 'base64');
    fs.writeFileSync(path.join(outDir, name), buf);
    const z = result.report.zones.find((r) => `${r.zone}.glb` === name);
    files.push({ path: name, kind: 'glb', zone: z.zone, sha256: sha256(buf), bytes: buf.length, nodes: z.nodes, triangles: z.triangles });
  }
  const mBuf = Buffer.from(JSON.stringify(result.measurements, null, 1) + '\n');
  fs.writeFileSync(path.join(outDir, 'measurements.json'), mBuf);
  files.push({ path: 'measurements.json', kind: 'measurements', zone: null, sha256: sha256(mBuf), bytes: mBuf.length, nodes: null, triangles: null });
  const manifest = {
    formatVersion: MANIFEST_FORMAT_VERSION,
    kind: 'lunden-export-manifest',
    generator: 'tools/unreal-engine/export-world.mjs',
    sourceCommit: commit,
    sourceDirty: !!dirty,
    sourceHash,
    settings: { fixedTime: FIXED_TIME, randomSeed: RANDOM_SEED, three: THREE_VERSION, zones },
    files,
    sources,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');

  console.log(`export → ${path.relative(ROOT, outDir) || '.'}  (commit ${commit?.slice(0, 8) ?? '?'}${dirty ? ', DIRTY sources' : ''}, three ${threeOk ? 'local' : 'CDN'})`);
  for (const f of files) console.log(`  ${f.path.padEnd(22)} ${String(f.bytes).padStart(9)} B  sha256 ${f.sha256}${f.nodes ? `  nodes ${f.nodes}, triangles ${f.triangles}` : ''}`);
  console.log(`  export-manifest.json   sha256 ${sha256(fs.readFileSync(manifestPath))}`);
  console.log(`  kinds ${JSON.stringify(result.report.kinds)}; skipped ${JSON.stringify(result.report.skipped)}; world static merges skipped: ${result.report.skippedMerges}`);
  if (result.report.lightsError) console.log(`  note: room lights not built (${result.report.lightsError})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
