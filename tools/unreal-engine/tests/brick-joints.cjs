// #2393: mortar share and mortar lightness of brick crops in web / Unreal picture pairs.
//   PLAYWRIGHT_MODULE=… node tools/unreal-engine/tests/brick-joints.cjs DIR crops.json [--check] [--tolerance 0.15]
// crops.json has crop-stats.cjs's format: { "<shot>": { "<crop>": [x0, y0, x1, y1] (fractions) } }. For each shot it
// reads DIR/web-<shot>.(jpg|png) and DIR/unreal-<shot>.(jpg|png). Each crop must hold only brick and its joints. Per
// crop and side, the CIE L* of every pixel is split in two by Otsu's threshold: the light class is mortar, the dark
// class brick. It prints the mortar share (fraction of pixels in the light class), the mortar's mean L*, the brick's
// mean L* and the mortar contrast (mortar L* - brick L*), then Unreal / web for share, mortar L* and contrast. --check
// exits 1 when the share or the mortar L* ratio lies outside 1 ± tolerance (#2393's acceptance); the contrast ratio is
// reported only (the brick class also carries how much a distant pixel blends brick and mortar). --crops-out OUT writes each crop, 3x enlarged with
// nearest-neighbour sampling, as OUT/<shot>-<crop>-<side>.png for review.
// #2427: it also prints the spread of the bricks' own colour: each brick is a 4-connected region of the brick-class
// pixels whose 3 x 3 neighbourhood is all brick (no joint blend), at least 6 pixels; over the bricks' mean colours it
// prints the p10-p90 width of CIE L*, C* and hue (degrees), and Unreal / web for each.
// --colour-check shot/crop[,shot/crop…] exits 1 when the L* or hue spread of those crops lies outside
// 1 ± colour tolerance (--colour-tolerance, default 0.2: #2427's acceptance); the C* spread is reported only.
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const args = process.argv.slice(2);
  const [dir, cropsFile] = args;
  const tolIndex = args.indexOf('--tolerance');
  const tolerance = tolIndex >= 0 ? Number(args[tolIndex + 1]) : 0.15;
  const cropsOutIndex = args.indexOf('--crops-out');
  const cropsOut = cropsOutIndex >= 0 ? args[cropsOutIndex + 1] : null;
  const colourIndex = args.indexOf('--colour-check');
  const colourCrops = colourIndex >= 0 ? args[colourIndex + 1].split(',') : [];
  const colourTolIndex = args.indexOf('--colour-tolerance');
  const colourTolerance = colourTolIndex >= 0 ? Number(args[colourTolIndex + 1]) : 0.2;
  if (cropsOut) fs.mkdirSync(cropsOut, {recursive: true});
  const crops = JSON.parse(fs.readFileSync(cropsFile, 'utf8'));
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox']});
  const page = await browser.newPage();
  const out = {};
  let failed = false, colourFailed = false;
  try {
    for (const [shot, rects] of Object.entries(crops)) {
      out[shot] = {};
      for (const side of ['web', 'unreal']) {
        const file = ['jpg', 'png'].map((e) => path.join(dir, `${side}-${shot}.${e}`)).find((f) => fs.existsSync(f));
        if (!file) throw new Error(`missing ${side}-${shot}`);
        const url = `data:image/${file.endsWith('png') ? 'png' : 'jpeg'};base64,` + fs.readFileSync(file).toString('base64');
        const result = await page.evaluate(async ({url, rects, save}) => {
          const img = new Image(); img.src = url; await img.decode();
          const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0);
          const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
          const lstar = (y) => (y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : y * 24389 / 27);
          const res = {}, images = {};
          for (const [name, [x0, y0, x1, y1]] of Object.entries(rects)) {
            const X = Math.round(x0 * img.width), Y = Math.round(y0 * img.height);
            const W = Math.round((x1 - x0) * img.width), H = Math.round((y1 - y0) * img.height);
            const d = g.getImageData(X, Y, W, H).data;
            const n = d.length / 4, L = new Float64Array(n), A = new Float64Array(n), B = new Float64Array(n), hist = new Float64Array(101);
            const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
            for (let i = 0; i < n; i++) {
              const k = 4 * i, r = lin(d[k]), gg = lin(d[k + 1]), b = lin(d[k + 2]);
              L[i] = lstar(0.2126 * r + 0.7152 * gg + 0.0722 * b);
              const fy = f(0.2126 * r + 0.7152 * gg + 0.0722 * b);
              A[i] = 500 * (f((0.4124 * r + 0.3576 * gg + 0.1805 * b) / 0.95047) - fy);
              B[i] = 200 * (fy - f((0.0193 * r + 0.1192 * gg + 0.9505 * b) / 1.08883));
              hist[Math.min(100, Math.max(0, Math.round(L[i])))]++;
            }
            // Otsu on a 1-L* histogram
            let sum = 0; for (let t = 0; t <= 100; t++) sum += t * hist[t];
            let wB = 0, sumB = 0, best = -1, threshold = 50;
            for (let t = 0; t <= 100; t++) {
              wB += hist[t]; if (!wB) continue;
              const wF = n - wB; if (!wF) break;
              sumB += t * hist[t];
              const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
              if (between > best) { best = between; threshold = t + 0.5; }
            }
            let nJ = 0, sJ = 0, sB = 0;
            for (let i = 0; i < n; i++) { if (L[i] > threshold) { nJ++; sJ += L[i]; } else sB += L[i]; }
            const share = nJ / n, mortar = sJ / Math.max(nJ, 1), brick = sB / Math.max(n - nJ, 1);
            // #2427: the bricks' own colour, away from the joints (eroded brick class)
            // per brick: the 4-connected regions of the eroded brick class, each region's mean L*, a*, b* (averages
            // out JPEG noise); regions under 6 pixels are dropped
            const inner = new Uint8Array(n);
            for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
              let ok = 1;
              for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (L[(y + dy) * W + x + dx] > threshold) { ok = 0; break; }
              inner[y * W + x] = ok;
            }
            const vl = [], vc = [], vh = [], stack = [];
            for (let s0 = 0; s0 < n; s0++) {
              if (!inner[s0]) continue;
              let cnt = 0, sl = 0, sa = 0, sb = 0;
              inner[s0] = 0; stack.push(s0);
              while (stack.length) {
                const i = stack.pop(), x = i % W;
                cnt++; sl += L[i]; sa += A[i]; sb += B[i];
                for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < n && inner[j]) { inner[j] = 0; stack.push(j); }
              }
              if (cnt < 6) continue;
              vl.push(sl / cnt); vc.push(Math.hypot(sa, sb) / cnt); vh.push(Math.atan2(sb, sa) * 180 / Math.PI);
            }
            const width = (v) => { if (!v.length) return 0; v.sort((a, b) => a - b); return v[Math.floor(0.9 * (v.length - 1))] - v[Math.floor(0.1 * (v.length - 1))]; };
            res[name] = {pixels: n, threshold, share: +share.toFixed(4), mortarL: +mortar.toFixed(2),
              brickL: +brick.toFixed(2), contrast: +(mortar - brick).toFixed(2),
              bricks: vl.length, spreadL: +width(vl).toFixed(2), spreadC: +width(vc).toFixed(2), spreadHue: +width(vh).toFixed(2)};
            if (save) {
              const z = new OffscreenCanvas(W * 3, H * 3), zg = z.getContext('2d');
              zg.imageSmoothingEnabled = false;
              zg.drawImage(c, X, Y, W, H, 0, 0, W * 3, H * 3);
              const blob = await z.convertToBlob({type: 'image/png'});
              const bytes = new Uint8Array(await blob.arrayBuffer());
              let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
              images[name] = btoa(bin);
            }
          }
          return {res, images};
        }, {url, rects, save: !!cropsOut});
        out[shot][side] = result.res;
        for (const [name, b64] of Object.entries(result.images)) {
          fs.writeFileSync(path.join(cropsOut, `${shot}-${name}-${side}.png`), Buffer.from(b64, 'base64'));
        }
      }
      for (const name of Object.keys(rects)) {
        const w = out[shot].web[name], u = out[shot].unreal[name];
        const shareRatio = u.share / w.share, contrastRatio = u.contrast / w.contrast, mortarRatio = u.mortarL / w.mortarL;
        const ok = Math.abs(shareRatio - 1) <= tolerance && Math.abs(mortarRatio - 1) <= tolerance;
        out[shot][name] = {shareRatio: +shareRatio.toFixed(3), contrastRatio: +contrastRatio.toFixed(3), mortarRatio: +mortarRatio.toFixed(3), ok};
        if (!ok) failed = true;
        const fmt = (s) => `share ${s.share.toFixed(3)} mortar L* ${s.mortarL.toFixed(1)} brick L* ${s.brickL.toFixed(1)} contrast ${s.contrast.toFixed(1)}`;
        console.log(`${shot.padEnd(18)} ${name.padEnd(14)} web ${fmt(w)} | unreal ${fmt(u)} | share x${shareRatio.toFixed(2)} mortar L* x${mortarRatio.toFixed(2)} (contrast x${contrastRatio.toFixed(2)}) ${ok ? 'ok' : 'OUTSIDE'}`);
        const lRatio = u.spreadL / w.spreadL, cRatio = u.spreadC / w.spreadC, hRatio = u.spreadHue / w.spreadHue;
        const checked = colourCrops.includes(`${shot}/${name}`);
        const colourOk = Math.abs(lRatio - 1) <= colourTolerance && Math.abs(hRatio - 1) <= colourTolerance;
        Object.assign(out[shot][name], {spreadLRatio: +lRatio.toFixed(3), spreadCRatio: +cRatio.toFixed(3), spreadHueRatio: +hRatio.toFixed(3), colourChecked: checked, colourOk});
        if (checked && !colourOk) colourFailed = true;
        const sp = (s) => `${s.bricks} bricks L* ${s.spreadL.toFixed(1)} C* ${s.spreadC.toFixed(1)} hue ${s.spreadHue.toFixed(1)}`;
        console.log(`${''.padEnd(33)} brick colour p10-p90: web ${sp(w)} | unreal ${sp(u)} | L* x${lRatio.toFixed(2)} C* x${cRatio.toFixed(2)} hue x${hRatio.toFixed(2)}${checked ? (colourOk ? ' ok' : ' OUTSIDE') : ''}`);
      }
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(dir, 'brick-joints.json'), JSON.stringify({crops, tolerance, colourTolerance, colourCrops, stats: out}, null, 1) + '\n');
  if (args.includes('--check')) {
    console.log(failed ? `BRICK_JOINTS_OUTSIDE (tolerance ${tolerance})` : `BRICK_JOINTS_OK (tolerance ${tolerance})`);
    if (failed) process.exitCode = 1;
  }
  if (colourCrops.length) {
    console.log(colourFailed ? `BRICK_COLOUR_OUTSIDE (tolerance ${colourTolerance})` : `BRICK_COLOUR_SPREAD_OK (tolerance ${colourTolerance})`);
    if (colourFailed) process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
