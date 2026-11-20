// #2183: stairwell before/after pictures. GAME=http://localhost:PORT node tools/stairdaylightshots.cjs OUTDIR [view…]
// "before" = `&nostairday` (the old flat look), "after" = the new daylight + detail, noon (`&time=12`); Hus L also at night (`&time=23`).
// Each picture prints its mean brightness (0…255), the share of blown-out pixels (all channels ≥ 250) and the mean saturation, and the
// first one per view the stairwell meshes' `dayK` spread (min / mean / max / NaN count). `STAIR_OVR='{"gain":0.5}'` (or an array of such) overrides
// STAIR_DAYLIGHT for a look comparison (appended to src/config.js in the browser only); `SKIP_BEFORE=1` takes only the after pictures.
const kit = require('./testkit.cjs');
const VIEWS = { // at=x,z,yaw,pitch,feetY — each faces the core's own daylight glass from inside
  L: 'at=-17.5,5.2,0,4,0.0',        // Hus L: up the flight towards the stair window
  A: 'at=1.3,36.6,0,2,0',           // Hus A: from the stair hall north through the lobby to the entrance glass
  B: 'at=-33.9,42.6,0,2,0',         // Hus B: down the lobby corridor north to the entrance door and its sidelight
  C: 'at=-60.9,24.0,-90,2,0',       // Hus C: from the stair hall east through the lobby to the entrance glass
};
const stats = (page, png) => page.evaluate(async (b64) => {
  const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data;
  let sum = 0, blown = 0, sat = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    sum += 0.2126 * r + 0.7152 * gg + 0.0722 * b; if (mn >= 250) blown++; sat += mx ? (mx - mn) / mx : 0;
  }
  return { mean: +(sum / n).toFixed(1), blown: +(blown / n).toFixed(3), sat: +(sat / n).toFixed(3) };
}, png.toString('base64'));
(async () => {
  const [out, ...want] = process.argv.slice(2), game = process.env.GAME || 'http://localhost:8318', ovr = process.env.STAIR_OVR;
  const browser = await kit.launch();
  const variants = ovr ? [].concat(JSON.parse(ovr)) : [null]; // an array = several looks side by side (suffix -v0, -v1, …)
  for (const v of want.length ? want : Object.keys(VIEWS)) for (const [vi, vo] of variants.entries()) {
    const runs = [['noon', '&time=12', ''], ...(v === 'L' && !vi ? [['night', '&time=23', '']] : []), ...(process.env.SKIP_BEFORE || vi ? [] : [['noon-before', '&time=12&nostairday', 'before/']])];
    for (const [i, [tag, extra, dir]] of runs.entries()) {
      const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 }), page = await ctx.newPage();
      if (vo) await page.route('**/src/config.js', async (route) => {
        const r = await route.fetch(); await route.fulfill({ response: r, body: `${await r.text()}\nObject.assign(STAIR_DAYLIGHT, ${JSON.stringify(vo)});\n` });
      });
      await page.goto(`${game}/?shot&${VIEWS[v]}&freeze&weather=clear&quality=3${extra}&test`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.__app?.renderer, null, { timeout: 1500000, polling: 500 });
      await kit.skipNameDialog(page).catch(() => {});
      await page.waitForTimeout(1500);
      if (i === 0) console.log(v, 'dayK', JSON.stringify(await page.evaluate(() => {
        const out = []; window.__app.scene.traverse((o) => {
          const d = o.isMesh && o.geometry.attributes.dayK; if (!d) return;
          let mn = Infinity, mx = -Infinity, s = 0, nan = 0; for (const x of d.array) { if (Number.isNaN(x)) { nan++; continue; } mn = Math.min(mn, x); mx = Math.max(mx, x); s += x; }
          out.push([+mn.toFixed(2), +(s / d.count).toFixed(2), +mx.toFixed(2), nan]);
        }); return out;
      })));
      const file = `${out}/${dir}${v}-${tag}${vo ? `-v${vi}` : ''}.png`;
      await kit.shot(page, file, { viewport: { width: 960, height: 600 } });
      console.log(file, JSON.stringify(await stats(page, require('fs').readFileSync(file))));
      await ctx.close();
    }
  }
  await browser.close();
})();
