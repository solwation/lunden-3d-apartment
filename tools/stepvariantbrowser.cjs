// #2193: the footstep variants in the real Web Audio graph (OfflineAudioContext standing in for AudioContext; the game's own src/audio.js)
// plus the real controller: snow / autumn walking emit the picked profile, a stairwell tread classifies as 'stair'.
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/stepvariantbrowser.cjs http://localhost:8438 OUTDIR
const assert = require('node:assert/strict'), fs = require('node:fs'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8438', out = process.argv[3] || '/tmp/stepvariants';
const KEYS = ['wood', 'hard', 'grass', 'gravel', 'snow', 'snowCold', 'wet', 'stair', 'leaves'];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(['--autoplay-policy=no-user-gesture-required']), errors = [], checks = [];
  const check = (v, n) => { assert.ok(v, n); checks.push(n); console.log('PASS', n); };
  try {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 420 } }), page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '// audio component phase' }));
    await page.goto(base);
    const rows = await page.evaluate(async (KEYS) => {
      const rows = []; let n = 0;
      const F = (await import('/src/config.js')).FOOTSTEPS;
      const render = async (key, seed0, grainOff) => {
        const saved = F.profiles[key].grain; if (grainOff) F.profiles[key].grain = 0;
        const offline = new OfflineAudioContext(2, 24000, 48000), AC = window.AudioContext, rnd = Math.random; let seed = seed0;
        const counts = { osc: 0, src: 0, gain: 0, biquad: 0 };
        for (const [m, k] of [['createOscillator', 'osc'], ['createBufferSource', 'src'], ['createGain', 'gain'], ['createBiquadFilter', 'biquad']]) { const f = offline[m].bind(offline); offline[m] = () => { counts[k]++; return f(); }; }
        try {
          Math.random = () => ((seed = seed * 16807 % 2147483647) / 2147483647); window.AudioContext = function () { return offline; };
          const A = await import(`/src/audio.js?v=${++n}`); A.initAudio();
          const { master } = A.audioParts(), high = offline.createBiquadFilter(), band = offline.createBiquadFilter(), merger = offline.createChannelMerger(2);
          high.type = 'highpass'; high.frequency.value = 1800; band.type = 'bandpass'; band.frequency.value = 2400; band.Q.value = 4;
          master.disconnect(); master.connect(merger, 0, 0); master.connect(high).connect(merger, 0, 1); merger.connect(offline.destination);
          for (const k of Object.keys(counts)) counts[k] = 0;
          A.sfx.step(key); const built = { ...counts };
          const r = await offline.startRendering(), d = r.getChannelData(0), h = r.getChannelData(1);
          const e = (x) => x.reduce((a, v) => a + v * v, 0); let zc = 0, last = 0, tail = 0;
          for (let i = 0; i < d.length; i++) { if (d[i] * last < 0) zc++; if (d[i]) last = d[i]; if (Math.abs(d[i]) > 1e-3) tail = i; }
          // crackle measure: on the high-passed channel, the std (dB) of the 3 ms window level around its own quadratic decay trend over
          // 20-90 ms: a smooth decaying step stays near its trend, a crackling one wobbles around it.
          const w = 144, lv = []; for (let i = 960; i + w < 4320; i += w) lv.push(10 * Math.log10(e(h.subarray(i, i + w)) / w + 1e-14));
          const nn = lv.length, X = lv.map((_, i) => i / nn), fit = (() => { // least squares y = a + b x + c x^2
            const m = [[0,0,0],[0,0,0],[0,0,0]], v = [0,0,0]; X.forEach((x, i) => { const f = [1, x, x * x]; for (let r = 0; r < 3; r++) { v[r] += f[r] * lv[i]; for (let c = 0; c < 3; c++) m[r][c] += f[r] * f[c]; } });
            for (let r = 0; r < 3; r++) { for (let q = r + 1; q < 3; q++) { const k = m[q][r] / m[r][r]; for (let c = r; c < 3; c++) m[q][c] -= k * m[r][c]; v[q] -= k * v[r]; } }
            const co = [0,0,0]; for (let r = 2; r >= 0; r--) { let t = v[r]; for (let c = r + 1; c < 3; c++) t -= m[r][c] * co[c]; co[r] = t / m[r][r]; } return co; })();
          const flick = Math.sqrt(lv.reduce((a, y, i) => a + (y - (fit[0] + fit[1] * X[i] + fit[2] * X[i] * X[i])) ** 2, 0) / nn);
          rows.push({ key, rms: Math.sqrt(e(d) / d.length), peak: Math.max(...d.map(Math.abs)), highShare: e(h) / e(d), zcrPerSec: zc * 2, activeMs: Math.round(tail / 48), flicker: +flick.toFixed(2), nodes: built });
          return rows.pop();
        } finally { window.AudioContext = AC; Math.random = rnd; F.profiles[key].grain = saved; }
      };
      const out = [];
      for (const key of KEYS) {
        const row = await render(key, 147, false); row.flickerAvg = 0; out.push(row);
        if (F.profiles[key].grain) { // A/B over 8 seeds: the same profile with its grain switched off
          let on = 0, off = 0; for (let s = 1; s <= 8; s++) { on += (await render(key, s * 977, false)).flicker; off += (await render(key, s * 977, true)).flicker; }
          row.crackleOn = +(on / 8).toFixed(2); row.crackleOff = +(off / 8).toFixed(2);
        }
      }
      return out;
    }, KEYS);
    console.log('METRICS', JSON.stringify(rows)); console.log('FLICKER', rows.map((r) => r.key + '=' + r.flicker + '/' + r.crackleOn + '/' + r.crackleOff).join(' '));
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    check(rows.every((r) => r.rms > 0.001 && r.peak < 1), 'every variant is audible and does not clip');
    check(rows.every((r) => r.nodes.src === 1 && r.nodes.osc <= 3 && r.nodes.gain <= 6), 'every variant stays within 1 noise source, <=3 oscillators, <=6 gains (no heavy per-source graph)');
    check(['snow', 'leaves'].every((k) => by[k].crackleOn > by[k].crackleOff * 1.25), 'snow and leaves crackle: switching the grain on raises (snow, leaves; the snowCold >1.8 kHz band is dominated by its squeak sine, so it is not meaningful there) the envelope wobble >=25 % (mean of 8 seeds, same profile with grain 0)');
    check(by.snowCold.highShare > by.snow.highShare, 'cold snow has extra high-frequency squeak energy');
    check(by.wet.highShare > by.hard.highShare && by.wet.zcrPerSec > by.hard.zcrPerSec, 'wet paving is brighter / splashier than dry paving');
    check(by.stair.nodes.osc === by.snowCold.nodes.osc && by.stair.rms > by.grass.rms, 'stair tread has its extra ring and more body than grass');
    check(new Set(rows.map((r) => r.zcrPerSec + ':' + r.highShare.toFixed(4))).size === KEYS.length, 'all nine profiles are distinct');
    await page.unroute('**/src/bootstrap.js');

    // real app: snow + cold -> controller steps 'snowCold'; autumn -> 'leaves'; stair tread classification; wet hard via a forced state
    const walk = async (query, x, z) => {
      const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
      await p.addInitScript(() => { localStorage.setItem('lunden.name', 'Stegtest'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
      await p.goto(`${base}/?test=lazy&cloud=&mp=0&at=3,10.8,0&mess=0&${query}`);
      await p.waitForFunction(() => window.__app?.renderer && window.__app.loadingEl.hidden, null, { timeout: 240000 });
      const res = await p.evaluate(async ({ x, z }) => {
        const A = await import('/src/audio.js'); A.initAudio(); window.ev = []; const o = A.sfx.step; A.sfx.step = function (s) { ev.push(s); return o.call(this, s); };
        __app.touch.enabled = true; __app.showOverlay(false); __app.player.keys.clear(); __app.player.spawn(x, z, 0);
        return { snow: __app.snowState.cover, driven: __app.snowState.driven, temp: __app.weather.temp, month: __app.day.month };
      }, { x, z });
      await p.waitForTimeout(200); await p.evaluate(() => __app.player.keys.add('KeyW'));
      await p.waitForFunction(() => window.ev.length > 0, null, { timeout: 8000, polling: 100 }).catch(() => {});
      const ev = await p.evaluate(() => { __app.player.keys.clear(); return ev; }); await p.close(); return { ...res, ev };
    };
    const snow = await walk('snow=1&temp=-8&month=1', -9, 23); console.log('SNOW', JSON.stringify(snow));
    check(snow.ev.length > 0 && snow.ev.every((s) => s === 'snowCold'), 'real controller on snowy grass at -8 C steps with snowCold');
    const warm = await walk('snow=1&temp=-1&month=1', -9, 23); console.log('SNOWWARM', JSON.stringify(warm));
    check(warm.ev.length > 0 && warm.ev.every((s) => s === 'snow'), 'real controller on snowy grass at -1 C steps with snow');
    const leaf = await walk('snow=0&month=10&weather=clear', -9, 23); console.log('LEAF', JSON.stringify(leaf));
    check(leaf.ev.length > 0 && leaf.ev.every((s) => s === 'leaves'), 'real controller on October grass steps with leaves');
    const summer = await walk('snow=0&month=7&weather=clear', -9, 23); console.log('SUMMER', JSON.stringify(summer));
    check(summer.ev.length > 0 && summer.ev.every((s) => s === 'grass'), 'summer grass is unchanged (grass)');
    // stairwell
    const pg = await ctx.newPage(); pg.on('pageerror', (e) => errors.push(e.message));
    await pg.addInitScript(() => { localStorage.setItem('lunden.name', 'Stegtest'); sessionStorage.setItem('lunden.nameSkipped', '1'); });
    await pg.goto(`${base}/?test=lazy&cloud=&mp=0&at=3,10.8,0&mess=0`);
    await pg.waitForFunction(() => window.__app?.renderer && window.__app.loadingEl.hidden, null, { timeout: 240000 });
    const stairs = await pg.evaluate(async () => {
      const { stepInfo } = await import('/src/stepsurface.js'), { pickStep } = await import('/src/footsteps.js'), w = __app.world, found = { stair: null, landing: null }, tally = {};
      for (let x = -40; x < 120; x += 0.25) for (let z = -60; z < 80; z += 0.25) if (w.core.covers(x, z)) for (const y of w.core.heights(x, z)) {
        if (!w.core.contains(x, z, y)) continue; const i = stepInfo(w, { x, y, z }), k = pickStep(i, {});
        tally[k] = (tally[k] ?? 0) + 1; if (k === 'stair' && !found.stair) found.stair = { x, y, z }; if (k === 'hard' && i.where === 'core' && !found.landing) found.landing = { x, y, z };
      }
      return { found, tally };
    });
    console.log('STAIRS', JSON.stringify(stairs));
    check(stairs.found.stair && stairs.found.landing && stairs.tally.stair > 20, 'stairwell samples classify both stair treads and landings');
    check(errors.length === 0, 'zero browser errors');
    fs.writeFileSync(`${out}/result.json`, JSON.stringify({ checks, rows, snow, warm, leaf, summer, stairs, errors }, null, 2));
    console.log('ALL PASSED');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
