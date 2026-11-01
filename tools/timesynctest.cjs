// #1774: the game time shared between two (three) real clients against the local Worker. Start both first:
//   python3 tools/devserve.py 8195 .      node cloudflare/dev.mjs 8196 testtoken
//   tools/browsertest.sh node tools/timesynctest.cjs http://localhost:8195 http://localhost:8196 OUT_DIR
// A types 22:00 on the clock strip: B's `day` follows within ~1 s and B gets "<namn> ställde klockan till 22:00"; B picks a date on the calendar
// and A follows; A "Nu" (realNow) takes both back; a latecomer gets the room time in the welcome; a client with ?month= keeps its own.
const kit = require('./testkit.cjs'), fs = require('node:fs');
const [game = 'http://localhost:8195', worker = 'http://localhost:8196', out = '/tmp/timesync'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
(async () => {
  const browser = await kit.launch(), errors = [];
  try {
    const q = (extra = '') => `${game}/?weather=clear&shot&nobirds&cloud=${worker}&at=1.0,1.6,-3,0${extra}`;
    const open = async (name, extra) => {
      const r = await kit.open(browser, q(extra), { init: (n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, arg: name });
      r.page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      await r.page.waitForFunction(() => window.__app?.timeSync && window.__ghosts?.connected, null, { timeout: 900000 });
      await r.page.evaluate(() => { const a = __app; a.renderer.setAnimationLoop(null); a.showOverlay(false); window.__notes = []; { const t = a.timeSync, n = t.notice; t.notice = (x) => { __notes.push(x); n(x); }; } window.pump = async (ms) => { const end = performance.now() + ms; while (performance.now() < end) { a.step(0.05); __ghosts.update(0.05); await new Promise((r) => setTimeout(r, 50)); } }; });
      return r;
    };
    const A = await open('Alma'), B = await open('Bo');
    const ev = (r, f, ...x) => r.page.evaluate(f, ...x), pump = (ms) => Promise.all([ev(A, (m) => pump(m), ms), ev(B, (m) => pump(m), ms)]);
    const read = (r) => ev(r, () => ({ hour: __app.day.hour, date: __app.day.date, month: __app.day.month, paused: __app.day.paused, note: document.querySelector('#badge, .badge, #toast')?.textContent ?? '' , sync: !__app.timeSync.disabled }));
    const until = async (cond) => { const end = Date.now() + 4000; let s; do { await pump(250); s = [await read(A), await read(B)]; } while (!cond(s) && Date.now() < end); return s; };
    check((await read(A)).sync, 'sync is on for a plain URL');
    // A types 22:00 on the clock strip
    await ev(A, () => { __app.clockPanel.setTyped('22:00'); });
    let s = await until(([a, b]) => Math.abs(b.hour - 22) < 0.1);
    check(Math.abs(s[1].hour - 22) < 0.1 && Math.abs(s[0].hour - 22) < 0.1, 'A set 22:00 and B followed within 4 s', s.map((x) => x.hour));
    // the notice: listen through the same hook the game uses
    await ev(B, () => { __notes.length = 0; });
    await ev(A, () => { __app.clockPanel.setTyped('21:30'); });
    s = await until(([, b]) => Math.abs(b.hour - 21.5) < 0.1);
    const notes = await ev(B, () => __notes);
    check(notes.length === 1 && notes[0] === 'Alma ställde klockan till 21:30', 'B sees "Alma ställde klockan till 21:30"', notes);
    // B picks another date on the calendar: A follows
    await ev(B, () => { const t = new Date(); const c = __app.calPanel; c.choose(t.getDate() === 20 ? 21 : 20); });
    s = await until(([a, b]) => a.date === b.date);
    check(s[0].date === s[1].date && (s[0].date === 20 || s[0].date === 21), 'a date picked by B reaches A', s.map((x) => x.date));
    // pause by A, then realNow by B
    await ev(A, () => __app.clockPanel.togglePause());
    s = await until(([, b]) => b.paused);
    check(s[1].paused, 'pausing at A pauses B');
    await ev(B, () => __app.realNow());
    const real = await ev(B, () => { const n = new Date(); return { h: n.getHours() + n.getMinutes() / 60, d: n.getDate() }; });
    s = await until(([a]) => Math.abs(a.hour - real.h) < 0.2 && a.date === real.d);
    check(Math.abs(s[0].hour - real.h) < 0.2 && s[0].date === real.d && !s[0].paused, 'realNow at B takes A back to real time too', { real, a: s[0] });
    // result images: both clients with the clock strip open
    await ev(A, () => { __app.clockPanel.setTyped('08:00'); __app.showClock(true); }); await until(([, b]) => Math.abs(b.hour - 8) < 0.1); await ev(B, () => { __app.showClock(true); });
    await ev(A, () => { __app.clockPanel.setTyped('22:00'); }); await until(([, b]) => Math.abs(b.hour - 22) < 0.1);
    await ev(B, () => { __app.showClock(true); }); await pump(300);
    await kit.shot(A.page, `${out}/a-klockan-22.png`); await kit.shot(B.page, `${out}/b-klockan-22.png`);
    // latecomer + a test-URL client (B is closed first: memory)
    await ev(A, () => { __app.clockPanel.setTyped('03:15'); }); await pump(1500);
    await B.page.context().close();
    const C = await open('Cleo'), D = await open('Dan', '&month=7&time=9'), both = (ms) => Promise.all([ev(C, (m) => pump(m), ms), ev(D, (m) => pump(m), ms), ev(A, (m) => pump(m), ms)]);
    await both(1500);
    const c = await read(C), d = await read(D);
    check(Math.abs(c.hour - 3.25) < 0.2, 'a latecomer gets the room time in the welcome', c);
    check(!d.sync && d.month === 7 && Math.abs(d.hour - 9) < 0.2, 'a ?month=&time= client keeps its own time', d);
    await ev(A, () => { __app.clockPanel.setTyped('08:00'); }); await both(1500);
    const d2 = await read(D), c2 = await read(C); check(d2.month === 7 && Math.abs(d2.hour - 9) < 0.3 && Math.abs(c2.hour - 8) < 0.2, 'and is not overridden later either (C follows)', { d2, c2 });
    check(errors.length === 0, 'no page errors', errors);
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
})();
