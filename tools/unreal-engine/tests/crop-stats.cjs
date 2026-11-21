// #2307: mean colour of matching crops in web / Unreal picture pairs, the numeric side of the lighting comparison.
//   PLAYWRIGHT_MODULE=… node tools/unreal-engine/tests/crop-stats.cjs DIR crops.json [--check-lighting] [--check-stairs] [--check-curtains] [--check-cabinet]
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
  if (process.argv.includes('--check-cabinet')) {
    const regionsByShot = {
      'living-room-day': ['cabinet-front'],
      'living-room-evening': ['cabinet-front', 'spot-1', 'spot-2', 'spot-3'],
    };
    for (const [shot, regions] of Object.entries(regionsByShot)) {
      for (const region of regions) {
        const web = out[shot]?.web[region], ue = out[shot]?.unreal[region];
        if (!web || !ue) throw Error(`Missing ${shot} ${region}`);
        const ratio = ue.luminance / web.luminance;
        if (!(ratio >= .8 && ratio <= 1.25)) throw Error(`${shot} ${region}: cabinet luminance ratio ${ratio.toFixed(3)}`);
        if (region !== 'cabinet-front') continue;
        for (const [channel, name] of [[0, 'R/G'], [2, 'B/G']]) {
          const hue = (ue.srgb[channel] / ue.srgb[1]) / (web.srgb[channel] / web.srgb[1]);
          if (!(hue >= .9 && hue <= 1.1)) throw Error(`${shot}: cabinet ${name} ratio ${hue.toFixed(3)}`);
        }
      }
    }
    console.log('Cabinet luminance and veneer hue pass in both views. All three illuminated cone centres pass.');
  }
  if (process.argv.includes('--check-curtains')) {
    for (const shot of ['living-room-day', 'living-room-evening', 'upper-floor-evening']) {
      const web = out[shot]?.web.curtain, ue = out[shot]?.unreal.curtain;
      if (!web || !ue) throw Error('Missing curtain crop: ' + shot);
      const ratio = ue.luminance / web.luminance;
      if (!(ratio >= .8 && ratio <= 1.25)) throw Error(`${shot}: curtain luminance ratio ${ratio.toFixed(3)} outside 0.8–1.25`);
      // Hue regression: mean print R/G and B/G at each camera, each within 10% of the web (guess).
      for (const [channel, name] of [[0, 'R/G'], [2, 'B/G']]) {
        const colourRatio = (ue.srgb[channel] / ue.srgb[1]) / (web.srgb[channel] / web.srgb[1]);
        if (!(colourRatio >= .9 && colourRatio <= 1.1)) throw Error(`${shot}: curtain ${name} ratio ${colourRatio.toFixed(3)} outside 0.9–1.1`);
      }
    }
    console.log('Curtain luminance and print hue pass for both living-room views and the upper floor.');
  }
  if (process.argv.includes('--check-pendant')) {
    const shot = out['living-room-evening'];
    for (const crop of ['left-wall', 'upper-left', 'upper-right', 'lower-left', 'lower-right']) {
      const ratio = shot?.unreal[crop]?.luminance / shot?.web[crop]?.luminance;
      if (!(ratio >= 0.8 && ratio <= 1.25)) throw Error(`Evening pendant ${crop} outside 0.8–1.25: ${ratio.toFixed(3)}`);
    }
    for (const column of ['left', 'right']) {
      const contrast = side => shot[side]['lower-' + column].luminance / shot[side]['upper-' + column].luminance;
      const web = contrast('web'), ue = contrast('unreal');
      if ((web - 1) * (ue - 1) <= 0 || ue / web < 0.8 || ue / web > 1.25)
        throw Error(`Evening wall ${column} vertical contrast: Unreal ${ue.toFixed(3)}, web ${web.toFixed(3)}`);
    }
    const unlit = out['living-room-without-pendant'];
    if (unlit) {
      for (const side of ['web','unreal']) {
        const gain = shot[side]['left-wall'].luminance - unlit[side]['left-wall'].luminance;
        if (!(gain > 0)) throw Error(`The pendant switch should light the ${side} wall`);
        console.log(`${side} living-room pendant switch changes left-wall luminance by ${gain.toFixed(4)}`);
      }
    }
  }
  const stairs = process.argv.includes('--check-stairs'), sky = process.argv.includes('--check-lighting');
  if (stairs || sky) {
    const failures = [];
    for (const [shot, crop] of [
      ...(stairs ? [['stairs-evening', 'frame']] : []),
      ...(sky ? [['start-night', 'sky'], ['start-day', 'sky'], ['start-overcast', 'sky']] : []),
      ['living-room-evening', 'frame'], ['upper-floor-evening', 'frame'], ['living-room-day', 'frame'],
    ]) {
      const ratio = out[shot]?.unreal[crop]?.luminance / out[shot]?.web[crop]?.luminance;
      if (!(ratio >= 0.8 && ratio <= 1.25)) failures.push(`${shot}/${crop} ${ratio.toFixed(3)}`);
    }
    if (failures.length) throw Error('Lighting crops outside 0.8–1.25: ' + failures.join(', '));
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
