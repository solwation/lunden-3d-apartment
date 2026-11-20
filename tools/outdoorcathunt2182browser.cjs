// #2182: outdoor cats and birds in the real app, before/after. Scene A: a cat on a stalk outing with a flock pecking on the ground 7.4 m
// away (after: it creeps up, wiggles, leaps and misses, the flock lifts; before: it ignores them). Scene B: a cat resting under real
// tree-perched birds (after: it sits up and chatters, with the click burst counted from the app's own audio call; before: it just sits).
// FORCED scenes (conductor's time-box): the cat's schedule pose is pinned to a resting spot (kind stalk / rest) in a real park lawn, next to a real
// ground group / a real tree group of the park flock, in daylight; the brain, flock, audio call and renderer are the real ones.
// Run 'after' first: it writes views.json (cat, stop, camera plan), which 'before' (the base revision on another port) reuses.
//   python3 tools/devserve.py PORT &   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/outdoorcathunt2182browser.cjs http://localhost:PORT OUTDIR after|before
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8310', out = process.argv[3] || '/tmp/hunt2182', phase = process.argv[4] || 'after';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const views = phase === 'before' ? JSON.parse(fs.readFileSync(path.join(out, 'views.json'), 'utf8')) : null;
  const browser = await kit.launch(), result = { phase, errors: [] };
  try {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', (r) => r.fulfill({ path: path.join(process.env.THREE_DIR, new URL(r.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript' }));
    await ctx.addInitScript(() => { let a; Object.defineProperty(window, '__app', { get: () => a, set: (v) => { a = v; v.renderer.setAnimationLoop(null); } }); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => result.errors.push(e.message));
    await page.goto(`${base}/?shot&time=11&month=6&day=2&weather=clear&freeze&cloud=&perf`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__app?.birds && window.__app.outdoorCats && window.__app.renderer, null, { timeout: 1500000, polling: 1000 });
    await kit.skipNameDialog(page).catch(() => {});
    const res = await page.evaluate(async (views) => {
      const a = __app, B = a.birds, O = a.outdoorCats, { OUTDOOR_CATS: C } = await import('/src/config.js'), has = !!(await import('/src/outdoorcatbrain.js')).OutdoorCatBrain.prototype.startChatter;
      let P2 = null; try { P2 = await import('/src/outdoorcatprey.js'); } catch (e) { /* the base revision has none */ }
      a.showOverlay?.(false); a.day.hour = 11; a.day.paused = true; B.fade = 1; O.cat?.hide(); O.bound = null; O.winter = false; O.rain = 0;
      const orig = B.threats; B.threats = (o) => { orig(o); o.shift(); return o; }; // (the eye does not flush: the camera is close; the cats still do)
      window.__clock = C.epoch + 86400 * 2; O.now = () => __clock;
      for (let i = 0; i < 3; i++) B.update(1 / 30, 0, false);
      let chirps = 0; const sfx = (await import('/src/audio.js')).sfx; if (sfx.catChatter) { const o = sfx.catChatter; sfx.catChatter = (...q) => { chirps++; return o.apply(sfx, q); }; }
      const L = B.life, v = views ?? {}, frames = [], log = [];
      const look = (p, at, fov) => { a.camera.fov = fov; a.camera.updateProjectionMatrix(); a.camera.position.set(p[0], p[1], p[2]); a.camera.lookAt(at[0], at[1], at[2]); a.camera.updateMatrixWorld(true); };
      const shot = (label) => { a.scene.updateMatrixWorld(true); a.renderer.render(a.scene, a.camera); frames.push({ label, png: a.renderer.domElement.toDataURL('image/png') }); };
      const sit = (f, g) => { f.assign(g); for (const b of f.birds) { Object.assign(b, { x: b.spot.x, y: b.spot.y, z: b.spot.z, from: null, mode: 2 }); f.sitDown(b); } f.settle(); f.dwell = 1e6; };
      const T = await import('three'), ray = new T.Raycaster(); ray.camera = a.camera;
      // a camera spot `dist` m from (x, z) on the free side (nothing solid between it and the target; level ground), nearest to the direction `ang`
      const pickCam = (x, z, gy, dist, ty, ang) => {
        const tgt = new T.Vector3(x, ty, z); let best = null;
        for (let k = 0; k < 24; k++) {
          const an = ang + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 12, cx = x + Math.sin(an) * dist, cz = z + Math.cos(an) * dist, cy = O.ground(cx, cz);
          if (!Number.isFinite(cy) || Math.abs(cy - gy) > 0.5) continue;
          const o = new T.Vector3(cx, gy + 1.05, cz), d = tgt.clone().sub(o), len = d.length(); ray.set(o, d.normalize()); ray.far = len;
          if (ray.intersectObjects(a.scene.children, true).some((h) => h.object.isMesh && h.object.visible && !h.object.isSprite && h.distance < len - 0.4)) continue;
          best = [cx, gy + 1.05, cz]; break;
        }
        return best;
      };
      const stopStart = (c, m) => c.stop(m).start;
      const settleAll = (c, t) => { __clock = t; for (const q of O.cats) { q.resume(); const sp = q.scheduled(); O.place(q, sp); q.alpha = 1; q.activity = sp.activity; } c.update(0.05, { x: 1e5, z: 1e5, d: 1e5, ok: true, still: 0 }, true); };
      // ---- plan (after): forced scenes on the park lawn, real flock groups
      const flat = (x, z, gy) => { const y = O.ground(x, z); return Number.isFinite(y) && Math.abs(y - gy) < 0.25; };
      const wayOk = (c, ax, az, bx, bz) => { for (let k = 0; k <= 10; k++) { const x = ax + (bx - ax) * k / 10, z = az + (bz - az) * k / 10; if (!flat(x, z, O.ground(ax, az))) return false; } return c.env.clear(ax, az, bx, bz) && (!c.env.free || c.env.free(bx, bz)); };
      const cat0 = O.cats.find((q) => q.name === 'Findus') ?? O.cats[2];
      if (!views) {
        const flocks = L.flocks.slice().reverse(); // the park flock first
        for (const f of flocks) {
          for (const g of f.groups) {
            if (g.kind === 'ground' && !v.stalk) for (let k = 0; k < 24 && !v.stalk; k++) {
              const an = k / 24 * Math.PI * 2, px = g.x + Math.sin(an) * 7.4, pz = g.z + Math.cos(an) * 7.4;
              if (flat(px, pz, g.y) && wayOk(cat0, px, pz, g.x, g.z)) v.stalk = { flock: L.flocks.indexOf(f), g: { x: g.x, z: g.z, y: g.y }, P: { x: px, z: pz }, yaw: Math.atan2(g.x - px, g.z - pz) };
            }
            if (g.kind === 'tree' && !v.chat && g.y - O.ground(g.x, g.z) > 2.2) for (let k = 0; k < 24 && !v.chat; k++) {
              const an = k / 24 * Math.PI * 2, px = g.x + Math.sin(an) * 4.5, pz = g.z + Math.cos(an) * 4.5;
              if (flat(px, pz, O.ground(g.x, g.z)) && wayOk(cat0, px, pz, px + 0.1, pz)) v.chat = { flock: L.flocks.indexOf(f), tree: { x: g.x, z: g.z, y: g.y }, P: { x: px, z: pz }, yaw: Math.atan2(g.x - px, g.z - pz) };
            }
          }
        }
        // a stop number for which the cat chatters (the hash decides; the base revision has no such helper)
        v.chatM = 1; if (P2) for (let m = 1; m < 200; m++) if (P2.wantsChatter(cat0.id, m, cat0.traits)) { v.chatM = m; break; }
      }
      // pin a cat: resting at P (kind), every other cat away; the real brain, flock and sound do the rest
      const force = (c, P, yaw, kind, m) => {
        for (const q of O.cats) { q.resume(); if (q !== c) { q.st = 'away'; q.awayUntil = __clock + 1e9; q.group.visible = false; } }
        c.st = 'route'; c.x = P.x; c.z = P.z; c.yaw = yaw; c.h = 0; c.alpha = 1; c.huntCool = 0; c.chatCool = 0; c.chatStop = -1; c.leap = null; c.chat = null; c.prey = null; c.restDone = 10; c.restLeft = 50;
        c.outing = { m, kind, segs: [], P, R: 60 };
        c.schedulePose = function () { this.at = { x: P.x, z: P.z, walking: false }; this.kind = kind; return { x: P.x, z: P.z, h: 0, pitch: 0, hop: 0, yaw, walking: false, activity: 'look', bf: null }; };
        c.update(0.05, { x: 1e5, z: 1e5, d: 1e5, ok: true, still: 0 }, true);
      };
      {
        if (!v.stalk || !v.chat) return { views: v, frames, log, note: 'no scene found' };
      }
      // ---- scene A: the stalk
      {
        const s = v.stalk, c = cat0, f = L.flocks[s.flock];
        const grp = f.groups.find((q) => q.kind === 'ground' && Math.abs(q.x - s.g.x) < 1e-6 && Math.abs(q.z - s.g.z) < 1e-6); f.home = { ...f.home, x: s.g.x, z: s.g.z, r: 400 }; sit(f, grp);
        force(c, s.P, s.yaw, 'stalk', 5);
        a.player.spawn(s.P.x, s.P.z, 0);
        const ev = { t: 0, creep: null, crouch: null, leap: null, lift: null }; let t = 0, dmin = 99;
        const mid = () => { const m = f.birds.reduce((q, b) => [q[0] + b.x / f.birds.length, q[1] + b.y / f.birds.length, q[2] + b.z / f.birds.length], [0, 0, 0]); return m; };
        const gyA = O.ground(s.P.x, s.P.z), mxA = (s.P.x + s.g.x) / 2, mzA = (s.P.z + s.g.z) / 2, ang0 = Math.atan2(-(s.g.z - s.P.z), s.g.x - s.P.x);
        const camA = pickCam(mxA, mzA, gyA, 5.2, gyA + 0.3, ang0) ?? pickCam(mxA, mzA, gyA, 4.6, gyA + 0.3, ang0 + Math.PI) ?? [mxA, gyA + 1.05, mzA + 5.2];
        if (!camA) throw new Error('no camera for A');
        v.A0 = { cat: [c.x, c.z], P: s.P, camA };
        const frame = () => look(camA, [mxA, gyA + 0.25, mzA], 46);
        const tick = (n) => { for (let i = 0; i < n; i++) { __clock += 0.05; t += 0.05; frame(); O.update(0.05, false, 0); B.update(0.05, 0, false); dmin = Math.min(dmin, Math.hypot(c.x - mid()[0], c.z - mid()[2]));
          const flying = f.birds.filter((b) => b.mode !== 2).length; if (flying && ev.lift == null) ev.lift = +t.toFixed(2);
          if (c.st === 'prey' && c.activity === 'creep' && !ev.creep && Math.hypot(c.x - s.g.x, c.z - s.g.z) < 5.5) ev.creep = +t.toFixed(2);
          if (c.st === 'prey' && c.activity === 'crouch' && !ev.crouch) ev.crouch = +t.toFixed(2);
          if (c.st === 'leap' && !ev.leap) ev.leap = +t.toFixed(2); } };
        frame(); tick(1); // the first update settles the cat; the camera starts at 5.2 m
        const at = views ? views.A : null, plan = [];
        if (!views) {
          // after: run it through, recording the key times; frames are taken in a second pass with the same times
          for (let i = 0; i < 1200 && !ev.leap; i++) tick(1);
          v.A = { ...ev };
        }
        // second pass for the pictures (identical in both revisions: the fixed times of the 'after' run)
        sit(f, grp); force(c, s.P, s.yaw, 'stalk', 5); t = 0; ev.creep = ev.crouch = ev.leap = ev.lift = null; frame(); tick(1);
        const T = views ? views.A : v.A, want = [[T.creep - 1, 'A1 cat 1 s before it creeps into the frame'], [T.creep + 4, 'A2 creeping up on the flock'], [T.crouch + 0.5, 'A3 crouched, wiggling, before the leap'], [T.leap + 0.35, 'A4 mid-leap, the flock lifting'], [T.leap + 1.6, 'A5 after the missed leap, birds flying off']];
        for (const [tt, label] of want) { while (t < tt - 1e-6) tick(1); frame(); shot(label); log.push({ label, t: +t.toFixed(2), st: c.st, act: c.activity, dist: +Math.hypot(c.x - mid()[0], c.z - mid()[2]).toFixed(2), flying: f.birds.filter((b) => b.mode !== 2).length, flushes: f.flushes }); }
        log.push({ sceneA: { dmin: +dmin.toFixed(2), events: ev, T } });
        // let everything settle (the cat may not hunt again within huntCool; no birds are ever removed)
        for (let i = 0; i < 200; i++) tick(1);
        log.push({ birdsAfter: f.birds.length });
      }
      // ---- scene B: the chatter
      {
        const s = v.chat, c = cat0, f = L.flocks[s.flock], g = f.groups.find((q) => q.kind === 'tree' && Math.abs(q.x - s.tree.x) < 1e-6 && Math.abs(q.z - s.tree.z) < 1e-6);
        sit(f, g); f.home = { ...f.home, r: 400 };
        force(c, s.P, s.yaw, 'rest', v.chatM); chirps = 0;
        const mid = () => f.birds.reduce((q, b) => [q[0] + b.x / f.birds.length, q[1] + b.y / f.birds.length, q[2] + b.z / f.birds.length], [0, 0, 0]);
        let t = 0, sawChatter = false, maxK = 0; const gy = O.ground(c.x, c.z);
        const dx = s.tree.x - s.P.x, dz = s.tree.z - s.P.z, mx = (s.P.x + s.tree.x) / 2, mz = (s.P.z + s.tree.z) / 2;
        const camB = pickCam(mx, mz, gy, 5.4, gy + 1.6, Math.atan2(-dz, dx)) ?? pickCam(mx, mz, gy, 4.8, gy + 1.6, Math.atan2(-dz, dx) + Math.PI);
        if (!camB) throw new Error('no camera for B');
        const frame = () => look(camB, [mx, gy + 1.6, mz], 50);
        const tick = (n) => { for (let i = 0; i < n; i++) { __clock += 0.05; t += 0.05; frame(); O.update(0.05, false, 0); B.update(0.05, 0, false); if (c.st === 'chatter') sawChatter = true; maxK = Math.max(maxK, c.chatterK ?? 0); } };
        frame(); tick(1);
        const marks = views ? views.B : null, rec = {};
        if (!views) { for (let i = 0; i < 400 && c.st !== 'chatter'; i++) tick(1); rec.start = +t.toFixed(2); v.B = { start: rec.start }; }
        sit(f, g); force(c, s.P, s.yaw, 'rest', v.chatM); chirps = 0; t = 0; frame(); tick(1);
        const T0 = (views ? views.B : v.B).start;
        for (const [tt, label] of [[T0 - 1.5, 'B1 sitting under the birds'], [T0 + 0.25, 'B2 chattering at the birds, jaw and tail tip trembling'], [T0 + 0.75, 'B3 between bursts, still looking up'], [T0 + 1.65, 'B4 second burst']]) {
          while (t < tt - 1e-6) tick(1); frame(); shot(label); log.push({ label, t: +t.toFixed(2), st: c.st, act: c.activity, k: +(c.chatterK ?? 0).toFixed(2), chirps });
        }
        log.push({ sceneB: { sawChatter, maxK: +maxK.toFixed(2), chirps, birds: f.birds.length, perched: f.birds.filter((b) => b.mode === 2).length } });
      }
      const r = a.renderer.info;
      return { views: v, log, frames, has, calls: r.render.calls, tris: r.render.triangles, programs: r.programs?.length, textures: r.memory.textures,
        perf: (() => { const t0 = performance.now(); for (let i = 0; i < 300; i++) { __clock += 0.05; O.update(0.05, false, 0); B.update(0.05, 0, false); } return +((performance.now() - t0) / 300).toFixed(3); })() };
    }, views);
    res.frames.forEach((f, i) => fs.writeFileSync(path.join(out, `${phase}-${f.label.split(' ')[0]}.png`), Buffer.from(f.png.split(',')[1], 'base64')));
    result.labels = res.frames.map((f) => f.label); delete res.frames;
    if (phase === 'after') fs.writeFileSync(path.join(out, 'views.json'), JSON.stringify(res.views));
    Object.assign(result, res);
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(out, phase + '.json'), JSON.stringify(result, null, 1)); console.log(JSON.stringify(result, null, 1));
  if (result.errors.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
