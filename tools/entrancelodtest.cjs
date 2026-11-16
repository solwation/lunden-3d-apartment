// #1967: the entrance plants' far level, measured in the real game (no `&test`: this counts drawing).
//   python3 tools/devserve.py 8596 .
//   tools/browsertest.sh node tools/entrancelodtest.cjs http://localhost:8596 OUT_DIR [desktop|lowmem]
// (lowmem only checks that phones build no far level: measured in #1967, their colour batch left too little to save.)
// Same frame with the far level on and off (`lod.setRange(1e6, 2e6)`): draw calls and triangles of the whole frame, the plants'
// own submissions to the colour and the shadow pass, pictures of each view both ways and 4x crops of the plants side by side.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), fs = require('node:fs');
const [game = 'http://localhost:8596', out = '/tmp/entrancelod', modeArg = 'desktop'] = process.argv.slice(2);
const mode = modeArg === 'lowmem' ? 'lowmem' : 'desktop'; fs.mkdirSync(out, { recursive: true });
let failed = 0; const check = (ok, name, data) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${data === undefined ? '' : JSON.stringify(data)}`); if (!ok) failed++; };
const VIEWS = [ // name, x, z, yaw (180 = south, towards the entrances), the plant to crop round (unit index in records)
  ['near-4m', 3, -4.2, 180], ['zone-16m', -2, -16.4, 180], ['far-25m', -20, -25, 180], ['far-35m', -20, -35, 180], ['along-12m', 12, -1.6, 90],
];
const size = mode === 'lowmem' ? { width: 844, height: 390 } : { width: 1280, height: 800 };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), errors = [];
  try {
    const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1 }), page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await ctx.addInitScript(() => { localStorage.setItem('lunden.name', 'Anna'); sessionStorage.setItem('lunden.nameSkipped', '1'); }); // no name dialog over the pictures
    await page.goto(`${game}/?time=7&month=7&weather=clear&freeze&shot${mode === 'lowmem' ? '&lowmem' : ''}&at=3,-4.2,180`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.renderer && window.__app.warm?.done !== false, null, { timeout: 1500000 });
    if (mode === 'lowmem') { // phones keep the plain meshes (their colour batch already draws the plants in a few calls)
      check(await page.evaluate(() => !__app.scene.getObjectByName('entrance-plants').userData.lod && !__app.scene.getObjectByName('entrance-plants-far')), 'lowmem: no far level');
      return;
    }
    await page.evaluate(async () => {
      const a = __app, THREE = await import('three'); a.renderer.setAnimationLoop(null); a.showOverlay(false);
      const plants = a.scene.getObjectByName('entrance-plants'), lod = plants.userData.lod, C = (await import('/src/config.js')).ENTRANCE_PLANTS.lod;
      const c = { colour: 0, tris: 0, shadow: 0, far: 0 };
      plants.traverse((o) => {
        if (!o.isMesh) return;
        o.onBeforeRender = (r, s, cam, g) => { c.colour++; if (o === lod.far) c.far++; c.tris += (o === lod.far ? g.drawRange.count : (g.index ?? g.attributes.position).count * (o.isInstancedMesh ? o.count : 1)) / 3; };
        o.onBeforeShadow = () => { c.shadow++; };
      });
      window.T = { a, plants, lod, C,
        go(x, z, yaw) { a.player.spawn(x, z, yaw * Math.PI / 180); a.camera.rotation.x = 0; for (let k = 0; k < 3; k++) { a.step(0.016); a.frame(0.016); } },
        measure(on) {
          lod.setRange(on ? C.start : 1e6, on ? C.end : 2e6);
          a.frame(0.016); a.renderer.shadowMap.needsUpdate = true; Object.assign(c, { colour: 0, tris: 0, shadow: 0, far: 0 }); a.frame(0.016);
          const i = a.renderer.info.render, eye = a.camera.getWorldPosition(new THREE.Vector3()), v = new THREE.Vector3();
          const d = plants.userData.records.map((r) => r.model.getWorldPosition(v).distanceTo(eye));
          return { calls: i.calls, triangles: i.triangles, plantCalls: c.colour, plantTriangles: Math.round(c.tris), plantShadowCalls: c.shadow, farDrawn: c.far, farPlants: lod.plants,
            ownShown: plants.userData.records.filter((r) => r.model.visible).length, nearest: +Math.min(...d).toFixed(1), furthest: +Math.max(...d).toFixed(1) };
        },
        /** A 220 x 140 px screen box round the on-screen plant nearest the middle of the picture (for the crops). */
        box() {
          const w = innerWidth, h = innerHeight; let best = null;
          for (const r of plants.userData.records) {
            const s = r.model.getWorldPosition(new THREE.Vector3()).project(a.camera); s.y += 0; if (s.z > 1 || Math.abs(s.x) > 0.9 || Math.abs(s.y) > 0.9) continue;
            if (!best || Math.abs(s.x) < Math.abs(best.x)) best = s;
          }
          if (!best) return null;
          const x = Math.round((best.x + 1) / 2 * w), y = Math.round((1 - best.y) / 2 * h);
          return { x: Math.max(0, Math.min(w - 220, x - 110)), y: Math.max(0, Math.min(h - 140, y - 105)), width: 220, height: 140 };
        } };
    });
    const m = {}, crops = [];
    for (const [name, x, z, yaw] of VIEWS) {
      await page.evaluate(([x, z, yaw]) => T.go(x, z, yaw), [x, z, yaw]);
      const off = await page.evaluate(() => T.measure(false)); await page.screenshot({ path: `${out}/${mode}-${name}-off.png`, timeout: 300000 });
      const clip = await page.evaluate(() => T.box());
      const cropOff = clip && (await page.screenshot({ clip, timeout: 300000 })).toString('base64');
      const on = await page.evaluate(() => T.measure(true)); await page.screenshot({ path: `${out}/${mode}-${name}.png`, timeout: 300000 });
      const cropOn = clip && (await page.screenshot({ clip, timeout: 300000 })).toString('base64');
      m[name] = { off, on, saved: { calls: off.calls - on.calls, triangles: off.triangles - on.triangles, shadowCalls: off.plantShadowCalls - on.plantShadowCalls } };
      console.log('VIEW', mode, name, JSON.stringify(m[name]));
      if (clip) crops.push({ name, clip, cropOff, cropOn });
    }
    // 4x crops, left the plants' own meshes (far level off), right with the far level; and how much the two differ
    const cmp = await ctx.newPage();
    for (const { name, clip, cropOff, cropOn } of crops) {
      await cmp.setViewportSize({ width: clip.width * 8 + 12, height: clip.height * 4 });
      const diff = await cmp.evaluate(async ({ a, b, w, h }) => {
        document.body.style.cssText = 'margin:0;background:#fff'; document.body.innerHTML = '';
        const cv = document.createElement('canvas'); cv.width = w * 8 + 12; cv.height = h * 4; document.body.append(cv);
        const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
        const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = `data:image/png;base64,${s}`; });
        const [ia, ib] = [await load(a), await load(b)];
        g.drawImage(ia, 0, 0, w * 4, h * 4); g.drawImage(ib, w * 4 + 12, 0, w * 4, h * 4);
        const px = (i) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const q = c.getContext('2d'); q.drawImage(i, 0, 0); return q.getImageData(0, 0, w, h).data; };
        const pa = px(ia), pb = px(ib); let changed = 0, sum = 0;
        for (let i = 0; i < pa.length; i += 4) { const d = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]); sum += d; if (d > 24) changed++; }
        return { changedShare: +(changed / (w * h)).toFixed(4), meanDiff: +(sum / (w * h * 3)).toFixed(2) };
      }, { a: cropOff, b: cropOn, w: clip.width, h: clip.height });
      await cmp.screenshot({ path: `${out}/${mode}-${name}-crop-off-on.png` });
      m[name].crop = diff; console.log('CROP', mode, name, JSON.stringify(diff));
    }
    const N = await page.evaluate(() => T.plants.userData.records.length);
    check(m['near-4m'].on.calls === m['near-4m'].off.calls && m['near-4m'].on.triangles === m['near-4m'].off.triangles && m['near-4m'].on.farDrawn === 0, 'by the doors nothing changes: same calls and triangles, the far copy is not drawn', m['near-4m']);
    check(m['zone-16m'].on.farDrawn === 1 && m['zone-16m'].on.ownShown > 0 && m['zone-16m'].on.farPlants > 0, 'in the zone both levels draw', m['zone-16m'].on);
    for (const far of ['far-25m', 'far-35m']) {
      check(m[far].on.ownShown === 0 && m[far].on.plantCalls === 1 && m[far].on.farPlants === N && m[far].saved.calls >= (mode === 'lowmem' ? 1 : 10), `${far}: every plant in ONE draw call`, m[far]);
      check(m[far].on.plantShadowCalls <= Math.max(1, m[far].off.plantShadowCalls), `${far}: no more shadow submissions than before`, [m[far].off.plantShadowCalls, m[far].on.plantShadowCalls]);
      check(m[far].crop && m[far].crop.changedShare < 0.08, `${far}: the picture of the plants hardly changes`, m[far].crop);
    }
    check(m['along-12m'].saved.calls >= (mode === 'lowmem' ? 0 : 5) && m['along-12m'].on.ownShown > 0, 'along the façade: the near plants themselves, the far ones in one call', m['along-12m']);
    check(Object.values(m).every((v) => v.on.calls <= v.off.calls + (v.on.ownShown && v.on.farDrawn ? 1 : 0)), 'at most one more draw call (while plants in view are in the zone), else never more than without the far level', Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [v.off.calls, v.on.calls]])));
    check(!errors.length, 'no page errors', errors);
    fs.writeFileSync(`${out}/${mode}-measurements.json`, JSON.stringify(m, null, 1));
  } finally { await browser.close(); }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL', e.stack); process.exit(1); });
