// #2432: leaf-pixel statistics of crown regions in one picture, for web / Unreal tree comparisons.
//   PLAYWRIGHT_MODULE=… node tools/unreal-engine/tests/leaf-stats.cjs PICTURE '{"name": [x0, y0, x1, y1]}'   (fractions)
// Pixels with b > r + 12 and b >= g count as sky and near-white ones as facade trim; the rest are leaves, bark or wall. Prints
// per region the share of the remaining pixels, their mean sRGB and their mean HSL hue (degrees), saturation and lightness.
const fs = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const [file, regionsText] = process.argv.slice(2);
  const regions = JSON.parse(regionsText);
  const browser = await chromium.launch({args: ['--no-sandbox']});
  const page = await browser.newPage();
  const url = `data:image/${file.endsWith('png') ? 'png' : 'jpeg'};base64,` + fs.readFileSync(file).toString('base64');
  const res = await page.evaluate(async ({url, regions}) => {
    const img = new Image(); img.src = url; await img.decode();
    const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const out = {};
    for (const [name, [x0, y0, x1, y1]] of Object.entries(regions)) {
      const X = Math.round(x0 * img.width), Y = Math.round(y0 * img.height), W = Math.round((x1 - x0) * img.width), H = Math.round((y1 - y0) * img.height);
      const d = g.getImageData(X, Y, W, H).data;
      let n = 0, r = 0, gg = 0, b = 0, hs = 0, hc = 0, ss = 0, ll = 0; const tot = d.length / 4;
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2];
        if (B > R + 12 && B >= G) continue; // sky
        const mx = Math.max(R, G, B) / 255, mn = Math.min(R, G, B) / 255, l = (mx + mn) / 2, dd = mx - mn;
        if (mx > 0.93 && dd < 0.08) continue; // white facade parts
        n++; r += R; gg += G; b += B; ll += l;
        const s = dd === 0 ? 0 : dd / (1 - Math.abs(2 * l - 1)); ss += s;
        if (dd > 0.02) { let h; const Rn = R / 255, Gn = G / 255, Bn = B / 255;
          if (mx === Rn) h = ((Gn - Bn) / dd) % 6; else if (mx === Gn) h = (Bn - Rn) / dd + 2; else h = (Rn - Gn) / dd + 4;
          h = (h * 60 + 360) % 360; const a = h * Math.PI / 180; hs += Math.cos(a); hc += Math.sin(a); }
      }
      const hue = (Math.atan2(hc, hs) * 180 / Math.PI + 360) % 360;
      out[name] = {share: +(n / tot).toFixed(3), srgb: [r / n, gg / n, b / n].map((v) => +v.toFixed(1)), hue: +hue.toFixed(1), sat: +(ss / n).toFixed(3), light: +(ll / n).toFixed(3)};
    }
    return out;
  }, {url, regions});
  for (const [k, v] of Object.entries(res)) console.log(k.padEnd(14), JSON.stringify(v));
  await browser.close();
})();
