// #2033: close-ups of the avatars' eyes on tools/avatareyes.html: the glint following the sun, the pupil in sun and in a dark room, a
// shut blink; with an optional BEFORE page (the same page on the previous revision) for comparison. Numbers to eyes.json; FAIL on errors,
// more than one draw call, a glint that does not move with the sun, a pupil no larger in the dark (also counted in pixels under the same
// light: the first sun-lit frame after the dark room against one a second later), or bright pixels left in a shut eye.
//   tools/browsertest.sh node tools/avatareyestest.cjs http://localhost:8233/after docs/verification/2033 [http://localhost:8233/before]
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base = 'http://localhost:8233', out = 'docs/verification/2033', before = ''] = process.argv.slice(2);
const frames = [
  ['01-sol-ljus-framifran-hoger', { preset: 'sun', sun: [2, 4, 4], seconds: 6 }],
  ['02-sol-ljus-fran-vanster', { preset: 'sun', sun: [-4, 2.5, 3] }],
  ['03-sol-lagt-framifran', { preset: 'sun', sun: [0.6, 0.9, 4] }],
  ['04-sol-blinkning-stangd', { preset: 'sun', sun: [2, 4, 4], blink: 1, seconds: 0.2 }],
  ['05-morkt-rum-ljusare-exponering', { preset: 'dark', sun: [2, 4, 4], seconds: 8, exposure: 3 }],
  ['06-morkt-rum-verklig-exponering', { preset: 'dark', sun: [2, 4, 4], seconds: 0.2 }],
  ['07-ut-i-solen-forsta-bilden', { preset: 'sun', sun: [2, 4, 4], seconds: 1 / 60 }],
  ['08-ut-i-solen-efter-en-sekund', { preset: 'sun', sun: [2, 4, 4], seconds: 1 }],
  ['09-ansikte-sol', { preset: 'sun', sun: [2, 4, 4], view: 'face', seconds: 6 }],
  ['10-ansikte-morkt-rum-ljusare-exponering', { preset: 'dark', sun: [2, 4, 4], view: 'face', seconds: 8, exposure: 3 }],
];
// The eyes' boxes from a reference frame (sun, eyes open): the bounding boxes of the whites (bright, unsaturated pixels) in each half of
// the canvas' middle, grown by a few pixels; then per box the brightest pixel (the glint), the dark pupil pixels and the bright ones.
const pixels = () => { const c = document.querySelector('canvas'), t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
  const x = t.getContext('2d'); x.drawImage(c, 0, 0); return x; };
const findEyes = (pixels) => {
  const x = eval(pixels)(), W = x.canvas.width, H = x.canvas.height, d = x.getImageData(0, 0, W, H).data, box = [[W, H, 0, 0], [W, H, 0, 0]];
  for (let y = Math.round(H * 0.2); y < H * 0.7; y++) for (let i = Math.round(W * 0.15); i < W * 0.85; i++) {
    const k = (y * W + i) * 4, mx = Math.max(d[k], d[k + 1], d[k + 2]), mn = Math.min(d[k], d[k + 1], d[k + 2]);
    if (mx > 170 && mx - mn < 40) { const b = box[i < W / 2 ? 0 : 1]; b[0] = Math.min(b[0], i); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], i); b[3] = Math.max(b[3], y); }
  }
  return box.map(([a, b, c, e]) => [a - 3, b - 3, c + 4, e + 4]);
};
const measure = ([pixels, boxes]) => {
  const x = eval(pixels)();
  return boxes.map(([x0, y0, x1, y1]) => {
    const d = x.getImageData(x0, y0, x1 - x0, y1 - y0).data, w = x1 - x0, lum = [];
    let best = -1, at = null;
    for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; lum.push(l); if (l > best) { best = l; at = [x0 + (i / 4) % w, y0 + Math.floor(i / 4 / w)]; } }
    const s = [...lum].sort((a, b) => a - b), p90 = s[Math.floor(s.length * 0.9)];
    return { glint: Math.round(best), glintAt: at, p90: Math.round(p90), pupilPx: lum.filter((l) => l < p90 * 0.3).length, brightPx: lum.filter((l) => l > 200).length };
  });
};
async function run(ctx, url, dir, list, tag) {
  const page = await ctx.newPage(), errors = [], data = {};
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
  await page.goto(url + '/tools/avatareyes.html');
  await page.waitForFunction(() => window.__ready, null, { timeout: 90000 });
  const boxes = {};
  for (const [name, opts] of list) {
    const view = opts.view ?? 'close';
    if (!boxes[view]) { await page.evaluate((o) => window.__frame(o), { ...opts, preset: 'sun', blink: 0, exposure: 1 }); boxes[view] = await page.evaluate(findEyes, pixels.toString()); }
    data[name] = await page.evaluate((o) => window.__frame(o), opts);
    data[name].eyes = await page.evaluate(measure, [pixels.toString(), boxes[view]]);
    data[name].boxes = boxes[view];
    if (data[name].calls !== 1) errors.push(`${tag} ${name}: ${data[name].calls} draw calls`);
    await page.locator('canvas').screenshot({ path: path.join(dir, `${name}.png`) });
    if (view === 'close') { // a 4× crop of the figure's right eye (the left one in the picture), no smoothing
      const url = await page.evaluate(([x0, y0, x1, y1]) => { const c = document.querySelector('canvas'), z = document.createElement('canvas'), w = x1 - x0 + 24, h = y1 - y0 + 16;
        z.width = w * 4; z.height = h * 4; const x = z.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, x0 - 12, y0 - 8, w, h, 0, 0, w * 4, h * 4); return z.toDataURL(); }, boxes[view][0]);
      fs.writeFileSync(path.join(dir, `${name}-zoom.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
  }
  await page.close();
  return { data, errors };
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'avatareyes-'));
  const ctx = await chromium.launchPersistentContext(tmp, { headless: true, executablePath: process.env.CHROME_PATH, viewport: { width: 640, height: 400 }, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const after = await run(ctx, base, out, frames, 'after'), errors = [...after.errors], d = after.data, res = { after: d };
    if (before) {
      const dir = path.join(out, 'before'); fs.mkdirSync(dir, { recursive: true });
      const b = await run(ctx, before, dir, frames.filter(([n]) => /^(01|05|09)/.test(n)), 'before'); res.before = b.data; errors.push(...b.errors);
    }
    fs.writeFileSync(path.join(out, 'eyes.json'), JSON.stringify(res, null, 1));
    const g = (n) => d[n].eyes[0].glintAt, moved = (a, b) => Math.hypot(g(a)[0] - g(b)[0], g(a)[1] - g(b)[1]);
    if (moved('01-sol-ljus-framifran-hoger', '02-sol-ljus-fran-vanster') < 2 || moved('01-sol-ljus-framifran-hoger', '03-sol-lagt-framifran') < 2) errors.push('the glint does not move with the sun');
    if (!(d['05-morkt-rum-ljusare-exponering'].pupil > d['01-sol-ljus-framifran-hoger'].pupil * 1.5)) errors.push('pupil not larger in the dark');
    // the same sun-lit frame, first with the dark room's wide pupil (the first frame outside), then after the pupil has narrowed
    if (!(d['07-ut-i-solen-forsta-bilden'].eyes[0].pupilPx > 1.5 * d['08-ut-i-solen-efter-en-sekund'].eyes[0].pupilPx)) errors.push('the wide pupil does not show more dark pixels');
    if (!(d['08-ut-i-solen-efter-en-sekund'].pupil < 0.8)) errors.push('the pupil has not narrowed within a second in the sun');
    if (d['04-sol-blinkning-stangd'].eyes.some((e, i) => e.brightPx > d['01-sol-ljus-framifran-hoger'].eyes[i].brightPx * 0.2)) errors.push('a shut eye still shows bright pixels');
    const brief = Object.fromEntries(Object.entries(d).map(([n, v]) => [n, { pupil: v.pupil && +v.pupil.toFixed(3), light: +v.light.toFixed(3), eyes: v.eyes }]));
    console.log(JSON.stringify(brief));
    if (errors.length) { console.log('FAIL', errors); process.exitCode = 1; } else console.log('PASS');
  } finally { await ctx.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
})();
