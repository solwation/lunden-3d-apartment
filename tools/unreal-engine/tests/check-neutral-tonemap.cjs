// #2396: Unreal's M_LundenNeutralTonemap against three.js's own NeutralToneMapping, over the input grid of
// tests/neutral_tonemap_probe.py. three.js r170 (the import map's version) renders one quad per input colour with
// MeshBasicMaterial (linear colour, no lighting), NeutralToneMapping and sRGB output; the Unreal probe renders the same
// colours as unlit emissive patches through the post-process material. Every channel must agree within 1/255.
//   PLAYWRIGHT_MODULE=… node tools/unreal-engine/tests/check-neutral-tonemap.cjs <probe dir> [capture name …]
// <probe dir> holds probe.json and the probe's PNGs. Without names it checks `neutral-b0` and `neutral-b2`.
// The exposure scale Unreal applies is fitted per picture (one number for all patches, printed), so the curve is
// checked apart from Unreal's exposure convention; the two biases' scales must then differ by 2 EV (within 2 %), so
// the exposure does reach the curve. Writes <dir>/check.json.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

function readPng(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, width, height, colourType, bitDepth; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colourType = data[9]; }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  if (bitDepth !== 8 || (colourType !== 6 && colourType !== 2)) throw Error(`${file}: unsupported PNG (depth ${bitDepth}, type ${colourType})`);
  const bpp = colourType === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      out[y * stride + x] = (src[x] + pred) & 255;
    }
  }
  return { width, height, bpp, px: (x, y) => [0, 1, 2].map(c => out[y * stride + x * bpp + c]) };
}

/** The mean of the inner half of each patch cell, row-major as the probe lays them out. */
function patches(img, probe) {
  const res = [];
  for (let i = 0; i < probe.values.length; i++) {
    const cx = i % probe.cols, cy = Math.floor(i / probe.cols), s = probe.cell, sum = [0, 0, 0]; let n = 0;
    for (let y = cy * s + s / 4; y < cy * s + 3 * s / 4; y++) for (let x = cx * s + s / 4; x < cx * s + 3 * s / 4; x++) {
      const p = img.px(x, y); sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; n++;
    }
    res.push(sum.map(v => v / n));
  }
  return res;
}

async function threeReference(page, values, exposures) {
  return page.evaluate(async ({ values, exposures }) => {
    const THREE = await import('three');
    const n = values.length, canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, antialias: false });
    renderer.setPixelRatio(1); renderer.setSize(n, 1, false);
    renderer.toneMapping = THREE.NeutralToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(0, n, 1, 0, -1, 1);
    values.forEach((v, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(v[0], v[1], v[2], THREE.LinearSRGBColorSpace) }));
      m.position.set(i + 0.5, 0.5, 0); scene.add(m);
    });
    const gl = renderer.getContext(), out = {};
    for (const k of exposures) {
      renderer.toneMappingExposure = k; renderer.render(scene, camera);
      const px = new Uint8Array(n * 4); gl.readPixels(0, 0, n, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      out[k] = values.map((_, i) => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]);
    }
    return { out, revision: THREE.REVISION };
  }, { values, exposures });
}

(async () => {
  const [dir, ...names] = process.argv.slice(2);
  const probe = JSON.parse(fs.readFileSync(path.join(dir, 'probe.json'), 'utf8'));
  const captures = names.length ? names : ['neutral-b0', 'neutral-b2'];
  const exposures = []; for (let e = 0.10; e <= 1.30001; e += 0.0025) exposures.push(+e.toFixed(4));
  const html = path.join(dir, 'three.html');
  fs.writeFileSync(html, '<!doctype html><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"}}</script>');
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const report = {};
  try {
    const page = await browser.newPage();
    await page.goto('file://' + html);
    const { out: ref, revision } = await threeReference(page, probe.values, exposures);
    report.three = revision;
    let failed = false;
    for (const name of captures) {
      const ue = patches(readPng(path.join(dir, name + '.png')), probe);
      let best;
      for (const k of exposures) {
        const err = ue.map((p, i) => Math.max(...p.map((v, c) => Math.abs(v - ref[k][i][c]))));
        const max = Math.max(...err);
        if (!best || max < best.max) best = { k, max, err };
      }
      const worst = best.err.indexOf(best.max);
      report[name] = { exposureScale: best.k, maxError: +best.max.toFixed(3), worst: { input: probe.values[worst], unreal: ue[worst].map(v => +v.toFixed(2)), three: ref[best.k][worst] },
        patches: probe.values.map((v, i) => ({ input: v, unreal: ue[i].map(x => +x.toFixed(2)), three: ref[best.k][i] })) };
      const ok = best.max <= 1.0;
      failed ||= !ok;
      console.log(`${name.padEnd(28)} exposure scale ${best.k.toFixed(4)}  max |Unreal - three| ${best.max.toFixed(3)} / 255  ${ok ? 'OK' : 'FAIL'}`
        + `  (worst ${JSON.stringify(probe.values[worst])}: ${ue[worst].map(v => v.toFixed(1))} vs ${ref[best.k][worst]})`);
    }
    if (report['neutral-b0'] && report['neutral-b2']) {
      const ev = Math.log2(report['neutral-b0'].exposureScale / report['neutral-b2'].exposureScale);
      report.exposureStepEv = +ev.toFixed(3);
      const ok = Math.abs(ev - 2) <= Math.log2(1.02);
      failed ||= !ok;
      console.log(`bias 0 -> -2: the fitted exposure falls by ${ev.toFixed(3)} EV (want 2)  ${ok ? 'OK' : 'FAIL'}`);
    }
    fs.writeFileSync(path.join(dir, 'check.json'), JSON.stringify(report, null, 1) + '\n');
    if (failed) process.exitCode = 1;
  } finally { await browser.close(); }
})();
