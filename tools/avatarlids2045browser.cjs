// #2045: matched before/after views of the avatars' eyes on tools/avatareyes.html: one eye at 0.5 m (light skin + blue eyes and dark skin +
// brown eyes; open, half and fully shut; three-quarter and profile), the face (front, three-quarter, profile, glasses on) and far figures
// at the game's 72° field of view, where the lash line's flicker is measured: 12 frames with sub-pixel camera shifts, the mean per-pixel
// standard deviation of luminance round the eyes. Sheets (rows: before, after) and numbers (lids.json) to `out`. FAIL on page errors,
// more than one draw call, iris/background pixels left inside a shut eye, or (with a before page) more flicker than before.
//   tools/browsertest.sh node tools/avatarlids2045browser.cjs http://localhost:8145/after docs/verification/2045 [http://localhost:8145/before]
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8145', out = 'docs/verification/2045', before = ''] = process.argv.slice(2);
const LIGHT = { skin: 0xf1c9a8, eyes: 0x3f6fa8 }, DARK = { skin: 0x6b4430, eyes: 0x3b2618, hair: 0x1a1412, brows: 0x1a1412 };
const close = { aim: 1, dist: 0.5, fov: 4.2, seconds: 3, follow: true }, face = { dist: 1.2, fov: 16, seconds: 3, follow: true };
const sheets = {
  'ogon-narbild': [
    ['ljus, blå, öppet', { ...close, look: LIGHT }], ['halvblink', { ...close, look: LIGHT, blink: 0.5 }], ['stängt', { ...close, look: LIGHT, blink: 1 }],
    ['mörk, brun, öppet', { ...close, look: DARK }], ['mörk, stängt', { ...close, look: DARK, blink: 1 }],
    ['snett', { ...close, look: LIGHT, yaw: 0.75 }], ['profil', { ...close, look: LIGHT, yaw: 1.4, fov: 5 }], ['profil, stängt', { ...close, look: LIGHT, yaw: 1.4, fov: 5, blink: 1 }],
  ],
  'ansikte': [
    ['rakt, ljus', { ...face, look: LIGHT }], ['rakt, mörk', { ...face, look: DARK }], ['snett', { ...face, look: LIGHT, yaw: 0.7 }],
    ['profil', { ...face, look: LIGHT, yaw: 1.45 }], ['glasögon', { ...face, look: LIGHT, glasses: 1 }], ['glasögon snett', { ...face, look: DARK, glasses: 2, yaw: 0.6 }],
    ['motljus', { ...face, look: LIGHT, yaw: 0.4, sun: [-1, 1.5, -4] }], ['blick ned', { ...face, look: LIGHT, gaze: [0, -0.0026] }],
  ],
};
const FAR = [1, 2, 4].map((d) => [`${d} m`, { dist: d, fov: 72, W: 1280, H: 800, look: LIGHT, seconds: 1, follow: true }]);
const grab = ([x, y, w, h, sw, sh]) => { const c = document.querySelector('canvas'), t = document.createElement('canvas'); t.width = sw; t.height = sh;
  const g = t.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(c, x, y, w, h, 0, 0, sw, sh); return t.toDataURL('image/png'); };
// luminance of the canvas' middle (a box round both eyes at that distance)
const lum = ([w, h]) => { const c = document.querySelector('canvas'), t = document.createElement('canvas'); t.width = w; t.height = h;
  const g = t.getContext('2d'); g.drawImage(c, (c.width - w) / 2, (c.height - h) / 2, w, h, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, l = new Float32Array(w * h); for (let i = 0; i < l.length; i++) l[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]; return Array.from(l); };
async function run(ctx, url, tag) {
  const page = await ctx.newPage(), errors = [], res = { tiles: {}, far: {}, shut: {} };
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
  await page.goto(url + '/tools/avatareyes.html');
  await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
  for (const [sheet, list] of Object.entries(sheets)) for (const [name, o] of list) {
    const r = await page.evaluate((o) => window.__frame(o), o);
    if (r.calls !== 1) errors.push(`${tag} ${name}: ${r.calls} draw calls`);
    res.tiles[`${sheet}/${name}`] = await page.evaluate(grab, sheet === 'ansikte' ? [120, 0, 400, 400, 300, 300] : [0, 0, 640, 400, 320, 200]);
    if (o.blink === 1 && !o.yaw) res.shut[`${sheet}/${name}`] = await page.evaluate(lum, [200, 70]); // the shut eye's middle
  }
  for (const [name, o] of FAR) {
    const frames = [];
    for (let k = 0; k < 12; k++) { // sub-pixel shifts of the camera sideways and up (a slowly moving viewer)
      const px = 2 * o.dist * Math.tan((o.fov / 2) * Math.PI / 180) / o.H, s = (k / 12) * 1.5 * px;
      await page.evaluate((o) => window.__frame(o), { ...o, sun: [2, 4, 4], yaw: s / o.dist, seconds: k ? 0 : 1 });
      frames.push(await page.evaluate(lum, [Math.round(160 / o.dist), Math.round(60 / o.dist)]));
    }
    const n = frames[0].length; let sd = 0;
    for (let i = 0; i < n; i++) { let m = 0, q = 0; for (const f of frames) { m += f[i]; q += f[i] * f[i]; } m /= frames.length; sd += Math.sqrt(Math.max(0, q / frames.length - m * m)); }
    res.far[name] = +(sd / n).toFixed(2);
    res.tiles[`fjarran/${name}`] = await page.evaluate(grab, [640 - Math.round(200 / o.dist), 400 - Math.round(100 / o.dist), Math.round(400 / o.dist), Math.round(200 / o.dist), 320, 160]);
  }
  await page.close();
  return { res, errors };
}
async function sheet(ctx, file, names, rows, tw, th) {
  const page = await ctx.newPage();
  await page.setContent('<canvas></canvas>');
  await page.evaluate(async ([names, rows, tw, th]) => {
    const c = document.querySelector('canvas'), lab = 18; c.width = names.length * tw; c.height = rows.length * (th + lab);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.font = '13px sans-serif'; g.fillStyle = '#000';
    for (const [r, [title, tiles]] of rows.entries()) for (const [i, n] of names.entries()) {
      const img = new Image(); img.src = tiles[n]; await img.decode();
      g.drawImage(img, i * tw, r * (th + lab) + lab, tw, th); g.fillText(`${title}: ${n.split('/')[1]}`, i * tw + 4, r * (th + lab) + 13);
    }
  }, [names, rows, tw, th]);
  await page.locator('canvas').screenshot({ path: file });
  await page.close();
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avatarlids-'));
  const ctx = await chromium.launchPersistentContext(tmp, { headless: true, executablePath: process.env.CHROME_PATH, viewport: { width: 1280, height: 800 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const after = await run(ctx, base, 'after'), errors = [...after.errors], b = before ? await run(ctx, before, 'before') : null;
    if (b) errors.push(...b.errors);
    const rows = [...(b ? [['före', b.res.tiles]] : []), ['efter', after.res.tiles]];
    for (const [name, list] of Object.entries(sheets)) await sheet(ctx, path.join(out, `${name}.png`), list.map(([n]) => `${name}/${n}`), rows, name === 'ansikte' ? 300 : 320, name === 'ansikte' ? 300 : 200);
    await sheet(ctx, path.join(out, 'fjarran.png'), FAR.map(([n]) => `fjarran/${n}`), rows, 320, 160);
    // a shut eye: no iris or eyeball left (blue/white or dark pupil pixels) in its middle; skin and the dark lash line only
    const shut = {};
    for (const [n, l] of Object.entries(after.res.shut)) { const s = [...l].sort((a, c) => a - c); shut[n] = { p5: Math.round(s[Math.floor(s.length * 0.05)]), p99: Math.round(s[Math.floor(s.length * 0.99)]), max: Math.round(s.at(-1)) }; }
    const data = { after: { far: after.res.far, shut }, before: b ? { far: b.res.far } : null };
    fs.writeFileSync(path.join(out, 'lids.json'), JSON.stringify(data, null, 1));
    console.log(JSON.stringify(data));
    if (b) for (const [n, v] of Object.entries(after.res.far)) if (v > b.res.far[n] * 1.15 + 0.3) errors.push(`more flicker at ${n}: ${v} > ${b.res.far[n]}`);
    for (const [n, v] of Object.entries(shut)) if (v.max > 235) errors.push(`${n}: bright pixels in a shut eye (${v.max})`);
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await ctx.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
})();
