// #2181: real-browser check of sound occlusion. In the real app world it finds a real interior door, puts a source behind it and
// measures the real src/audio.js graph (OfflineAudioContext): low-pass cut-off, gain and rendered high-frequency energy for a
// clear source, the same source behind the CLOSED door and behind the OPEN door; plus a slab and a loop that follows the door.
// Usage: tools/browsertest.sh node tools/occlusionbrowser.cjs http://127.0.0.1:8302 docs/verification/2181/metrics.json
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://127.0.0.1:8302', outFile = process.argv[3] || '/tmp/occlusion.json';

(async () => {
  const browser = await kit.launch(), checks = [], errors = [], result = {};
  const check = (v, n) => { assert.ok(v, n); checks.push(n); console.log('PASS', n); };
  try {
    const { page } = await kit.open(browser, `${base}/?cloud=&mp=0&at=3,10.8,0&mess=0`, { lazy: true, init: () => { localStorage.setItem('lunden.name', 'Ljudtest'); sessionStorage.setItem('lunden.nameSkipped', '1'); } });
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (/^OCC /.test(m.text())) console.log(m.text()); });
    await page.waitForFunction(() => window.__app?.renderer && window.__app.loadingEl.hidden, null, { timeout: 300000 });
    console.log('OCC world loaded');
    const r = await page.evaluate(async () => {
      const { occlusionFor, cellOf } = await import('/src/soundocclusion.js'), w = __app.world, RATE = 48000;
      // 1. a real swing door of the home's ground floor with different rooms on its two sides and no wall in the way
      let pick = null;
      for (const d of w.doors) {
        if (d.kind !== 'swing' || (d.object.position.y ?? 0) > 1) continue;
        const [x0, z0, x1, z1] = d.segmentAt(0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
        const lis = { x: mx - nx * 1.8, y: 1.6, z: mz - nz * 1.8 }, src = { x: mx + nx * 1.8, y: 1.1, z: mz + nz * 1.8 };
        const a = cellOf(w, lis), b = cellOf(w, src);
        if (a.kind !== 'home' || b.kind !== 'home' || a.key === b.key) continue;
        const was = d.t; d.t = 0; const c = occlusionFor(w, lis, src); d.t = 1; const o = occlusionFor(w, lis, src); d.t = was;
        if (c?.parts.join() === 'door' && o?.parts.join() === 'openDoor') { pick = { d, lis, src, rooms: [a.key, b.key], hinge: d.hinge }; break; }
      }
      console.log('OCC door found ' + !!pick);
      if (!pick) return { error: 'no suitable door' };
      const { d, lis, src } = pick;
      const clearLis = { x: src.x + 0.4, y: 1.6, z: src.z }; // same room as the source
      // 2. the real audio graph
      const hf = (data) => { let s = 0, t = 0; for (let i = 1; i < data.length; i++) { s += (data[i] - data[i - 1]) ** 2; t += data[i] ** 2; } return { rms: Math.sqrt(t / data.length), hf: s / (t || 1) }; };
      let n = 0;
      async function run(listener, kindOfSound, setup) {
        const off = new OfflineAudioContext(1, RATE * 2, RATE), AC = window.AudioContext, rnd = Math.random, cb = off.createBiquadFilter.bind(off);
        let seed = 11; Math.random = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
        const lows = []; off.createBiquadFilter = () => { const f = cb(); lows.push(f); return f; };
        window.AudioContext = function () { return off; };
        try {
          const a = await import(`/src/audio.js?occ=${++n}`); a.initAudio(); a.setAcousticWorld(w);
          a.updateListener({ position: listener, rotation: { y: 0 } });
          const before = lows.length; setup?.();
          let h = null;
          if (kindOfSound === 'loop') { h = a.sfx.dishwasher(src); } else a.sfx.playAt(src, 'bell', 1);
          const filters = lows.slice(before).map((f) => ({ type: f.type, hz: f.frequency.value }));
          const rendered = await off.startRendering();
          return { filters, ...hf(rendered.getChannelData(0)), a, h };
        } finally { window.AudioContext = AC; Math.random = rnd; }
      }
      console.log('OCC graph start');
      const out = { door: { hinge: pick.hinge, rooms: pick.rooms }, listener: lis, source: src };
      const est = (l) => occlusionFor(w, l, src);
      d.t = 1; out.estimateOpen = est(lis); d.t = 0; out.estimateClosed = est(lis); out.estimateSameRoom = est(clearLis);
      const pack = (x) => ({ lowpassFilters: x.filters.filter((f) => f.type === 'lowpass'), rms: +x.rms.toFixed(6), hfRatio: +x.hf.toFixed(4) });
      d.t = 0; out.oneShot = {};
      out.oneShot.sameRoom = pack(await run(clearLis, 'shot'));
      out.oneShot.closedDoor = pack(await run(lis, 'shot'));
      d.t = 1; out.oneShot.openDoor = pack(await run(lis, 'shot'));
      console.log('OCC oneShots done');
      // slab: a listener one storey up above the source
      d.t = 0; out.estimateSlab = occlusionFor(w, { x: src.x, y: 4.9, z: src.z }, src);
      // facade: listener on the courtyard side
      out.estimateFacade = occlusionFor(w, { x: -30, y: 1.6, z: 30 }, src);
      // 3. a loop (dishwasher) heard through the closed door, then the door opens: the filter eases open
      d.t = 0;
      const off = new OfflineAudioContext(1, RATE * 3, RATE), AC = window.AudioContext, cb = off.createBiquadFilter.bind(off), calls = [], lows = [];
      off.createBiquadFilter = () => { const f = cb(); lows.push(f); const orig = f.frequency.setTargetAtTime.bind(f.frequency); f.frequency.setTargetAtTime = (v, t, k) => { calls.push({ v, t: +t.toFixed(2) }); return orig(v, t, k); }; return f; };
      window.AudioContext = function () { return off; };
      try {
        const a = await import(`/src/audio.js?occ=loop`); a.initAudio(); a.setAcousticWorld(w); a.updateListener({ position: lis, rotation: { y: 0 } });
        const h = a.sfx.dishwasher(src);
        const closedCut = calls.at(-1)?.v ?? null;
        out.loop = { closedCutoffHz: closedCut, filtersAtStart: lows.length };
        const p = off.suspend(0.6).then(() => { d.t = 1; a.updateOcclusion(); off.resume(); });
        await off.startRendering(); await p;
        out.loop.cutoffAfterDoorOpened = calls.at(-1)?.v ?? null;
        h.stop();
      } finally { window.AudioContext = AC; }
      d.t = 0;
      return out;
    });
    result.measure = r; console.log(JSON.stringify(r, null, 1));
    check(!r.error, 'a real interior door with two different rooms was found');
    check(r.estimateSameRoom === null && r.oneShot.sameRoom.lowpassFilters.length === 0, 'same room: no estimate and NO low-pass filter in the real graph');
    check(r.oneShot.closedDoor.lowpassFilters.length === 1 && r.oneShot.closedDoor.lowpassFilters[0].hz === r.estimateClosed.hz, 'closed door: exactly one low-pass at the estimate cut-off');
    check(r.oneShot.openDoor.lowpassFilters.length === 1 && r.oneShot.openDoor.lowpassFilters[0].hz > r.oneShot.closedDoor.lowpassFilters[0].hz * 2, 'open door: much higher cut-off than closed');
    check(r.oneShot.closedDoor.rms < r.oneShot.openDoor.rms && r.oneShot.openDoor.rms < r.oneShot.sameRoom.rms, 'rendered level: same room > open door > closed door');
    check(r.oneShot.closedDoor.hfRatio < r.oneShot.sameRoom.hfRatio, 'rendered spectrum: closed door is duller than same room');
    check(r.estimateSlab?.parts.includes('floor') && r.estimateFacade?.parts.length > 0, 'slab and facade give an estimate');
    check(r.loop.cutoffAfterDoorOpened > r.loop.closedCutoffHz * 2, 'loop: cut-off eases up after the door opens');
    check(errors.length === 0, 'zero browser errors: ' + errors.join(' | '));
    fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
    console.log(`${checks.length} checks passed`);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
