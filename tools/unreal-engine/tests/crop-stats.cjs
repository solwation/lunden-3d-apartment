// #2307: mean colour of matching crops in web / Unreal picture pairs, the numeric side of the lighting comparison.
//   PLAYWRIGHT_MODULE=… node tools/unreal-engine/tests/crop-stats.cjs DIR crops.json [--check-lighting]
// crops.json: { "<shot>": { "<crop>": [x0, y0, x1, y1] (fractions of the width / height) } }. For each shot it reads
// DIR/web-<shot>.jpg and DIR/unreal-<shot>.(jpg|png) and prints, per crop, the mean sRGB (0-255), the mean relative
// luminance of the linear colour (Rec. 709, 0-1) and the warmth R/B of the mean, for both, and Unreal / web luminance.
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const [dir, cropsFile] = process.argv.slice(2);
  const crops = JSON.parse(fs.readFileSync(cropsFile, 'utf8'));
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox']});
  const page = await browser.newPage();
  const out = {};
  try {
  for (const [shot, rects] of Object.entries(crops)) {
    out[shot] = {};
    for (const side of ['web', 'unreal']) {
      const file = ['jpg', 'png'].map((e) => path.join(dir, `${side}-${shot}.${e}`)).find((f) => fs.existsSync(f));
      if (!file) throw new Error(`missing ${side}-${shot}`);
      const url = `data:image/${file.endsWith('png') ? 'png' : 'jpeg'};base64,` + fs.readFileSync(file).toString('base64');
      out[shot][side] = await page.evaluate(async ({url, rects}) => {
        const img = new Image(); img.src = url; await img.decode();
        const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        const res = {};
        for (const [name, [x0, y0, x1, y1]] of Object.entries(rects)) {
          const X = Math.round(x0 * img.width), Y = Math.round(y0 * img.height), W = Math.round((x1 - x0) * img.width), H = Math.round((y1 - y0) * img.height);
          const d = g.getImageData(X, Y, W, H).data;
          let r = 0, gg = 0, b = 0, lum = 0; const n = d.length / 4;
          for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; lum += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); }
          res[name] = {srgb: [r / n, gg / n, b / n].map((v) => +v.toFixed(1)), luminance: +(lum / n).toFixed(4), warmth: +(r / Math.max(b, 1)).toFixed(3)};
        }
        return res;
      }, {url, rects});
    }
    for (const name of Object.keys(rects)) {
      const w = out[shot].web[name], u = out[shot].unreal[name];
      console.log(`${shot.padEnd(22)} ${name.padEnd(12)} web lum ${w.luminance.toFixed(4)} R/B ${w.warmth.toFixed(2)} sRGB ${w.srgb.join(',').padEnd(17)}`
        + ` unreal lum ${u.luminance.toFixed(4)} R/B ${u.warmth.toFixed(2)} sRGB ${u.srgb.join(',').padEnd(17)} ratio ${(u.luminance / w.luminance).toFixed(2)}`);
    }
  }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(dir, 'crop-stats.json'), JSON.stringify({crops, stats: out}, null, 1) + '\n');
  if (process.argv.includes('--check-lighting')) {
    const failures = [];
    for (const [shot, crop] of [
      ['start-night', 'sky'], ['start-day', 'sky'], ['start-overcast', 'sky'],
      ['living-room-evening', 'frame'], ['upper-floor-evening', 'frame'], ['living-room-day', 'frame'],
    ]) {
      const ratio = out[shot]?.unreal[crop]?.luminance / out[shot]?.web[crop]?.luminance;
      if (!(ratio >= 0.8 && ratio <= 1.25)) failures.push(`${shot}/${crop} ${ratio.toFixed(3)}`);
    }
    if (failures.length) throw Error('Lighting crops outside 0.8–1.25: ' + failures.join(', '));
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
