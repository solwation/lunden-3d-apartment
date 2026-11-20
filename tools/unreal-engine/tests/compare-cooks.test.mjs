import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compareCooks } from '../compare-cooks.mjs';

test('compares same-size changed bytes, additions, removals and identical containers', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'lunden-cooks-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = path.join(root, 'first'), second = path.join(root, 'second');
  for (const dir of [first, second]) {
    await mkdir(dir);
    await writeFile(path.join(dir, 'global.utoc'), 'index');
  }
  await assert.rejects(compareCooks(first, first), /distinct/);
  await assert.rejects(compareCooks(first, second), /Missing .ucas/);
  await writeFile(path.join(first, 'zone.ucas'), 'one');
  await writeFile(path.join(second, 'zone.ucas'), 'two');
  await writeFile(path.join(first, 'old.pak'), 'old');
  await writeFile(path.join(second, 'new.pak'), 'new');
  await writeFile(path.join(first, 'irrelevant.log'), 'unused');
  const report = await compareCooks(first, second);
  assert.deepEqual(report.counts, { identical: 1, changed: 1, added: 1, removed: 1 });
  assert.deepEqual(report.files.map(f => [f.name, f.status]), [
    ['global.utoc', 'identical'], ['new.pak', 'added'], ['old.pak', 'removed'], ['zone.ucas', 'changed'],
  ]);
  assert.equal(report.files[3].after.bytes, 3);
  assert.notEqual(report.files[3].before.sha256, report.files[3].after.sha256);
});
