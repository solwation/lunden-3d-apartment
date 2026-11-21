// #2305: the Unreal export workflow's comparison and issue reporting, without GitHub (a fake gh records the calls).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareManifests, markdown, report, ghRunner, MARKER, GREEN, ISSUE_TITLE, artifactName } from '../export-ci.mjs';

const glb = (zone, sha, nodes, triangles) => ({ path: `${zone}.glb`, kind: 'glb', zone, sha256: sha.padEnd(64, '0'), bytes: 100, nodes, triangles });
const manifest = (commit, sourceHash, files, sources = [{ path: 'src/config.js', sha256: 'a' }]) => ({
  sourceCommit: commit.padEnd(40, '0'), sourceHash: sourceHash.padEnd(64, '0'),
  files: [...files, { path: 'measurements.json', kind: 'measurements', zone: null, sha256: 'm'.padEnd(64, '0') }], sources });

const prev = manifest('aaaa', '11', [glb('l1007', 'a1', 2614, 881000), glb('fixture', 'f1', 14, 0), glb('gard', 'g1', 300, 9000)]);

test('a measurement change: changed zones re-import, unchanged ones are listed as skipped, no deviation', () => {
  const cur = manifest('bbbb', '22', [glb('l1007', 'a2', 2614, 881010), glb('fixture', 'f1', 14, 0), glb('gard', 'g1', 300, 9000)],
    [{ path: 'src/config.js', sha256: 'b' }]);
  const d = compareManifests(prev, cur);
  assert.deepEqual(d.rows.map((r) => [r.zone, r.status]), [['fixture', 'unchanged'], ['gard', 'unchanged'], ['l1007', 'changed']]);
  assert.deepEqual(d.sources.changed, ['src/config.js']);
  assert.deepEqual(d.deviations, []);
  const md = markdown(d);
  assert.match(md, /\| l1007 \| changed \| 2,614 \| 881,010 \(\+10\) \|/);
  assert.match(md, /1 of 3 zones to re-import/);
  assert.match(md, /No deviations/);
});

test('deviations: a zone gone, a zone emptied or more than halved, other bytes from the same sources', () => {
  const cur = manifest('bbbb', '22', [glb('l1007', 'a2', 1000, 881000), glb('fixture', 'f1', 14, 0)]);
  const d = compareManifests(prev, cur);
  assert.deepEqual(d.deviations, ['zone gard is no longer exported', 'zone l1007: nodes 2614 → 1000 (less than 50 %)']);
  const same = compareManifests(prev, manifest('cccc', '11', [glb('l1007', 'a9', 2614, 881000), glb('fixture', 'f1', 14, 0), glb('gard', 'g1', 300, 0)]));
  assert.deepEqual(same.deviations, ['zone gard: triangles 9000 → 0', `same sources (${'11'.padEnd(12, '0')}) gave other bytes: l1007 (the export is not deterministic)`]);
});

test('first export: nothing to compare, no deviation', () => {
  const d = compareManifests(null, prev);
  assert.deepEqual(d.deviations, []);
  assert.ok(d.rows.every((r) => r.status === 'new'));
  assert.match(markdown(d), /against nothing \(first export\)/);
});

test('artifact name is the first 16 hex of the source hash', () => {
  assert.equal(artifactName('0123456789abcdef0123'), 'unreal-export-0123456789abcdef');
});

function fakeGh(issues = [], comments = []) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    if (args[0] === 'issue' && args[1] === 'list') return { status: 0, stdout: JSON.stringify(issues) };
    if (args[0] === 'issue' && args[1] === 'view') return { status: 0, stdout: JSON.stringify({ comments }) };
    return { status: 0, stdout: '' };
  };
  return { gh, calls };
}
const ctx = { runUrl: 'https://github.com/x/y/actions/runs/1', commit: 'c0ffee', repo: 'solwation/lunden-3d-apartment' };

test('a failure opens one issue with Lapp, marker, labels and the failed step', () => {
  const { gh, calls } = fakeGh([{ number: 7, body: 'another issue' }]);
  assert.deepEqual(report({ ...ctx, outcome: 'failure', failed: 'export' }, gh), { action: 'create', issue: null });
  const create = calls.find((c) => c[1] === 'create');
  const body = create[create.indexOf('--body') + 1];
  assert.equal(create[create.indexOf('--title') + 1], ISSUE_TITLE);
  assert.match(body, /^Lapp: Unreal-exporten larmar/);
  assert.ok(body.includes(MARKER) && body.includes('step "export"') && body.includes(ctx.runUrl));
  assert.deepEqual(create.filter((_, i) => create[i - 1] === '--label'), ['bug', 'priority: medium']);
  assert.ok(create.includes('--repo'));
});

test('a deviation on an already open issue comments instead of opening a second one', () => {
  const { gh, calls } = fakeGh([{ number: 9, body: `x ${MARKER}` }, { number: 4, body: `y ${MARKER}` }]);
  const r = report({ ...ctx, outcome: 'success', diff: { deviations: ['zone gard is no longer exported'] } }, gh);
  assert.deepEqual(r, { action: 'comment', issue: 4 });
  assert.equal(calls.filter((c) => c[1] === 'create').length, 0);
  assert.match(calls.at(-1).join(' '), /zone gard is no longer exported/);
});

test('green with an open issue notes it once; green without an issue does nothing', () => {
  const open = [{ number: 4, body: MARKER }];
  let f = fakeGh(open, [{ body: `${MARKER}\nfailed` }]);
  assert.deepEqual(report({ ...ctx, outcome: 'success', diff: { deviations: [] } }, f.gh), { action: 'green', issue: 4 });
  assert.ok(f.calls.at(-1).join(' ').includes(GREEN));
  f = fakeGh(open, [{ body: `${MARKER}\nfailed` }, { body: `${GREEN}\ngreen` }]);
  assert.deepEqual(report({ ...ctx, outcome: 'success', diff: { deviations: [] } }, f.gh), { action: 'none', issue: 4 });
  f = fakeGh([]);
  assert.deepEqual(report({ ...ctx, outcome: 'success', diff: null }, f.gh), { action: 'none', issue: null });
  assert.equal(f.calls.length, 1);
});

test('--dry-run prints the gh commands and runs nothing', () => {
  const lines = [];
  const r = report({ ...ctx, outcome: 'failure', failed: 'check-export' }, ghRunner({ dryRun: true, log: (l) => lines.push(l) }));
  assert.equal(r.action, 'create');
  assert.match(lines[0], /^DRY-RUN gh issue list --repo solwation\/lunden-3d-apartment --state open/);
  assert.match(lines[1], /^DRY-RUN gh issue create .*--label bug --label "priority: medium"$/s);
});
