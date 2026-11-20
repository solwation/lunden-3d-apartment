// #2190: the ambient bed in the real game audio graph (headless Chromium, OfflineAudioContext standing in for AudioContext; the game's
// own src/audio.js + src/ambientbed.js + the real riverPath): TWO sources built once, params update; renders RMS / spectral centroid
// near and far from the river (outdoors / indoors) and the city hum by day, rush hour and night. Usage:
//   PLAYWRIGHT_MODULE=… tools/browsertest.sh node tools/ambientbedbrowser.cjs http://localhost:8390 OUTDIR
const assert = require('node:assert/strict'), fs = require('node:fs');
const kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8390', out = process.argv[3] || '/tmp/ambientbed';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await kit.launch(['--autoplay-policy=no-user-gesture-required']), errors = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 400, height: 300 } })).newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/src/bootstrap.js', (r) => r.fulfill({ contentType: 'text/javascript', body: '// audio component phase' }));
    await page.goto(base);
    const res = await page.evaluate(async () => {
      const B = await import('/src/ambientbed.js'), { riverPath } = await import('/src/riverbridge.js');
      // listener spots: ON the river (first path point), then perpendicular-ish offsets; also the apartment start for the real distance
      const [rx, rz] = riverPath[Math.floor(riverPath.length / 2)];
      const spots = [['at river', rx, rz], ['25 m from river', rx, rz + 25], ['50 m from river', rx, rz + 50], ['far (150 m)', rx, rz + 150]];
      const rows = []; let n = 0;
      const run = async (label, river, city) => {
        const offline = new OfflineAudioContext(1, 48000, 48000), AC = window.AudioContext, rnd = Math.random; let seed = 11;
        const counts = { src: 0, filters: 0 };
        const cs = offline.createBufferSource.bind(offline), cf = offline.createBiquadFilter.bind(offline);
        offline.createBufferSource = () => { counts.src++; return cs(); }; offline.createBiquadFilter = () => { counts.filters++; return cf(); };
        try {
          Math.random = () => ((seed = seed * 16807 % 2147483647) / 2147483647); window.AudioContext = function () { return offline; };
          const A = await import(`/src/audio.js?a=${++n}`); A.initAudio();
          const before = { ...counts }, bed = A.sfx.ambientBed(), built = { ...counts };
          bed.set({ river, city }, 0.001); bed.set({ river, city }, 0.001);
          const d = (await offline.startRendering()).getChannelData(0).slice(24000);
          let e = 0, de = 0; for (let i = 0; i < d.length; i++) { e += d[i] * d[i]; if (i) de += (d[i] - d[i - 1]) ** 2; }
          return { label, rms: Math.sqrt(e / d.length), centroid: Math.sqrt(de / e) * 48000 / (2 * Math.PI), srcBuilt: built.src - before.src, filtersBuilt: built.filters - before.filters, extra: counts.src - built.src + counts.filters - built.filters, river, city };
        } finally { window.AudioContext = AC; Math.random = rnd; }
      };
      const none = { gain: 0, hz: 500, q: 0.6 }, noCity = { gain: 0, hz: 200 };
      for (const indoors of [false, true]) for (const [name, x, z] of spots) {
        const dist = B.distToPolyline(riverPath, x, z), r = await run(`river: ${name}${indoors ? ' (indoors)' : ''}`, B.riverBabbleParams({ dist, indoors }), noCity);
        rows.push({ kind: 'river', where: name, indoors, dist, ...r });
      }
      for (const [name, hour] of [['03:00 night', 3], ['12:00 midday', 12], ['08:00 rush', 8], ['17:00 rush', 17], ['22:00 evening', 22]]) for (const indoors of [false, true]) {
        const r = await run(`city: ${name}${indoors ? ' (indoors)' : ''}`, none, B.cityHumParams({ hour, indoors }));
        rows.push({ kind: 'city', when: name, hour, indoors, ...r });
      }
      return { rows, riverPoints: riverPath.length };
    });
    fs.writeFileSync(`${out}/metrics.json`, JSON.stringify(res, null, 1));
    for (const r of res.rows) { assert.equal(r.srcBuilt, 2); assert.equal(r.filtersBuilt, 2); assert.equal(r.extra, 0); }
    const rv = (w, i) => res.rows.find((r) => r.kind === 'river' && r.where === w && r.indoors === i).rms, ct = (w, i) => res.rows.find((r) => r.kind === 'city' && r.when === w && r.indoors === i).rms;
    assert.ok(rv('at river', false) > rv('25 m from river', false) && rv('25 m from river', false) > rv('50 m from river', false) && rv('far (150 m)', false) < 1e-6, 'babble fades with distance');
    assert.ok(rv('at river', true) < rv('at river', false) * 0.4, 'indoors quieter (river)');
    assert.ok(ct('12:00 midday', false) > 3 * ct('03:00 night', false) && ct('08:00 rush', false) > ct('12:00 midday', false), 'city: day > night, rush > midday');
    assert.ok(ct('08:00 rush', true) < ct('08:00 rush', false) * 0.5, 'indoors quieter (city)');
    assert.deepEqual(errors, []);
    for (const r of res.rows) console.log(r.label.padEnd(36), 'rms', r.rms.toFixed(4), 'centroid~', Math.round(r.centroid), 'Hz');
    console.log('PASS: graph built once (2 sources, 2 filters), params update, no errors');
  } finally { await browser.close(); }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
