#!/usr/bin/env node
// Test runner (#737, part of #736): runs chosen tools/*test*.html (headless Playwright Chromium, SwiftShader flags) and
// tools/*.cjs tests, prints PASS/FAIL per test with the time, and compares the FAIL lines with tools/baseline.json (the
// KNOWN red lines, no times). Starts its own `tools/devserve.py` (and `cloudflare/dev.mjs` for .cjs tests that need a Worker)
// and kills only those PIDs. Logs go to /tmp/runtests-<pid>/ (never the repo). See docs/development/verification.md.
//
//   node tools/runtests.cjs resttest tostarttest cooktest        names (no extension), or tools/x.html / x.cjs
//   node tools/runtests.cjs --group a-c [--jobs 2]               first letter of the file name in a range: a-c d-l m-p r-t u-z
//   node tools/runtests.cjs --compare resttest tostarttest       each HTML test twice: as written, then with `&test` + a 480x300 iframe
//   node tools/runtests.cjs --list [names…]                      what would run
//   node tools/runtests.cjs --update-baseline name…              rewrite those tests' entries in tools/baseline.json from this run
// Options: --jobs N (default 1, max 2: the VM is shared), --timeout MIN (default 20), --port N (devserve, default 8133;
// Workers use port+1…), --keep-going is the default (all selected tests run), --verbose (print each test's output).
// Exit code 1 when a test fails with a line that is not in the baseline (or crashes / times out).
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..'), TOOLS = __dirname;
const BASELINE = path.join(TOOLS, 'baseline.json');

// ---------- arguments ----------
const argv = process.argv.slice(2);
const opt = { jobs: 1, timeout: 20, port: 8133, group: null, compare: false, list: false, update: false, verbose: false, names: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--jobs') opt.jobs = Math.max(1, Math.min(2, Number(argv[++i]) || 1));
  else if (a === '--timeout') opt.timeout = Number(argv[++i]) || 20;
  else if (a === '--port') opt.port = Number(argv[++i]) || 8133;
  else if (a === '--group') opt.group = argv[++i];
  else if (a === '--compare') opt.compare = true;
  else if (a === '--list') opt.list = true;
  else if (a === '--update-baseline') opt.update = true;
  else if (a === '--verbose') opt.verbose = true;
  else if (a.startsWith('--')) { console.error(`unknown option ${a}`); process.exit(2); }
  else opt.names.push(a);
}

// ---------- test discovery ----------
const GROUPS = { 'a-c': ['a', 'c'], 'd-l': ['d', 'l'], 'm-p': ['m', 'p'], 'r-t': ['r', 't'], 'u-z': ['u', 'z'] };
function allTests() {
  return fs.readdirSync(TOOLS).filter((f) => /test.*\.(html|cjs)$/.test(f) && f !== 'testkit.cjs' && f !== 'runtests.cjs').sort()
    .map((f) => ({ file: f, name: f.replace(/\.(html|cjs)$/, ''), kind: f.endsWith('.cjs') ? 'cjs' : 'html' }));
}
function select() {
  const all = allTests(); let sel = [];
  if (opt.group) {
    const g = GROUPS[opt.group]; if (!g) { console.error(`--group must be one of ${Object.keys(GROUPS).join(' ')}`); process.exit(2); }
    sel = all.filter((t) => t.name[0] >= g[0] && t.name[0] <= g[1]);
  }
  for (const n of opt.names) {
    const base = path.basename(n);
    const hit = all.filter((t) => t.file === base || t.name === base.replace(/\.(html|cjs)$/, ''));
    if (!hit.length) { console.error(`no test named ${n}`); process.exit(2); }
    for (const t of hit) if (!sel.includes(t)) sel.push(t);
  }
  if (!sel.length) { console.error('give test names or --group a-c|d-l|m-p|r-t|u-z (--list shows what exists)'); process.exit(2); }
  return sel;
}

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOGDIR = path.join(os.tmpdir(), `runtests-${process.pid}`);
const fmt = (ms) => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`; };
const readBaseline = () => { try { return JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch { return {}; } };
const resultLines = (text) => text.split('\n').map((l) => l.trim()).filter((l) => /^(PASS|FAIL)\b/.test(l));
const failLines = (text) => resultLines(text).filter((l) => l.startsWith('FAIL'));
const VERDICT = /^(ALL PASS|SOME FAILED)\s*$/m;

function playwrightModule() {
  const tries = [process.env.PLAYWRIGHT_MODULE, 'playwright'];
  try { tries.push(path.join(require('child_process').execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'playwright')); } catch {}
  for (const t of tries.filter(Boolean)) { try { return require(t); } catch {} }
  console.error('Playwright not found: set PLAYWRIGHT_MODULE=/path/to/playwright'); process.exit(2);
}

const children = new Set();
function spawnGroup(cmd, args, o = {}) { // own process group, so a kill by PID takes the test's Chromium children along
  const c = spawn(cmd, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT, ...o });
  children.add(c); c.on('exit', () => children.delete(c)); return c;
}
const killGroup = (c) => { try { process.kill(-c.pid, 'SIGKILL'); } catch { try { c.kill('SIGKILL'); } catch {} } };
process.on('exit', () => children.forEach(killGroup));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { children.forEach(killGroup); process.exit(130); });

async function waitHttp(port, ms = 30000) {
  const t = Date.now();
  for (;;) {
    const ok = await new Promise((r) => http.get({ port, host: '127.0.0.1', path: '/' }, (res) => { res.resume(); r(true); }).on('error', () => r(false)));
    if (ok) return; if (Date.now() - t > ms) throw new Error(`nothing listens on :${port}`); await sleep(300);
  }
}

// ---------- HTML tests ----------
let browserType;
async function runHtml(test, { asTest }, game) {
  const pw = browserType ||= playwrightModule();
  const log = []; const t0 = Date.now();
  const browser = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const killer = setTimeout(() => browser.close().catch(() => {}), opt.timeout * 60000 + 30000);
  let text = '', status = 'TIMEOUT', redirects = 0;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    if (asTest) {
      // The test's own iframe URL gets `test` through a redirect (so location.search inside the game has it) and the iframe is
      // forced to 480x300 by a stylesheet in the test page: no test file needs changing for the comparison.
      await ctx.route((u) => u.pathname === '/index.html' && !u.searchParams.has('test'), (route) => {
        const u = new URL(route.request().url()); u.searchParams.set('test', '');
        redirects++; route.fulfill({ status: 302, headers: { location: u.href } });
      });
      await ctx.addInitScript(() => {
        if (window !== window.top) return;
        // Init scripts can run before the document root exists (#760).
        const install = () => {
          const s = document.createElement('style'); s.textContent = 'iframe{width:480px!important;height:300px!important}';
          document.documentElement.appendChild(s);
        };
        if (document.documentElement) install();
        else document.addEventListener('DOMContentLoaded', install, { once: true });
      });
    }
    const page = await ctx.newPage();
    page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
    page.on('crash', () => log.push('[page crashed]'));
    await page.goto(`${game}/tools/${test.file}`, { waitUntil: 'commit', timeout: opt.timeout * 60000 });
    while (Date.now() - t0 < opt.timeout * 60000) {
      text = await page.evaluate(() => document.querySelector('#out')?.textContent ?? '').catch(() => text) || text;
      if (VERDICT.test(text)) { status = 'DONE'; break; }
      if (log.includes('[page crashed]')) { status = 'CRASH'; break; }
      await sleep(2000);
    }
  } catch (e) { log.push(`[runner] ${e.message}`); status = 'ERROR'; }
  clearTimeout(killer); await browser.close().catch(() => {});
  if (asTest && !redirects) log.push('[runner] no game iframe was redirected to ?test (the test does not open ../index.html?)');
  return { status, text, log, ms: Date.now() - t0, redirects };
}

// ---------- .cjs tests ----------
const workers = new Map(); // slot -> { child, port }
async function workerFor(slot) {
  if (!workers.has(slot)) {
    const port = opt.port + 1 + slot, child = spawnGroup('node', ['cloudflare/dev.mjs', String(port), 'testtoken']);
    child.stdout.resume(); child.stderr.resume(); await waitHttp(port); workers.set(slot, { child, port });
  }
  return workers.get(slot);
}
async function runCjs(test, game, slot) {
  const src = fs.readFileSync(path.join(TOOLS, test.file), 'utf8');
  const args = [path.join('tools', test.file), game];
  if (/cloudflare\/dev\.mjs/.test(src)) {
    const w = await workerFor(slot);
    // These tests wipe the Worker's state: a Worker per job slot, cleared by the test itself. Token as in the file's header.
    args.push(`http://localhost:${w.port}`, 'testtoken');
  }
  const t0 = Date.now(); let out = '';
  const child = spawnGroup('node', args, { env: { ...process.env, SHOTS: path.join(LOGDIR, 'shots') } });
  child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (out += d));
  let timedOut = false;
  const killer = setTimeout(() => { timedOut = true; killGroup(child); }, opt.timeout * 60000);
  const code = await new Promise((r) => child.on('exit', (c) => r(c)));
  clearTimeout(killer);
  return { status: timedOut ? 'TIMEOUT' : 'DONE', code, text: out, log: [], ms: Date.now() - t0 };
}

// ---------- classification ----------
function classify(r, name, base) {
  const fails = failLines(r.text), known = new Set(base[name] || []);
  r.fails = fails; r.newFails = fails.filter((l) => !known.has(l));
  if (r.status === 'TIMEOUT' || r.status === 'CRASH' || r.status === 'ERROR') r.verdict = r.status;
  else if (r.code !== undefined) r.verdict = r.code === 0 && !fails.length ? 'PASS' : (r.code !== 0 && !fails.length) || r.newFails.length ? 'FAIL' : 'KNOWN';
  else r.verdict = /^ALL PASS/m.test(r.text) && !fails.length ? 'PASS' : r.newFails.length || !fails.length ? 'FAIL' : 'KNOWN';
  return r;
}

async function main() {
  const tests = select();
  if (opt.list) { for (const t of tests) console.log(t.file); return; }
  fs.mkdirSync(path.join(LOGDIR, 'shots'), { recursive: true });
  const gameChild = spawnGroup('python3', ['tools/devserve.py', String(opt.port), ROOT]);
  gameChild.stdout.resume(); gameChild.stderr.resume();
  await waitHttp(opt.port);
  const game = `http://localhost:${opt.port}`, base = readBaseline();
  console.log(`runtests: ${tests.length} test(s), jobs ${opt.jobs}, timeout ${opt.timeout} min, server :${opt.port}, logs ${LOGDIR}`);

  // The work list: one job per run (a compare of one test is two jobs, in order, on the same load).
  const jobs = [];
  for (const t of tests) {
    if (opt.compare && t.kind === 'html') jobs.push({ t, asTest: false, label: 'full' }, { t, asTest: true, label: '&test' });
    else jobs.push({ t, asTest: false, label: opt.compare ? 'full (no compare: .cjs)' : '' });
  }
  const results = []; let next = 0;
  async function worker(slot) {
    for (;;) {
      const j = jobs[next++]; if (!j) return;
      process.stdout.write(`  start ${j.t.name}${j.label ? ` [${j.label}]` : ''}\n`);
      let r;
      try { r = j.t.kind === 'html' ? await runHtml(j.t, j, game) : await runCjs(j.t, game, slot); }
      catch (e) { r = { status: 'ERROR', text: '', log: [`[runner] ${e.stack}`], ms: 0 }; }
      classify(r, j.t.name, base); Object.assign(r, { name: j.t.name, label: j.label, asTest: j.asTest, kind: j.t.kind });
      fs.writeFileSync(path.join(LOGDIR, `${j.t.name}${j.asTest ? '.test' : ''}.log`), `${r.text}\n${r.log.join('\n')}\n`);
      console.log(`  ${r.verdict.padEnd(7)} ${j.t.name}${j.label ? ` [${j.label}]` : ''}  ${fmt(r.ms)}  FAIL lines: ${r.fails.length}${r.newFails.length ? ` (${r.newFails.length} not in baseline)` : ''}`);
      if (opt.verbose) console.log(r.text.split('\n').map((l) => `      ${l}`).join('\n'));
      results.push(r);
    }
  }
  await Promise.all(Array.from({ length: opt.jobs }, (_, i) => worker(i)));

  // ---------- summary ----------
  console.log('\nSummary');
  const order = (r) => tests.findIndex((t) => t.name === r.name) * 2 + (r.asTest ? 1 : 0);
  results.sort((a, b) => order(a) - order(b));
  for (const r of results) {
    console.log(`  ${r.verdict.padEnd(7)} ${(r.name + (r.label ? ` [${r.label}]` : '')).padEnd(34)} ${fmt(r.ms).padStart(7)}  fail ${r.fails.length}`);
    for (const l of r.newFails.slice(0, 8)) console.log(`            NEW ${l.slice(0, 200)}`);
    if (r.verdict === 'FAIL' || r.verdict === 'ERROR' || r.verdict === 'CRASH') for (const l of r.log.slice(0, 3)) console.log(`            ${l.slice(0, 200)}`);
  }
  if (opt.compare) {
    console.log('\nCompare (as written vs &test + 480x300 iframe)');
    for (const t of tests.filter((t) => t.kind === 'html')) {
      const a = results.find((r) => r.name === t.name && !r.asTest), b = results.find((r) => r.name === t.name && r.asTest);
      if (!a || !b) continue;
      if (a.status !== 'DONE' || b.status !== 'DONE') { console.log(`  ${t.name}: n/a (${a.status} / ${b.status}), ${fmt(a.ms)} -> ${fmt(b.ms)}`); continue; }
      if (!b.redirects) { console.log(`  ${t.name}: n/a (no game iframe to switch to &test)`); continue; }
      const la = resultLines(a.text), lb = resultLines(b.text), sb = new Set(lb), sa = new Set(la);
      const onlyA = la.filter((l) => !sb.has(l)), onlyB = lb.filter((l) => !sa.has(l));
      const same = !onlyA.length && !onlyB.length && la.length === lb.length;
      console.log(`  ${t.name}: ${same ? 'IDENTICAL' : 'DIFFERENT'} (${la.length} vs ${lb.length} result lines, ${b.redirects} game load(s) switched), ${fmt(a.ms)} -> ${fmt(b.ms)}${b.ms ? `, ${(a.ms / b.ms).toFixed(2)}x` : ''}`);
      for (const l of onlyA.slice(0, 10)) console.log(`      only full : ${l.slice(0, 200)}`);
      for (const l of onlyB.slice(0, 10)) console.log(`      only &test: ${l.slice(0, 200)}`);
    }
  }
  if (opt.update) { // only the plain runs; no times are stored
    const nb = readBaseline();
    for (const r of results.filter((r) => !r.asTest && ['DONE'].includes(r.status))) { if (r.fails.length) nb[r.name] = r.fails; else delete nb[r.name]; }
    const sorted = Object.fromEntries(Object.keys(nb).sort().map((k) => [k, nb[k]]));
    fs.writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + '\n'); console.log(`baseline updated: ${BASELINE}`);
  }
  fs.writeFileSync(path.join(LOGDIR, 'summary.json'), JSON.stringify(results.map(({ name, label, verdict, ms, fails }) => ({ name, label, verdict, ms, fails })), null, 2));
  const bad = results.some((r) => !['PASS', 'KNOWN'].includes(r.verdict));
  children.forEach(killGroup);
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); children.forEach(killGroup); process.exit(2); });
