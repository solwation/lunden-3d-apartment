// Light modes from the smart speakers (#1176): the real app in the evening, aimed at the kitchen's smart display.
// Its menu (Prata, Ljuslägen …, Myslägen …; ≤ 4 rows a page, inside a 1000 × 600 window and a 844 × 390 phone held sideways), every mode's
// ceiling lamps and small lamps, the reply, a manual change kept when the mode ends, the dusk held and caught up, the Hue
// Go's colour kept, Prata still answering, released (nothing put back) by a power cut and by F. A picture per mode.
//   PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/lightmodestest.cjs http://localhost:8764 OUTDIR
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const BASE = process.argv[2] || 'http://localhost:8764', OUT = process.argv[3] || path.join(os.tmpdir(), 'lightmodes');
fs.mkdirSync(OUT, { recursive: true });

async function open(b, w, h, touch) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(`${BASE}/index.html?test=lazy&freeze&time=21&weather=clear${touch ? '&phone' : ''}`, { timeout: 120000 });
  await p.waitForFunction(() => window.__app, null, { timeout: 240000 });
  if (touch) await p.locator('#start-go').tap({ timeout: 90000 }); else await p.locator('#start-mouse').click({ timeout: 90000 }); // native: pointer lock / touch
  await p.waitForFunction((t) => (t ? __app.touch.enabled : document.pointerLockElement === __app.renderer.domElement), touch, { timeout: 15000 });
  await p.evaluate(() => {
    const A = window.__app;
    A.nests.synth = { speak() {}, cancel() {} };
    window.__aimHub = () => { // stand ~0.9 m in front of the kitchen's smart display and look at its screen
      const hub = A.nests.speakers.find((s) => s.type === 'hub'), q = hub.pos(); q.y += 0.06;
      A.player.spawn(q.x, q.z + 0.9, 0);
      for (let i = 0; i < 30; i++) A.step(1 / 60);
      for (let k = 0; k < 2; k++) {
        const c = A.camera, dx = q.x - c.position.x, dz = q.z - c.position.z;
        c.rotation.set(Math.atan2(q.y - c.position.y, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ');
        A.step(1 / 60);
      }
    };
    window.__aimHub();
  });
  return p;
}

(async () => {
  const ctx = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] }); // (a temporary profile, gone after close)
  const lines = []; let ok = true;
  const check = (c, name) => { lines.push(`${c ? 'PASS' : 'FAIL'} ${name}`); ok &&= !!c; };
  try {
    const p = await open(ctx, 1000, 600, false);
    const menu = () => p.evaluate(() => {
      const el = document.getElementById('choices'), r = el.getBoundingClientRect();
      return { f: `${window.__app.focus().focused?.kind}`, hidden: el.hidden, rows: [...el.querySelectorAll('button')].map((b) => b.textContent.replace(/\s+◀ E$/, '').replace(/^\d\s+/, '')), bottom: r.bottom, h: innerHeight, nest: window.__app.choices.target?.kind };
    });
    let m = await menu();
    check(!m.hidden && m.nest === 'nest' && m.rows.join('/') === 'Prata/Ljuslägen …/Myslägen …', `top menu: ${m.rows.join(' / ')} (${m.f})`);
    // E (native key) = the marked row, Prata: the old random answer
    await p.evaluate(() => { window.__said = []; window.__app.nests.onAnswer = (sp, a) => window.__said.push(a); });
    await p.keyboard.press('KeyE');
    const said0 = await p.evaluate(() => window.__said.map((a) => a.key));
    check(said0.length === 1 && !said0[0].startsWith('mode-'), `E = Prata: a random answer (${said0})`);
    // a page by number key (native), and back
    await p.keyboard.press('Digit2');
    await p.evaluate(() => window.__app.step(1 / 60));
    m = await menu();
    check(m.rows.join('/') === 'Allt på/Extrabelysning/Fönsterlampor/Tillbaka' && m.bottom <= m.h, `Ljuslägen page: ${m.rows.join(' / ')} (bottom ${m.bottom.toFixed(0)} ≤ ${m.h})`);
    await p.keyboard.press('Digit4');
    await p.evaluate(() => window.__app.step(1 / 60));
    m = await menu();
    check(m.rows[0] === 'Prata', `Tillbaka: ${m.rows.join(' / ')}`);

    const state = () => p.evaluate(() => {
      const L = window.__app.lights;
      return { rooms: [...L.rooms.values()].filter((R) => R.on).map((R) => `${R.level}:${R.name}`), lamps: L.floorLamps.filter((f) => f.room.on).map((f) => f.name), mode: window.__app.lightModes.active, held: !!L.held };
    });
    const before = await state();
    lines.push(`INFO before: rooms on ${before.rooms.length}, small lamps on ${before.lamps.length}`);
    const shoot = async (name) => p.evaluate(async () => { // the living room from its doorway, looking at the sofa wall
      const A = window.__app; A.player.spawn(2.8, 8.4, 0);
      for (let i = 0; i < 90; i++) A.step(1 / 30);
      A.camera.rotation.set(-0.12, Math.PI + 0.35, 0, 'YXZ');
      for (let i = 0; i < 4; i++) A.step(1 / 30);
      A.testMode.setFull(true); A.testMode.draw(); // (a real frame: quality 3, shadows), read in the same task
      const url = A.renderer.domElement.toDataURL('image/png');
      A.testMode.setFull(false);
      return url;
    }).then((url) => fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(url.split(',')[1], 'base64')));
    const aimHub = () => p.evaluate(() => window.__aimHub());
    await shoot('0-before');
    const expect = {
      all: (s, all) => s.rooms.length === all.rooms && s.lamps.length === all.lamps,
      extra: (s, all) => s.rooms.length === 0 && s.lamps.length === all.lamps - 1 && !s.lamps.includes('lampan i köksfläkten'),
      window: (s) => s.rooms.length === 0 && s.lamps.slice().sort().join() === ['Hue Go-lampan', 'lampan'].sort().join(),
      cozy: (s) => s.rooms.length === 0 && s.lamps.includes('golvlampan') && s.lamps.includes('rottinglampan') && !s.lamps.includes('läslampan') && s.lamps.length >= 9,
      evening: (s) => s.rooms.length === 0 && s.lamps.includes('långlampan') && s.lamps.includes('nattlampan') && !s.lamps.includes('rottinglampan') && s.lamps.length >= 5,
    };
    const totals = await p.evaluate(() => ({ rooms: window.__app.lights.rooms.size, lamps: window.__app.lights.floorLamps.length }));
    const pages = { all: [1, 0], extra: [1, 1], window: [1, 2], cozy: [2, 0], evening: [2, 1] };
    let n = 1;
    for (const [id, [page, row]] of Object.entries(pages)) {
      await aimHub();
      await p.evaluate(() => { window.__said = []; });
      await p.keyboard.press(`Digit${page + 1}`); await p.evaluate(() => window.__app.step(1 / 60));
      await p.keyboard.press(`Digit${row + 1}`); await p.evaluate(() => window.__app.step(1 / 60));
      const reply = await p.evaluate(() => window.__said.map((a) => a.text).join(' | '));
      for (let i = 0; i < 3; i++) await p.evaluate(() => { for (let k = 0; k < 30; k++) window.__app.step(1 / 30); });
      const s = await state();
      check(s.mode === id && s.held && expect[id](s, totals) && !!reply, `${id}: ceiling ${s.rooms.length}, small ${s.lamps.length} [${s.lamps.join(', ')}], "${reply}"`);
      await shoot(`${n++}-${id}`);
    }
    // the active mode is marked, Avsluta shows
    await aimHub();
    m = await menu();
    check(m.rows.join('/') === 'Prata/Ljuslägen …/Myslägen …/Avsluta ljusläget' && m.bottom <= m.h, `while on: ${m.rows.join(' / ')} (bottom ${m.bottom.toFixed(0)})`);
    await p.evaluate(() => { window.__app.runChoice(2); window.__app.step(1 / 60); });
    m = await menu();
    check(m.rows.includes('Kvällsmys (på nu)'), `the mode on is marked: ${m.rows.join(' / ')}`);
    await p.evaluate(() => { window.__app.runChoice(2); window.__app.step(1 / 60); });

    // a manual change during the mode stays after the end; the rest goes back; the Hue Go keeps its colour
    const r1 = await p.evaluate(() => {
      const A = window.__app, L = A.lights, f = L.floorLamps.find((x) => x.name === 'långlampan'), hue = L.floorLamps.find((x) => x.name === 'Hue Go-lampan');
      hue.recolor(0x3366ff);
      f.toggle(); // off by hand (it was on in kvällsmys)
      const R = L.rooms.get('0:Vardagsrum'); L.switches.find((s) => s.room === R).toggle(); // the living room's ceiling on by hand
      const rows = A.lightModes.rows(() => {}, () => {}); rows.find((r) => r.id === 'end').run();
      for (let k = 0; k < 60; k++) A.step(1 / 30);
      return { lang: f.room.on, ceil: R.on, hue: hue.color, mode: A.lightModes.active, held: !!L.held,
        rooms: [...L.rooms.values()].filter((x) => x.on).length, lamps: L.floorLamps.filter((x) => x.room.on).map((x) => x.name) };
    });
    check(!r1.lang && r1.ceil && r1.rooms === 1, `end keeps the player's own changes (långlampan off, Vardagsrum ceiling on, ${r1.rooms} ceiling on)`);
    const back = before.lamps.filter((x) => x !== 'långlampan');
    check(r1.mode === null && !r1.held && back.every((x) => r1.lamps.includes(x)) && r1.lamps.length === back.length, `the rest back as before (${r1.lamps.length} small lamps on)`);
    check(r1.hue === 0x3366ff, 'the Hue Go keeps its colour');
    await shoot('6-ended');

    // the dusk is held during a mode and caught up at its end
    const r2 = await p.evaluate(() => {
      const A = window.__app, L = A.lights, LM = A.lightModes;
      A.day.paused = true;
      LM.start('window');
      L.updateAuto(1, 1 / 30); // dawn
      const during = L.floorLamps.filter((x) => x.room.on).length;
      LM.end();
      const after = L.floorLamps.filter((x) => x.auto && x.room.on).map((x) => x.name);
      L.updateAuto(0, 1 / 30); // dusk again
      return { during, after, dark: L.dark };
    });
    check(r2.during === 2 && r2.after.length === 0 && r2.dark === true, `dawn during a mode: held (${r2.during} on), after the end the dusk lamps follow day (${r2.after.join(', ') || 'none on'})`);

    // a power cut releases the mode: nothing put back, the mode over
    const r3 = await p.evaluate(() => {
      const A = window.__app, L = A.lights, LM = A.lightModes;
      for (const f of L.floorLamps) if (f.auto) f.set(true);
      LM.start('cozy');
      const lit = L.floorLamps.filter((x) => x.room.on).length;
      A.power.trip?.(); if (A.power.on) { A.power.bang?.(); }
      for (let k = 0; k < 10; k++) A.step(1 / 30);
      const r = { mode: LM.active, held: !!L.held, lit: L.floorLamps.filter((x) => x.room.on).length, was: lit, on: A.power.on };
      A.power.restore(); for (let k = 0; k < 10; k++) A.step(1 / 30);
      return r;
    });
    check(!r3.on && r3.mode === null && !r3.held && r3.lit === r3.was, `power cut: released, lamps as they were (${r3.lit}/${r3.was})`);
    // F releases it too
    const r4 = await p.evaluate(() => {
      const A = window.__app, LM = A.lightModes; LM.start('all');
      A.toggleFurniture(false); const r = { mode: LM.active, held: !!A.lights.held }; A.toggleFurniture(true); return r;
    });
    check(r4.mode === null && !r4.held, 'F: released');
    // Prata still answers at random and counts
    const r5 = await p.evaluate(() => {
      const A = window.__app; const c0 = A.stats.nest ?? 0; let a = null; A.nests.onAnswer = (sp, x) => { a = x; };
      A.nests.hush(); A.lightModes.page = 'top';
      A.nests.speakers[0].target.options()[0].run(); return { key: a?.key, c: (A.stats.nest ?? 0) - c0 };
    });
    check(r5.key && !r5.key.startsWith('mode-') && r5.c >= 0, `Prata: a random answer (${r5.key})`);
    await p.close();

    // a phone: the touch buttons of the longest page fit
    const q = await open(ctx, 844, 390, true); // (a phone held sideways: the game asks to turn a portrait one)
    await q.evaluate(() => { window.__app.lightModes.start('all'); window.__app.step(1 / 60); });
    const t = await q.evaluate(() => {
      const el = document.getElementById('choices'); const bs = [...el.querySelectorAll('button')];
      return { rows: bs.map((b) => b.textContent), fit: bs.every((b) => { const r = b.getBoundingClientRect(); return r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 && r.height >= 44 && r.left >= -0.5; }) };
    });
    check(t.rows.length === 4 && t.fit, `phone 844×390: ${t.rows.join(' / ')} all inside, ≥ 44 px`);
    await q.screenshot({ path: path.join(OUT, '7-phone-menu.png'), timeout: 120000 }).catch((e) => lines.push(`INFO phone screenshot: ${e.message.split('\n')[0]}`));
  } catch (e) { check(false, `error: ${e.stack}`); }
  await ctx.close();
  console.log(`${ok ? 'ALL PASS' : 'SOME FAILED'}\n${lines.join('\n')}`);
  process.exit(ok ? 0 : 1);
})();
