#!/usr/bin/env node
// Test runner (#737, part of #736): runs chosen tools/*test*.html (headless Playwright Chromium, SwiftShader flags) and
// tools/*.cjs tests, prints PASS/FAIL per test with the time, and compares the FAIL lines with tools/baseline.json (the
// KNOWN red lines, no times). Starts its own `tools/devserve.py` (and `cloudflare/dev.mjs` for .cjs tests that need a Worker)
// and kills only those PIDs. Logs go to /tmp/runtests-<pid>/ (never the repo). See docs/development/verification.md.
//
//   node tools/runtests.cjs resttest tostarttest cooktest        names (no extension), or tools/x.html / x.cjs
//   node tools/runtests.cjs --group a-c [--jobs 2]               first letter of the file name in a range: a-c d-l m-p r-t u-z
//   node tools/runtests.cjs --compare resttest tostarttest       each HTML test twice: without `&test`, then with it + a 480x300 iframe
//   node tools/runtests.cjs --list [names…]                      what would run
// Explicit .html/.cjs filenames select one file; a bare name selects all matching formats.
//   node tools/runtests.cjs --update-baseline name…              rewrite those tests' entries in tools/baseline.json from this run
// Options: --jobs N (default 1, max 2: the VM is shared), --timeout MIN (default 20), --port N (devserve, default 8133;
// Workers use port+1…), --keep-going is the default (all selected tests run), --verbose (print each test's output).
// Exit code 1 for untracked failures, crashes/timeouts, or different ordered comparison rows.
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
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
    const explicitFile = /\.(html|cjs)$/.test(base);
    const hit = all.filter((t) => explicitFile ? t.file === base : t.name === base);
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
function compareLines(a, b) {
  const left = resultLines(a), right = resultLines(b);
  const differences = [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] !== right[i]) differences.push({ row: i + 1, full: left[i] ?? null, test: right[i] ?? null });
  }
  return { same: differences.length === 0, left, right, differences };
}
function gameModeUrl(href, mode) {
  const u = new URL(href);
  if (mode === 'full' && u.searchParams.has('test')) u.searchParams.delete('test');
  else if (mode === 'test' && !u.searchParams.has('test')) u.searchParams.set('test', '');
  return u.href;
}
const VERDICT = /^(ALL PASS|SOME FAILED)\s*$/m;

function playwrightPath() {
  const tries = [process.env.PLAYWRIGHT_MODULE, 'playwright'];
  try { tries.push(path.join(require('child_process').execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'playwright')); } catch {}
  for (const t of tries.filter(Boolean)) { try { return require.resolve(t); } catch {} }
  console.error('Playwright not found: set PLAYWRIGHT_MODULE=/path/to/playwright'); process.exit(2);
}

const playwrightModule = () => require(playwrightPath());
const children = new Set(), browsers = new Set(), launches = new Set();
let shuttingDown = false;
function spawnGroup(cmd, args, o = {}) { // own process group, so a kill by PID takes the test's Chromium children along
  if (shuttingDown) throw new Error('runner is stopping');
  const c = spawn(cmd, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT, ...o });
  children.add(c); c.on('error', e => { c.spawnError = e; });
  c.on('exit', () => killGroup(c));
  c.on('close', () => children.delete(c)); return c;
}
const killGroup = (c) => { if (!c.pid) return; try { process.kill(-c.pid, 'SIGKILL'); } catch { try { c.kill('SIGKILL'); } catch {} } };
process.on('exit', () => children.forEach(killGroup));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, async () => {
  shuttingDown = true;
  children.forEach(killGroup);
  await Promise.allSettled([...launches]);
  await Promise.all([...browsers].map(b => b.close().catch(() => {})));
  process.exit(s === 'SIGINT' ? 130 : 143);
});

async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', e => reject(new Error(`port :${port} unavailable: ${e.message}`)));
    probe.listen(port, () => probe.close(resolve));
  });
}
async function waitHttp(port, child, ms = 30000) {
  const t = Date.now();
  for (;;) {
    if (child.spawnError || child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`own server on :${port} stopped: ${child.spawnError?.message ?? child.exitCode ?? child.signalCode}`);
    }
    const ok = await new Promise(resolve => {
      const req = http.get({ port, host: '127.0.0.1', path: '/' }, res => { res.resume(); resolve(true); });
      req.on('error', () => resolve(false)); req.setTimeout(1000, () => req.destroy());
    });
    if (ok) {
      // Give immediate bind/startup errors a chance to arrive, rather than accepting another server's response.
      await sleep(100);
      if (child.spawnError || child.exitCode !== null || child.signalCode !== null) continue;
      return;
    }
    if (Date.now() - t > ms) throw new Error(`own server never became ready on :${port}`);
    await sleep(100);
  }
}
async function startServer(cmd, args, port) {
  await assertPortFree(port);
  const child = spawnGroup(cmd, args); let output = '';
  child.stdout.on('data', d => { output = (output + d).slice(-4000); });
  child.stderr.on('data', d => { output = (output + d).slice(-4000); });
  try { await waitHttp(port, child); }
  catch (e) { killGroup(child); throw new Error(`${e.message}\n${output}`); }
  return child;
}

// ---------- HTML tests ----------
let browserType;
async function runHtml(test, { asTest }, game, workerPort = null) {
  const pw = browserType ||= playwrightModule();
  const log = []; const t0 = Date.now();
  if (shuttingDown) throw new Error('runner is stopping');
  const launch = pw.chromium.launch({ timeout: opt.timeout * 60000, executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  launches.add(launch);
  let browser;
  try { browser = await launch; browsers.add(browser); }
  finally { launches.delete(launch); }
  const killer = setTimeout(() => browser.close().catch(() => {}), opt.timeout * 60000 + 30000);
  let text = '', status = 'TIMEOUT', redirects = 0;
  const mode = opt.compare ? (asTest ? 'test' : 'full') : 'written', gameLoads = [];
  const origin = new URL(game).origin;
  const isGame = u => u.origin === origin && (u.pathname === '/index.html' || u.pathname === '/');
  try {
    // Fullscreen escapes iframe CSS, so the test context itself must stay small too (#776).
    const viewport = asTest ? { width: 480, height: 300 } : { width: 1280, height: 800 };
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    if (opt.compare) {
      // A migrated fixture may already contain ?test. Force the first pass out of test mode too.
      await ctx.route(isGame, async route => {
        if (route.request().resourceType() !== 'document') return route.continue();
        const href = route.request().url(), normalized = gameModeUrl(href, mode);
        if (normalized === href) return route.continue();
        redirects++;
        await route.fulfill({ status: 302, headers: { location: normalized } });
      });
    }
    if (asTest) {
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
    const frames = new Map();
    page.on('framenavigated', frame => {
      const u = new URL(frame.url());
      if (!isGame(u)) return;
      const load = { url: u.href, test: u.searchParams.has('test'), variant: u.searchParams.get('test'), viewport: null, controller: null };
      gameLoads.push(load); frames.set(frame, load);
      frame.evaluate(() => [innerWidth, innerHeight]).then(viewport => { load.viewport = viewport; }).catch(() => {});
    });
    page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
    page.on('crash', () => log.push('[page crashed]'));
    const fixtureURL = new URL(`${game}/tools/${test.file}`);
    if (workerPort !== null) fixtureURL.searchParams.set('worker', `http://localhost:${workerPort}`);
    await page.goto(fixtureURL.href, { waitUntil: 'commit', timeout: opt.timeout * 60000 });
    while (Date.now() - t0 < opt.timeout * 60000) {
      text = await page.evaluate(() => document.querySelector('#out')?.textContent ?? '').catch(() => text) || text;
      if (VERDICT.test(text)) { status = 'DONE'; break; }
      if (log.includes('[page crashed]')) { status = 'CRASH'; break; }
      await sleep(2000);
    }
    // Retained game frames expose the actual controller; detached reloads retain their loaded URL evidence.
    await Promise.all([...frames].filter(([frame]) => !frame.isDetached()).map(async ([frame, load]) => {
      const evidence = await frame.evaluate(() => ({ viewport: [innerWidth, innerHeight], controller: window.__app ? !!window.__app.testMode : null })).catch(() => null);
      if (evidence) Object.assign(load, evidence);
    }));
  } catch (e) { log.push(`[runner] ${e.message}`); status = 'ERROR'; }
  clearTimeout(killer); await browser.close().catch(() => {}); browsers.delete(browser);
  const modeVerified = !opt.compare || !gameLoads.length ? null : gameLoads.every(load =>
    load.test === asTest && (load.controller === null || load.controller === asTest));
  if (modeVerified === false) { status = 'ERROR'; log.push(`[runner] loaded game mode does not match ${mode}`); }
  if (opt.compare && !gameLoads.length) log.push('[runner] no game document loaded; mode comparison does not apply');
  return { status, text, log, ms: Date.now() - t0, redirects, mode, gameLoads, modeVerified, worker: workerPort === null ? null : `http://localhost:${workerPort}` };
}

// ---------- .cjs tests ----------
const workers = new Map(); // slot -> { child, port }
async function workerFor(slot) {
  if (!workers.has(slot)) {
    const port = opt.port + 1 + slot;
    const child = await startServer(process.execPath, ['cloudflare/dev.mjs', String(port), 'testtoken'], port);
    workers.set(slot, { child, port });
  }
  return workers.get(slot);
}
async function runCjs(test, game, slot) {
  const src = fs.readFileSync(path.join(TOOLS, test.file), 'utf8');
  const args = [path.join('tools', test.file), game];
  if (/cloudflare\/dev\.mjs|\bworker\s*=\s*process\.argv\[3\]/.test(src)) {
    const w = await workerFor(slot);
    // These tests wipe the Worker's state: a Worker per job slot, cleared by the test itself. Token as in the file's header.
    args.push(`http://localhost:${w.port}`, 'testtoken');
  }
  const t0 = Date.now(); let out = '';
  const pw = playwrightPath(), pwRoot = path.dirname(require.resolve(`${pw}/../package.json`));
  const chrome = process.env.CHROME_PATH || process.env.CHROME;
  const child = spawnGroup(process.execPath, args, { env: { ...process.env,
    PLAYWRIGHT_MODULE: pw, NODE_PATH: [path.dirname(pwRoot), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
    BASE: game, CHROME_PATH: chrome, CHROME: chrome, SHOTS: path.join(LOGDIR, 'shots') } });
  child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (out += d));
  let timedOut = false;
  const killer = setTimeout(() => { timedOut = true; killGroup(child); }, opt.timeout * 60000);
  const code = await new Promise((r) => child.on('close', (c) => r(c)));
  clearTimeout(killer);
  return { status: timedOut ? 'TIMEOUT' : child.spawnError ? 'ERROR' : 'DONE', code, text: out, log: child.spawnError ? [child.spawnError.message] : [], ms: Date.now() - t0 };
}

// ---------- classification ----------
function classify(r, name, base) {
  const fails = failLines(r.text), known = base[name] || [];
  // Consume expected occurrences in order. Fewer old failures are allowed; extra or reordered ones are NEW.
  let cursor = 0;
  r.fails = fails; r.newFails = fails.filter(line => {
    const index = known.indexOf(line, cursor);
    if (index < 0) return true;
    cursor = index + 1; return false;
  });
  if (r.status === 'TIMEOUT' || r.status === 'CRASH' || r.status === 'ERROR') r.verdict = r.status;
  else if (r.code === null) r.verdict = 'CRASH';
  else if (r.code !== undefined) r.verdict = r.code === 0 && !fails.length ? 'PASS' : (r.code !== 0 && !fails.length) || r.newFails.length ? 'FAIL' : 'KNOWN';
  else r.verdict = /^ALL PASS/m.test(r.text) && !fails.length ? 'PASS' : r.newFails.length || !fails.length ? 'FAIL' : 'KNOWN';
  return r;
}

async function main() {
  const tests = select();
  if (opt.list) { for (const t of tests) console.log(t.file); return; }
  fs.mkdirSync(path.join(LOGDIR, 'shots'), { recursive: true });
  await startServer('python3', ['tools/devserve.py', String(opt.port), ROOT], opt.port);
  const game = `http://localhost:${opt.port}`, base = readBaseline();
  console.log(`runtests: ${tests.length} test(s), jobs ${opt.jobs}, timeout ${opt.timeout} min, server :${opt.port}, logs ${LOGDIR}`);

  // The work list: one job per run (a compare of one test is two jobs, in order, on the same load).
  const jobs = [];
  for (const t of tests) {
    if (opt.compare && t.kind === 'html') jobs.push({ t, asTest: false, label: 'full' }, { t, asTest: true, label: '&test' });
    else jobs.push({ t, asTest: false, label: opt.compare ? 'scripted (no compare: .cjs)' : '' });
  }
  const results = []; let next = 0;
  async function worker(slot) {
    for (;;) {
      if (shuttingDown) return;
      const j = jobs[next++]; if (!j) return;
      process.stdout.write(`  start ${j.t.name}${j.label ? ` [${j.label}]` : ''}\n`);
      let r;
      try {
        if (j.t.kind === 'html') {
          // Existing HTML cloud fixtures advertise dev.mjs and read ?worker from their top URL (#777).
          const needsWorker = /cloudflare\/dev\.mjs/.test(fs.readFileSync(path.join(TOOLS, j.t.file), 'utf8'));
          const ownedWorker = needsWorker ? await workerFor(slot) : null;
          r = await runHtml(j.t, j, game, ownedWorker?.port ?? null);
        } else r = await runCjs(j.t, game, slot);
      }
      catch (e) { r = { status: 'ERROR', text: '', log: [`[runner] ${e.stack}`], ms: 0 }; }
      if (shuttingDown) return;
      classify(r, j.t.name, base); Object.assign(r, { name: j.t.name, file: j.t.file, label: j.label, asTest: j.asTest, kind: j.t.kind });
      const logName = tests.filter(t => t.name === j.t.name).length > 1 ? j.t.file : j.t.name;
      fs.writeFileSync(path.join(LOGDIR, `${logName}${j.asTest ? '.test' : ''}.log`), `${r.text}\n${r.log.join('\n')}\n`);
      console.log(`  ${r.verdict.padEnd(7)} ${j.t.name}${j.label ? ` [${j.label}]` : ''}  ${fmt(r.ms)}  FAIL lines: ${r.fails.length}${r.newFails.length ? ` (${r.newFails.length} not in baseline)` : ''}`);
      if (opt.verbose) console.log(r.text.split('\n').map((l) => `      ${l}`).join('\n'));
      results.push(r);
    }
  }
  await Promise.all(Array.from({ length: opt.jobs }, (_, i) => worker(i)));
  if (shuttingDown) return;

  // ---------- summary ----------
  console.log('\nSummary');
  const order = (r) => tests.findIndex((t) => t.file === r.file) * 2 + (r.asTest ? 1 : 0);
  results.sort((a, b) => order(a) - order(b));
  for (const r of results) {
    console.log(`  ${r.verdict.padEnd(7)} ${(r.name + (r.label ? ` [${r.label}]` : '')).padEnd(34)} ${fmt(r.ms).padStart(7)}  fail ${r.fails.length}  mode ${r.kind === 'cjs' ? 'script-defined' : r.gameLoads?.length ? [...new Set(r.gameLoads.map(load => load.test ? '&test' : 'no &test'))].join(' + ') : r.status === 'DONE' ? 'no game document' : 'unavailable'}`);
    for (const l of r.newFails.slice(0, 8)) console.log(`            NEW ${l.slice(0, 200)}`);
    if (r.verdict === 'FAIL' || r.verdict === 'ERROR' || r.verdict === 'CRASH') for (const l of r.log.slice(0, 3)) console.log(`            ${l.slice(0, 200)}`);
  }
  let comparisonFailed = false;
  if (opt.compare) {
    console.log('\nCompare (without &test at fixture viewport vs &test + 480x300 iframe)');
    for (const t of tests.filter((t) => t.kind === 'html')) {
      const a = results.find((r) => r.file === t.file && !r.asTest), b = results.find((r) => r.file === t.file && r.asTest);
      if (!a || !b) continue;
      if (a.status !== 'DONE' || b.status !== 'DONE') { console.log(`  ${t.name}: n/a (${a.status} / ${b.status}), ${fmt(a.ms)} -> ${fmt(b.ms)}`); continue; }
      if (!a.gameLoads.length || !b.gameLoads.length) { console.log(`  ${t.name}: n/a (no game document to compare)`); continue; }
      const c = compareLines(a.text, b.text);
      a.comparison = b.comparison = { identical: c.same, modeVerified: a.modeVerified && b.modeVerified };
      if (!c.same) comparisonFailed = true;
      console.log(`  ${t.name}: ${c.same ? 'IDENTICAL' : 'DIFFERENT'} (${c.left.length} vs ${c.right.length} ordered result lines; verdict ${a.verdict} / ${b.verdict}; modes verified), ${fmt(a.ms)} -> ${fmt(b.ms)}${b.ms ? `, ${(a.ms / b.ms).toFixed(2)}x` : ''}`);
      for (const d of c.differences.slice(0, 10)) {
        console.log(`      row ${d.row} full : ${d.full ?? '(missing)'}`);
        console.log(`      row ${d.row} &test: ${d.test ?? '(missing)'}`);
      }
    }
  }
  if (opt.update) { // only the plain runs; no times are stored
    const nb = readBaseline();
    for (const r of results.filter(r => !r.asTest && r.status === 'DONE' && ['PASS', 'KNOWN', 'FAIL'].includes(r.verdict))) { if (r.fails.length) nb[r.name] = r.fails; else delete nb[r.name]; }
    const sorted = Object.fromEntries(Object.keys(nb).sort().map((k) => [k, nb[k]]));
    fs.writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + '\n'); console.log(`baseline updated: ${BASELINE}`);
  }
  fs.writeFileSync(path.join(LOGDIR, 'summary.json'), JSON.stringify(results.map(({ name, file, kind, label, verdict, ms, fails, mode, gameLoads, modeVerified, comparison, worker }) => ({ name, file, kind, label, verdict, ms, fails, mode, gameLoads, modeVerified, comparison, worker })), null, 2));
  const bad = comparisonFailed || results.some((r) => !['PASS', 'KNOWN'].includes(r.verdict));
  children.forEach(killGroup);
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { if (shuttingDown) return; console.error(e); children.forEach(killGroup); process.exit(2); });
