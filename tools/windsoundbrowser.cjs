// #2177: the wind sound in a real Web Audio graph (headless Chromium, OfflineAudioContext standing in for AudioContext; the game's own
// src/audio.js): the bed is built ONCE (one buffer source, two filters), its parameters update, render levels / spectral centroid per
// condition, and the open-window wind follows setWindPower. No errors. Usage:
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/windsoundbrowser.cjs http://localhost:8252 OUTDIR
const assert = require('node:assert/strict'), fs = require('node:fs');
const kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8252', out = process.argv[3] || '/tmp/windsound';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(['--autoplay-policy=no-user-gesture-required']), errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 300 } }), page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '// audio component phase' }));
    await page.goto(base);
    const res = await page.evaluate(async () => {
      const W = await import('/src/windsound.js');
      const conds = [['calm', 0.5, 0], ['breeze', 4, 0.5], ['gusty', 9, 0.8], ['storm', 18, 1]], rows = [];
      let n = 0;
      for (const [leaves, near, indoors] of [[1, 1, false], [0, 1, false], [1, 1, true]]) for (const [name, speed, gust] of conds) {
        const offline = new OfflineAudioContext(1, 48000, 48000), AC = window.AudioContext, rnd = Math.random; let seed = 7;
        const counts = { src: 0, filters: 0 };
        const cs = offline.createBufferSource.bind(offline), cf = offline.createBiquadFilter.bind(offline);
        offline.createBufferSource = () => { counts.src++; return cs(); }; offline.createBiquadFilter = () => { counts.filters++; return cf(); };
        try {
          Math.random = () => ((seed = seed * 16807 % 2147483647) / 2147483647); window.AudioContext = function () { return offline; };
          const A = await import(`/src/audio.js?w=${++n}`); A.initAudio();
          const before = { ...counts }, bed = A.sfx.windBed(), built = { ...counts };
          const p = W.windSoundParams({ speed, gust, leaves, near, indoors });
          bed.set(p, 0.001); bed.set(p, 0.001); // updating again builds nothing
          const rendered = await offline.startRendering(), d = rendered.getChannelData(0).slice(24000);
          let e = 0, de = 0; for (let i = 0; i < d.length; i++) { e += d[i] * d[i]; if (i) de += (d[i] - d[i - 1]) ** 2; }
          const rms = Math.sqrt(e / d.length), centroid = Math.sqrt(de / e) * 48000 / (2 * Math.PI); // ~ spectral centroid via the first difference
          rows.push({ season: leaves ? 'summer' : 'winter', where: indoors ? 'indoor' : 'outdoor', cond: name, speed, rms, centroid, srcBuilt: built.src - before.src, filtersBuilt: built.filters - before.filters, extraAfterSet: counts.src - built.src + counts.filters - built.filters, p });
        } finally { window.AudioContext = AC; Math.random = rnd; }
      }
      // the open window follows setWindPower
      const offline = new OfflineAudioContext(1, 48000, 48000), AC = window.AudioContext; window.AudioContext = function () { return offline; };
      const A = await import('/src/audio.js?win'); A.initAudio();
      const win = A.sfx.wind(null); A.setWindPower(0.9);
      const rendered = await offline.startRendering(); window.AudioContext = AC;
      return { rows, windowOk: !!win, windowRms: Math.sqrt(rendered.getChannelData(0).reduce((a, v) => a + v * v, 0) / 48000) };
    });
    fs.writeFileSync(`${out}/metrics.json`, JSON.stringify(res, null, 1));
    for (const r of res.rows) { assert.equal(r.srcBuilt, 1); assert.equal(r.filtersBuilt, 2); assert.equal(r.extraAfterSet, 0); }
    const get = (s, w, c) => res.rows.find((r) => r.season === s && r.where === w && r.cond === c);
    for (const s of ['summer', 'winter']) { assert.ok(get(s, 'outdoor', 'storm').rms > get(s, 'outdoor', 'breeze').rms && get(s, 'outdoor', 'breeze').rms > get(s, 'outdoor', 'calm').rms, `${s}: louder with the wind`); }
    for (const c of ['calm', 'breeze', 'gusty', 'storm']) assert.ok(get('summer', 'indoor', c).rms < get('summer', 'outdoor', c).rms * 0.6, `indoors quieter: ${c}`);
    assert.ok(res.windowOk && res.windowRms > 0.0005, 'open window sounds');
    assert.deepEqual(errors, []);
    for (const r of res.rows) console.log(r.season.padEnd(7), r.where.padEnd(8), r.cond.padEnd(7), 'rms', r.rms.toFixed(4), 'centroid~', Math.round(r.centroid), 'Hz');
    console.log('window rms', res.windowRms.toFixed(4), 'PASS: graph built once (1 source, 2 filters), params update, no errors');
  } finally { await browser.close(); }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
