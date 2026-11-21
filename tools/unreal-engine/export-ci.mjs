// The Unreal export workflow's helpers (#2305; .github/workflows/unreal-export.yml). No browser, no Unreal.
//   node tools/unreal-engine/export-ci.mjs key
//       the export key of the working tree: sourceHash (tools/unreal-engine/sources.mjs) and the artifact name
//       unreal-export-<first 16 hex>; written to $GITHUB_OUTPUT when set. Same sources = same export (deterministic).
//   node tools/unreal-engine/export-ci.mjs compare --cur DIR [--prev DIR] [--out diff.json]
//       zone by zone against the previous export's manifest: unchanged / changed / new / gone, nodes, triangles,
//       changed sources; Markdown to stdout (and $GITHUB_STEP_SUMMARY). Deviations (a zone gone, emptied or more than
//       halved, or other bytes from the same sources) go into diff.json; the step itself never fails on them.
//   node tools/unreal-engine/export-ci.mjs report --outcome success|failure [--diff diff.json] [--failed STEP]
//       [--run-url URL] [--commit SHA] [--repo OWNER/NAME] [--dry-run]
//       keeps one open tracking issue (marker below): opens it on a failure or deviation, comments on it while it
//       stays open, and notes once when a run is green again (closing stays with a person or agent, after review).
//       --dry-run prints the gh commands instead of running them.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { sourceList } from './sources.mjs';

export const MARKER = '<!-- unreal-export-ci -->';
export const GREEN = '<!-- unreal-export-ci:green -->';
export const ISSUE_TITLE = 'Bugg: Unreal-exporten i Actions misslyckas eller avviker';
export const ISSUE_LABELS = ['bug', 'priority: medium'];
/** A zone whose node or triangle count falls below this share of the previous export counts as a deviation.
 *  A *guess* (#2305): real edits move a zone by a few per cent; halving means a builder probably failed silently. */
export const SHRINK_LIMIT = 0.5;

export const artifactName = (sourceHash) => `unreal-export-${sourceHash.slice(0, 16)}`;

const readManifest = (dir) => {
  const p = dir && path.join(dir, 'export-manifest.json');
  return p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};

/** Zone-by-zone comparison of two manifests (prev may be null). */
export function compareManifests(prev, cur) {
  const zonesOf = (m) => new Map((m?.files ?? []).filter((f) => f.kind === 'glb').map((f) => [f.zone, f]));
  const a = zonesOf(prev), b = zonesOf(cur);
  const rows = [], deviations = [];
  for (const zone of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const p = a.get(zone), c = b.get(zone);
    const status = !prev ? 'new' : !p ? 'new' : !c ? 'gone' : p.sha256 === c.sha256 ? 'unchanged' : 'changed';
    rows.push({ zone, status, prev: p ? { sha256: p.sha256, nodes: p.nodes, triangles: p.triangles, bytes: p.bytes } : null,
      cur: c ? { sha256: c.sha256, nodes: c.nodes, triangles: c.triangles, bytes: c.bytes } : null });
    if (!prev) continue;
    if (status === 'gone') deviations.push(`zone ${zone} is no longer exported`);
    if (p && c) {
      for (const k of ['nodes', 'triangles']) {
        if (p[k] > 0 && c[k] === 0) deviations.push(`zone ${zone}: ${k} ${p[k]} → 0`);
        else if (p[k] > 0 && c[k] < p[k] * SHRINK_LIMIT) deviations.push(`zone ${zone}: ${k} ${p[k]} → ${c[k]} (less than ${SHRINK_LIMIT * 100} %)`);
      }
    }
  }
  const measure = (m) => m?.files?.find((f) => f.kind === 'measurements')?.sha256 ?? null;
  const measurements = !prev ? 'new' : measure(prev) === measure(cur) ? 'unchanged' : 'changed';
  if (prev && prev.sourceHash === cur.sourceHash) {
    const differ = rows.filter((r) => r.status !== 'unchanged').map((r) => r.zone);
    if (differ.length || measurements !== 'unchanged') deviations.push(`same sources (${cur.sourceHash.slice(0, 12)}) gave other bytes: ${[...differ, ...(measurements !== 'unchanged' ? ['measurements.json'] : [])].join(', ')} (the export is not deterministic)`);
  }
  const was = new Map((prev?.sources ?? []).map((s) => [s.path, s.sha256])), is = new Map((cur.sources ?? []).map((s) => [s.path, s.sha256]));
  const sources = {
    changed: [...is].filter(([p, h]) => was.has(p) && was.get(p) !== h).map(([p]) => p),
    added: prev ? [...is.keys()].filter((p) => !was.has(p)) : [],
    removed: [...was.keys()].filter((p) => !is.has(p)),
  };
  return { prevCommit: prev?.sourceCommit ?? null, curCommit: cur.sourceCommit, sourceHash: cur.sourceHash, rows, measurements, sources, deviations };
}

const fmt = (n) => (n === null || n === undefined ? '–' : n.toLocaleString('en-US'));
const delta = (p, c) => (p === null || p === undefined || c === null || c === undefined || p === c ? '' : ` (${c > p ? '+' : ''}${(c - p).toLocaleString('en-US')})`);

export function markdown(diff) {
  const lines = [`### Unreal export ${diff.curCommit?.slice(0, 8) ?? '?'} against ${diff.prevCommit ? diff.prevCommit.slice(0, 8) : 'nothing (first export)'}`, '',
    '| zone | status | nodes | triangles | SHA-256 |', '|---|---|---:|---:|---|'];
  for (const r of diff.rows) {
    lines.push(`| ${r.zone} | ${r.status} | ${fmt(r.cur?.nodes)}${delta(r.prev?.nodes, r.cur?.nodes)} | ${fmt(r.cur?.triangles)}${delta(r.prev?.triangles, r.cur?.triangles)} | ${(r.cur ?? r.prev).sha256.slice(0, 12)} |`);
  }
  const changed = diff.rows.filter((r) => r.status !== 'unchanged').length;
  lines.push('', `measurements.json: ${diff.measurements}. ${changed} of ${diff.rows.length} zones to re-import; the others are skipped by import_world.py.`);
  for (const [what, list] of Object.entries(diff.sources)) if (list.length) lines.push(`Sources ${what} (${list.length}): ${list.slice(0, 15).map((p) => `\`${p}\``).join(', ')}${list.length > 15 ? ', …' : ''}`);
  lines.push('', diff.deviations.length ? `**Deviations (${diff.deviations.length}):**\n${diff.deviations.map((d) => `- ${d}`).join('\n')}` : 'No deviations.');
  return lines.join('\n') + '\n';
}

/** gh as a function: (args) => { status, stdout }. dry-run prints and answers lists with []. */
export function ghRunner({ dryRun = false, log = console.log } = {}) {
  return (args) => {
    if (dryRun) {
      log(`DRY-RUN gh ${args.map((a) => (/[\s"'<>|]/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
      return { status: 0, stdout: args[0] === 'issue' && ['list', 'view'].includes(args[1]) ? (args[1] === 'list' ? '[]' : '{"comments":[]}') : '' };
    }
    const r = spawnSync('gh', args, { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${r.stderr || r.error?.message}`);
    return r;
  };
}

/** Decide and carry out the issue action. Returns { action, issue }. */
export function report({ outcome, diff, failed, runUrl, commit, repo }, gh) {
  const problems = [...(outcome !== 'success' ? [`the workflow failed${failed ? ` in step "${failed}"` : ''}`] : []), ...(diff?.deviations ?? [])];
  const R = repo ? ['--repo', repo] : [];
  const open = JSON.parse(gh(['issue', 'list', ...R, '--state', 'open', '--limit', '500', '--json', 'number,body']).stdout || '[]')
    .filter((i) => (i.body ?? '').includes(MARKER)).sort((x, y) => x.number - y.number);
  const issue = open[0]?.number ?? null;
  const where = `Körning: ${runUrl ?? '(lokal)'}\nCommit: ${commit ?? '?'}`;
  if (problems.length) {
    const what = problems.map((p) => `- ${p}`).join('\n');
    if (issue) {
      gh(['issue', 'comment', String(issue), ...R, '--body', `${MARKER}\nExporten avviker eller misslyckades igen.\n\n${what}\n\n${where}`]);
      return { action: 'comment', issue };
    }
    const body = [`Lapp: Unreal-exporten larmar`, '', MARKER,
      'Arbetsflödet `.github/workflows/unreal-export.yml` (#2305) exporterar webbscenen för Unreal när exportens källor ändras på `main`.',
      'Den senaste körningen misslyckades eller avvek från förra exporten:', '', what, '', where, '',
      'Felsök med körningens logg och sammanfattning (zon för zon). Kör exporten lokalt: `tools/browsertest.sh node tools/unreal-engine/export-world.mjs` och `node tools/unreal-engine/check-export.mjs` (docs/development/unreal.md, "Automatic export and import").',
      'Arbetsflödet kommenterar här så länge ärendet är öppet och noterar när en körning är grön igen. Stängs av den som åtgärdar felet.',
      '', '**Prioritet:** medium: Unreal-versionen hamnar efter webben tills felet är åtgärdat, men webben påverkas inte.'].join('\n');
    gh(['issue', 'create', ...R, '--title', ISSUE_TITLE, '--body', body, ...ISSUE_LABELS.flatMap((l) => ['--label', l])]);
    return { action: 'create', issue: null };
  }
  if (issue) {
    const comments = JSON.parse(gh(['issue', 'view', String(issue), ...R, '--json', 'comments']).stdout || '{"comments":[]}').comments ?? [];
    const last = comments.filter((c) => (c.body ?? '').includes(MARKER) || (c.body ?? '').includes(GREEN)).at(-1);
    if (last?.body?.includes(GREEN)) return { action: 'none', issue };
    gh(['issue', 'comment', String(issue), ...R, '--body', `${GREEN}\nExporten är grön igen.\n\n${where}\n\nStäng ärendet när orsaken är förstådd.`]);
    return { action: 'green', issue };
  }
  return { action: 'none', issue: null };
}

const opt = (args, name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };

export function main(args = process.argv.slice(2)) {
  const cmd = args[0];
  if (cmd === 'key') {
    const { sourceHash } = sourceList();
    const out = { sourceHash, artifact: artifactName(sourceHash) };
    console.log(JSON.stringify(out));
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `source-hash=${out.sourceHash}\nartifact=${out.artifact}\n`);
    return 0;
  }
  if (cmd === 'compare') {
    const cur = readManifest(opt(args, 'cur'));
    if (!cur) { console.error(`no export-manifest.json in ${opt(args, 'cur')}`); return 2; }
    const diff = compareManifests(readManifest(opt(args, 'prev')), cur);
    const md = markdown(diff);
    process.stdout.write(md);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
    if (opt(args, 'out')) fs.writeFileSync(opt(args, 'out'), JSON.stringify(diff, null, 1) + '\n');
    return 0;
  }
  if (cmd === 'report') {
    const diffPath = opt(args, 'diff');
    const diff = diffPath && fs.existsSync(diffPath) ? JSON.parse(fs.readFileSync(diffPath, 'utf8')) : null;
    const r = report({ outcome: opt(args, 'outcome', 'failure'), diff, failed: opt(args, 'failed'), runUrl: opt(args, 'run-url'),
      commit: opt(args, 'commit'), repo: opt(args, 'repo') }, ghRunner({ dryRun: args.includes('--dry-run') }));
    console.log(`issue action: ${r.action}${r.issue ? ` #${r.issue}` : ''}`);
    return 0;
  }
  console.error('usage: export-ci.mjs key | compare --cur DIR [--prev DIR] [--out FILE] | report --outcome success|failure [--diff FILE] [--failed STEP] [--run-url URL] [--commit SHA] [--repo R] [--dry-run]');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exit(main());
