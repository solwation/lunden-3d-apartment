// #1965: the visitable flats' mid level (src/visitunit.js buildMid / cull, STANDARD.lod) in the real app.
//   PLAYWRIGHT_MODULE=… CHROME_PATH=… tools/browsertest.sh node tools/visitlodtest.cjs GAME [OUT] [--lowmem] [--night]
// Checks, at L1004 seen from its street: the levels by distance; draw calls / triangles with the mid level and without it
// (`unit.mid` taken away = `&nolod`: the old two levels) in the same page; that the merged level draws the full level's
// pixels at the swap (a screenshot of each from the same spot, compared); that an open door keeps all the parts
// until STANDARD.detail m. With OUT: pictures near / mid / in the fade zone / far, with and without the mid level.
// `&test` with its full look (testmode setFull: top quality, shadows) and the game's own loop stopped: every frame measured or
// pictured is one `__app.frame()` this test asks for (a free-running full-quality loop under SwiftShader starves the test). `--lowmem` = the phone profile (`&lowmem`), `--night` = 23:00 with the flats' lamps on.
const fs = require('fs'), path = require('path');
const kit = require('./testkit.cjs');

const [game, ...rest] = process.argv.slice(2);
const out = rest.find((a) => !a.startsWith('--')), lowmem = rest.includes('--lowmem'), night = rest.includes('--night');
if (!game) { console.error('usage: node tools/visitlodtest.cjs GAME [OUT] [--lowmem] [--night]'); process.exit(2); }

(async () => {
  const browser = await kit.launch();
  const url = `${game}/?shot&cloud=&time=${night ? 23 : 12}&month=6&day=15&freeze&weather=clear&at=-22,-9,180,0${lowmem ? '&lowmem' : ''}`;
  const errors = [];
  const { page } = await kit.open(browser, url, { viewport: lowmem ? { width: 844, height: 390 } : { width: 1024, height: 640 },
    init: (n) => { localStorage.setItem('lunden.name', n); sessionStorage.setItem('lunden.nameSkipped', '1'); }, arg: 'Test' });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /no mid level/.test(m.text())) errors.push(m.text()); });
  console.log('     page up');
  await page.evaluate(async (night) => {
    const A = window.__app, r = A.renderer;
    r.setAnimationLoop(null); A.showOverlay(false); A.testMode.setFull(true);
    const { STANDARD } = await import(new URL('./src/config.js', location.href).href);
    if (night) A.visitLights.setAll(true);
    const main = { calls: 0, tris: 0, flat: 0 }, inside = new Set(); // `flat`: the draws of L1004's inside (its parts or its merged level)
    A.world.units.find((q) => q.id === 'L1004').detail.forEach((o) => o.traverse((c) => inside.add(c)));
    A.world.units.find((q) => q.id === 'L1004').mid?.group.traverse((c) => inside.add(c));
    const rbd = r.renderBufferDirect, smr = r.shadowMap.render;
    let inShadow = false;
    r.shadowMap.render = function () { inShadow = true; try { return smr.apply(this, arguments); } finally { inShadow = false; } };
    r.renderBufferDirect = function () {
      const t0 = r.info.render.triangles, res = rbd.apply(this, arguments);
      if (!inShadow && !r.getRenderTarget()) { main.calls++; main.tris += r.info.render.triangles - t0; if (inside.has(arguments[4])) main.flat++; }
      return res;
    };
    const u = A.world.units.find((q) => q.id === 'L1004'), mid = u.mid, x = (u.box.x0 + u.box.x1) / 2;
    window.__lod = {
      STANDARD, u, mid, x,
      /** Stand `d` m north of the flat's street face, looking at it; `lod` false = without the mid level. */
      at(d, lod = true) {
        u.mid = lod ? mid : null;
        u.cull(A.camera.position, true); // (so that the level is set again from scratch)
        A.player.spawn(x, u.box.z0 - d, Math.PI);
        A.camera.rotation.x = 0;
        A.frame(0.016);
        return u.shown;
      },
      measure() {
        main.calls = 0; main.tris = 0; main.flat = 0;
        A.frame(0.016); // (a real frame of the game: step + render; counted are the screen draws, not shadow / mirror passes)
        return { ...main };
      },
      diff(a, b, tol = 8) { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > tol || Math.abs(a[i + 1] - b[i + 1]) > tol || Math.abs(a[i + 2] - b[i + 2]) > tol) n++; return n; },
    };
  }, night);

  let ok = true;
  const check = (c, text) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${text}`); if (!c) ok = false; };

  const info = await page.evaluate(() => {
    const { u, mid, STANDARD } = window.__lod;
    const draws = (o) => { let n = 0; o.traverse((m) => { if ((m.isMesh || m.isLine) && m.visible && [m.material].flat().some((x) => x.visible)) n += [m.material].flat().length; }); return n; };
    const tris = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; }); return n; };
    const bytes = (o) => { let n = 0; o.traverse((m) => { if (m.geometry) { for (const a of Object.values(m.geometry.attributes)) n += a.array.byteLength; n += m.geometry.index?.array.byteLength ?? 0; } }); return n; };
    return window.__app.world.units.map((q) => q.mid && ({ id: q.id, parts: q.detail.reduce((n, o) => n + draws(o), 0), merged: q.mid.group.children.length, pass: q.mid.pass.size,
      tris: tris(q.mid.group), bytes: bytes(q.mid.group), start: q.mid.start, end: q.mid.end, near: STANDARD.lod.near, hysteresis: STANDARD.lod.hysteresis, detail: STANDARD.detail }));
  });
  check(info.every(Boolean), 'both flats have a mid level');
  for (const i of info.filter(Boolean)) console.log(`     ${i.id}: ${i.parts} part draws -> ${i.merged} merged + ${i.pass} kept as they are; ${i.tris} triangles, ${(i.bytes / 1048576).toFixed(2)} MB of geometry; all <= ${i.near} m, fade ${i.start}..${i.end} m`);
  const { near, detail, start, end, hysteresis } = info[0];

  // levels and cost by distance, with and without the mid level
  const rows = [];
  for (const d of [3, near - hysteresis - 0.2, near + 1, 9, detail - 0.5, detail + 2, (detail + start) / 2 + 2, (start + end) / 2, end + 2, 45].filter((v, i, a) => a.indexOf(v) === i && v > 0).sort((a, b) => a - b)) {
    const row = await page.evaluate((d) => {
      const L = window.__lod, a = L.at(d, true), m = L.measure(), fade = Math.min(1, Math.max(0, (d - L.mid.start) / (L.mid.end - L.mid.start))), cd = L.mid.centre.value.distanceTo(window.__app.camera.position), b = L.at(d, false), n = L.measure();
      L.at(d, true);
      return { d, lod: a, fade, cd, calls: m.calls, tris: m.tris, flat: m.flat, old: b, oldCalls: n.calls, oldTris: n.tris, oldFlat: n.flat };
    }, d);
    rows.push(row);
    console.log(`     ${row.d.toFixed(1)} m: ${row.old} ${row.oldCalls} calls (${row.oldFlat} its inside) / ${row.oldTris} tris -> ${row.lod}${row.lod === 'mid' ? ` (fade ${row.fade.toFixed(2)})` : ''} ${row.calls} calls (${row.flat} its inside) / ${row.tris} tris (${row.calls - row.oldCalls >= 0 ? '+' : ''}${row.calls - row.oldCalls})`);
  }
  check(rows.filter((r) => r.lod === 'mid').every((r) => Math.abs(r.cd - r.d) < 0.01), 'mid level: the fade centre is kept at the flat\'s distance from the camera');
  const want = (d) => d <= near - hysteresis ? 'all' : d < end ? 'mid' : 'shell';
  check(rows.every((r) => r.lod === want(r.d)), `levels by distance: all <= ${near} m, mid < ${end} m, shell beyond`);
  check(rows.filter((r) => r.d <= near || r.d >= end).every((r) => r.calls === r.oldCalls && r.tris === r.oldTris), 'near and beyond the zone: the same draw calls and triangles as without the mid level');
  check(rows.filter((r) => r.d > near && r.d <= detail).every((r) => r.calls < r.oldCalls - 50), `${near}..${detail} m: at least 50 draw calls fewer than all the parts`);
  if (end <= detail) check(rows.every((r) => r.calls <= r.oldCalls), 'phone zone: never more draw calls than without the mid level');

  // the swap shows the same pixels: the merged level against all the parts, from the same spot
  // (real frames of the game's own loop, as screenshots: a lone render into a target also showed a stale shadow map)
  const frame = async (d, lod) => {
    const level = await page.evaluate(async ({ d, lod }) => {
      const L = window.__lod, level = L.at(d, lod);
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(() => { L.u.mid = lod ? L.mid : null; window.__app.frame(0.016); r(); }));
      return level;
    }, { d, lod });
    return { level, png: (await page.screenshot({ timeout: 300000 })).toString('base64') };
  };
  for (const d of [near + 0.5, Math.min(9, start - 0.5)]) {
    const a = await frame(d, true), b = await frame(d, false);
    const r = await page.evaluate(async ([p, q]) => {
      const px = async (b64) => {
        const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, img.width, img.height).data;
      };
      const x = await px(p), y = await px(q);
      let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
      const w = Math.round(Math.sqrt(x.length / 4 * innerWidth / innerHeight));
      for (let i = 0; i < x.length; i += 4) if (Math.abs(x[i] - y[i]) > 8 || Math.abs(x[i + 1] - y[i + 1]) > 8 || Math.abs(x[i + 2] - y[i + 2]) > 8) { const px = (i / 4) % w, py = Math.floor(i / 4 / w); x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
      return { n: window.__lod.diff(x, y), of: x.length / 4, box: [x0, y0, x1, y1] };
    }, [a.png, b.png]);
    check(a.level === 'mid' && b.level === 'all' && r.n <= r.of * 0.005, `${d} m: the merged level draws what all the parts draw (<= 0.5 %: one-pixel outline joints and window-reveal edges; 0.36 % measured at 5.5 m, #1965), ${r.n} of ${r.of} pixels differ by more than 8/255${r.n ? ` (within ${r.box})` : ''}`);
  }
  await page.evaluate(() => { window.__lod.u.mid = window.__lod.mid; });

  // an open door keeps all the parts out to the old distance; shut again, the merged level is back
  const door = await page.evaluate(async () => {
    const L = window.__lod, A = window.__app, d = L.u.doors.find((q) => !q.exterior);
    L.at(8, true);
    const before = L.u.shown;
    d.toggle();
    for (let i = 0; i < 400 && d.t !== 1; i++) A.step(1 / 30);
    const open = L.u.shown, t = d.t;
    L.at(L.STANDARD.detail + 2, true);
    const beyond = L.u.shown;
    L.at(8, true);
    d.toggle();
    for (let i = 0; i < 400 && d.t !== 0; i++) A.step(1 / 30);
    A.step(1 / 60);
    return { before, open, t, beyond, shut: L.u.shown };
  });
  check(door.before === 'mid' && door.t === 1 && door.open === 'all' && door.beyond === 'mid' && door.shut === 'mid', `an open inner door at 8 m: ${door.before} -> ${door.open} (beyond ${detail} m: ${door.beyond}), shut again: ${door.shut}`);

  if (out) {
    fs.mkdirSync(out, { recursive: true });
    const tag = `${lowmem ? 'phone-' : ''}${night ? 'night-' : ''}`;
    const snap = async (name, d, lod, fov) => {
      await page.evaluate(async ({ d, lod, fov }) => {
        const L = window.__lod, A = window.__app;
        L.at(d, lod);
        if (fov) { A.camera.fov = fov; A.camera.updateProjectionMatrix(); }
        for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(() => { A.frame(0.016); r(); }));
      }, { d, lod, fov });
      await page.screenshot({ path: path.join(out, `${tag}${name}.png`), timeout: 300000 });
    };
    const base = await page.evaluate(() => window.__app.camera.fov);
    await snap(`near-${near - 1}m-all`, near - 1, true);
    await snap(`mid-${near + 2}m-merged`, near + 2, true);
    await snap(`mid-${near + 2}m-all-parts`, near + 2, false);
    const z = Math.round((detail + start) / 2 + 2);
    if (end > detail) {
      await snap(`zoom-${z}m-before-shell`, z, false, 22);
      await snap(`zoom-${z}m-after-merged`, z, true, 22);
      for (const f of [0.25, 0.5, 0.75]) await snap(`zoom-fade-${Math.round(f * 100)}-at-${(start + (end - start) * f).toFixed(0)}m`, start + (end - start) * f, true, 14);
      await snap(`zoom-${end + 2}m-shell`, end + 2, true, 14);
    } else {
      for (const f of [0.25, 0.5, 0.75]) await snap(`zoom-fade-${Math.round(f * 100)}-at-${(start + (end - start) * f).toFixed(1)}m`, start + (end - start) * f, true, 30);
    }
    await page.evaluate((fov) => { const A = window.__app; A.camera.fov = fov; A.camera.updateProjectionMatrix(); window.__lod.u.mid = window.__lod.mid; }, base);
  }

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  console.log(ok ? 'PASS visitlodtest' : 'FAIL visitlodtest');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); console.log('FAIL visitlodtest (exception)'); process.exit(1); });
