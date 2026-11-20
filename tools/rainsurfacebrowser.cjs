// #2200: the rain's surround mix in the real game audio graph (headless Chromium, OfflineAudioContext standing in for AudioContext; the game's own
// src/audio.js + src/rainsurface.js + the real riverPath): sfx.rain() is built ONCE (1 source), `set(gain, cutoff, mix)` per surround; renders RMS and
// spectral centroid per surround (hard ground, grass, under roof, indoors, metal, trees, river) and checks the indoor model is not doubled. Usage:
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/rainsurfacebrowser.cjs http://localhost:8502 OUTDIR
const assert = require('node:assert/strict'), fs = require('node:fs');
const kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8502', out = process.argv[3] || '/tmp/rainsurface';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(['--autoplay-policy=no-user-gesture-required']), errors = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 400, height: 300 } })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '// audio component phase' }));
    await page.goto(base);
    const res = await page.evaluate(async () => {
      const R = await import('/src/rainsurface.js'), { riverPath } = await import('/src/riverbridge.js'), B = await import('/src/ambientbed.js'), { WEATHER } = await import('/src/config.js');
      const [rx, rz] = riverPath[Math.floor(riverPath.length / 2)];
      const gain = WEATHER.sound, OUT = 6500, IN = 900, rows = []; let n = 0;
      const run = async (label, mix, indoors, bare) => {
        const offline = new OfflineAudioContext(1, 48000, 48000), AC = window.AudioContext, rnd = Math.random; let seed = 5;
        const counts = { src: 0, filters: 0, gains: 0 };
        const cs = offline.createBufferSource.bind(offline), cf = offline.createBiquadFilter.bind(offline), cg = offline.createGain.bind(offline);
        offline.createBufferSource = () => { counts.src++; return cs(); }; offline.createBiquadFilter = () => { counts.filters++; return cf(); }; offline.createGain = () => { counts.gains++; return cg(); };
        try {
          Math.random = () => ((seed = seed * 16807 % 2147483647) / 2147483647); window.AudioContext = function () { return offline; };
          const A = await import(`/src/audio.js?a=${++n}`); A.initAudio();
          const b0 = { ...counts }, rain = A.sfx.rain(), built = { ...counts };
          const g = gain * (indoors ? 0.3 : 1), c = indoors ? IN : OUT;
          if (bare) rain.set(g, c); else { rain.set(g, c, mix); rain.set(g, c, mix); }
          const d = (await offline.startRendering()).getChannelData(0).slice(24000);
          let e = 0, de = 0; for (let i = 0; i < d.length; i++) { e += d[i] * d[i]; if (i) de += (d[i] - d[i - 1]) ** 2; }
          return { label, rms: Math.sqrt(e / d.length), centroid: Math.sqrt(de / e) * 48000 / (2 * Math.PI), src: built.src - b0.src, filters: built.filters - b0.filters, gains: built.gains - b0.gains, extra: counts.src + counts.filters + counts.gains - built.src - built.filters - built.gains, mix };
        } finally { window.AudioContext = AC; Math.random = rnd; }
      };
      const mk = (o) => R.rainSurfaceMix({ riverDist: 500, ...o });
      const sc = [
        ['legacy: plain hiss (no mix)', null, false, true], ['hard ground (paving)', mk({}), false],
        ['soft hiss over grass', mk({ grass: 1 }), false], ['under a roof / canopy', mk({ underRoof: true }), false],
        ['metal ping (car roof)', mk({ metal: 1 }), false], ['leafy hiss under trees (summer)', mk({ trees: 1, leaves: 1, grass: 1 }), false],
        ['bare trees (winter)', mk({ trees: 1, leaves: 0, grass: 1 }), false],
        ['splashes at the river', mk({ riverDist: B.distToPolyline(riverPath, rx, rz), grass: 1 }), false],
        ['river, 40 m away', mk({ riverDist: 40, grass: 1 }), false],
        ['indoors (top floor ceiling)', mk({ indoors: true }), true], ['indoors, hard-ground mix (indoor model only once)', mk({}), true],
      ];
      for (const [label, mix, indoors, bare] of sc) rows.push(await run(label, mix, indoors, bare));
      return { rows, gain };
    });
    fs.writeFileSync(`${out}/metrics.json`, JSON.stringify(res, null, 1));
    for (const r of res.rows) { assert.equal(r.src, 1, r.label); assert.equal(r.extra, 0, r.label); }
    const f = (s) => res.rows.find((r) => r.label.startsWith(s)), hard = f('hard ground'), legacy = f('legacy');
    assert.ok(Math.abs(hard.rms / legacy.rms - 1) < 0.01, `no-surround level equals the plain hiss: ${hard.rms} vs ${legacy.rms}`);
    assert.ok(f('soft hiss').centroid < hard.centroid * 0.95, 'grass softer');
    assert.ok(f("under a roof").centroid < hard.centroid * 0.9, 'roof drum is lower');
    assert.ok(f('metal').centroid < hard.centroid && Math.abs(f('metal').rms / hard.rms - 1) > 0.03, 'metal changes the spectrum');
    assert.ok(f('leafy').rms !== hard.rms && f('leafy').centroid !== f('soft hiss').centroid, 'leaves change the spectrum over grass');
    assert.ok(f('bare trees').centroid === f('soft hiss').centroid, 'bare trees add no leafy hiss');
    assert.ok(f('splashes').centroid < f('soft hiss').centroid * 0.99 && f('splashes').centroid < f('river, 40').centroid, 'river splashes by distance');
    assert.ok(f('indoors (top').rms < 0.4 * hard.rms, 'indoors much quieter');
    assert.ok(f('indoors, hard').rms < 0.4 * hard.rms && f('indoors (top').rms < 3 * f('indoors, hard').rms, 'indoors: one model');
    assert.deepEqual(errors, []);
    for (const r of res.rows) console.log(r.label.padEnd(52), 'rms', r.rms.toExponential(3), 'centroid~', Math.round(r.centroid), 'Hz', `nodes ${r.src}src/${r.filters}flt/${r.gains}gain`);
    console.log('PASS: rain graph built once (1 source), layers re-mixed per surround, indoor model unchanged');
  } finally { await browser.close(); }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
