// Anonymous players (#677): against a local Worker. Start first:
//   python3 tools/devserve.py 8122 .          node cloudflare/dev.mjs 8145 tok
//   PLAYWRIGHT_MODULE=… [CHROME_PATH=…] [SHOTS=/dir] node tools/anontest.cjs http://localhost:8122 http://localhost:8145 tok
// Checks: a player without a name is online as "Anonym" (presence list + count), gets a leaderboard row (name '') shown as
// "Anonym" and later renamed in the same row, a second anonymous browser gets its own row, and "Visa mig inte för andra" sends
// nothing (no presence PUT, no score, no ghost socket). Screenshots of the start screen / dialog into SHOTS.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const game = process.argv[2] || 'http://localhost:8122', worker = process.argv[3] || 'http://localhost:8145', token = process.argv[4] || 'tok';
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}${extra ? ` — ${extra}` : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 120000) { const t = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t > ms) return null; await sleep(300); } }
const api = async (path, init) => (await fetch(`${worker}${path}`, init)).json();
const wipe = () => fetch(`${worker}/admin/all`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });

(async () => {
  await wipe();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const open = async (init, query = '', size = { width: 640, height: 420 }) => {
    const ctx = await browser.newContext({ viewport: size });
    await ctx.addInitScript(init);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));
    await page.goto(`${game}/?${query}cloud=${worker}`, { waitUntil: 'commit', timeout: 240000 });
    await page.waitForFunction(() => window.__app?.leaderboard && window.__presence && window.__app.renderer, null, { timeout: 240000 });
    return { ctx, page };
  };
  const skip = () => { sessionStorage.setItem('lunden.nameSkipped', '1'); };
  try {
    // A: anonymous, skipped the dialog, has scored a bit
    const A = await open(skip);
    const pa = A.page;
    check(await pa.evaluate(() => !!localStorage.getItem('lunden.playerId') && window.__app.leaderboard.name === ''), 'an anonymous player has a player id');
    await pa.evaluate(() => { window.__app.bump('pvpHits'); window.__app.leaderboard.send(); window.__presence.beat(); });
    const row = await until(async () => (await api('/scores')).find((r) => r.name === '' && r.score > 0));
    check(!!row, 'the anonymous score is on the Worker with the name empty', JSON.stringify(row));
    const pres = await until(async () => { const d = await api('/presence'); return d.anon === 1 && d.players.some((p) => p.score > 0) ? d : null; });
    check(pres && pres.players.some((p) => p.name === '' && p.score > 0), 'online as anonymous with a score', JSON.stringify(pres));
    check(await until(() => pa.evaluate(() => window.__presence.names.includes('Anonym') && window.__presence.players.some((p) => p.name === 'Anonym'))), 'the client shows "Anonym" in the online list');
    const html = await pa.evaluate(() => { window.__app.leaderboard.show([{ name: '', score: 5, updated: 1 }, { name: '<b>x</b>', score: 4 }]); return document.getElementById('lb-start').innerHTML; });
    check(html.includes('1. Anonym') && !html.includes('<b>x'), 'the list shows "Anonym" and escapes names', html.slice(0, 160));
    // a second anonymous browser (another id): its own row (posted directly, a second page would only cost minutes of warm-up)
    await fetch(`${worker}/scores`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ id: 'anon-second-browser', name: '', score: 10 }) });
    check((await api('/scores')).filter((r) => r.name === '').length === 2, 'a second anonymous browser has its own row');
    // naming A renames its row, no duplicate
    await pa.evaluate(() => { const l = window.__app.leaderboard; l.openDialog('initial'); l.input.value = 'Tilly'; l.confirmName(); });
    const named = await until(async () => { const t = await api('/scores'); return t.some((r) => r.name === 'Tilly') && t.length === 2 ? t : null; });
    check(!!named, 'naming renames the same row (still two rows)', JSON.stringify(named));
    await pa.evaluate(() => { window.__app.leaderboard.openDialog('new'); });
    await pa.screenshot({ path: `${shots}/anon-dialog.png`, timeout: 240000 });
    await A.ctx.close();
    // C: opted out, nothing is sent
    await wipe();
    const base = (await api('/presence')).count;
    const C = await open(() => { sessionStorage.setItem('lunden.nameSkipped', '1'); localStorage.setItem('lunden.share', '0'); });
    const pc = C.page;
    check(await pc.evaluate(() => [...document.querySelectorAll('.share-off')].every((b) => b.checked) && !window.__app.leaderboard.shares), 'the box is ticked from localStorage');
    await pc.evaluate(() => { window.__app.bump('pvpHits'); return window.__app.leaderboard.send().then(() => window.__app.leaderboard.beacon()); });
    await pc.evaluate(() => window.__presence.beat());
    await sleep(2500);
    const d = await api('/presence');
    check((await api('/scores')).length === 0 && d.count === base, 'opted out: no score, not counted online', JSON.stringify(d));
    check(await pc.evaluate(() => !window.__ghosts.ws), 'opted out: no ghost socket');
    await pc.evaluate(() => document.querySelector('.share-off').click());
    check(!!(await until(async () => (await api('/scores')).some((r) => r.name === '' && r.score > 0))), 'unticking the box sends the score again');
    check(!!(await until(async () => (await api('/presence')).count === base + 1)), 'and is online again');
    await pc.screenshot({ path: `${shots}/anon-start.png`, timeout: 240000 });
    await C.ctx.close();
  } catch (e) { check(false, 'test crashed', e.stack); }
  await browser.close();
  console.log(failed ? `SOME FAILED (${failed})` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
