// #1606: every src/ file the Worker imports (directly or through other imports) must be in the deploy workflow's
// `paths`, or a change to it alone redeploys Pages but not the Worker, and the two drift apart.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT = /(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

/** The repo-relative files reachable from `entry` through relative static/dynamic imports. */
function graph(entry) {
  const seen = new Set(), todo = [entry];
  while (todo.length) {
    const file = todo.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const m of readFileSync(join(root, file), 'utf8').matchAll(IMPORT)) todo.push(relative(root, resolve(dirname(join(root, file)), m[1] ?? m[2])));
  }
  return seen;
}

test('the Worker deploy workflow triggers on every src/ file the Worker imports', () => {
  const yml = readFileSync(join(root, '.github/workflows/cloud.yml'), 'utf8');
  const paths = [...yml.match(/paths:\s*\[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const covered = (f) => paths.some((p) => p === f || (p.endsWith('/**') && f.startsWith(p.slice(0, -2))));
  const missing = [...graph('cloudflare/worker.js')].filter((f) => !covered(f)).sort();
  assert.deepEqual(missing, [], `add to .github/workflows/cloud.yml paths: ${missing.join(', ')}`);
});
