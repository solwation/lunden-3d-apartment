// Make the light-profile copies of the photographed wall pictures (#1511): textures/<name>.jpg → textures/light/<name>.jpg,
// longest side RESOURCE_PROFILE.light.max px with three's own rounding (WebGLTextures resizeImage: floor(scale × side)),
// so a light profile uploads a texture of exactly the size three made from the full file under the same cap.
// Resampled in headless Chromium (step-wise halving, imageSmoothingQuality 'high'), JPEG quality 0.9. Rerun after
// changing a listed picture or `max`:
//   PLAYWRIGHT_MODULE=$(npm root -g)/playwright node tools/lighttextures.cjs [--chrome PATH]
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2), chrome = args.includes('--chrome') ? args[args.indexOf('--chrome') + 1] : undefined;

(async () => {
  const { RESOURCE_PROFILE: R } = await import(path.join(ROOT, 'src/config.js'));
  const browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
  const page = await browser.newPage();
  fs.mkdirSync(path.join(ROOT, 'textures/light'), { recursive: true });
  for (const rel of R.light.textures) {
    const src = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(ROOT, rel)).toString('base64');
    const out = await page.evaluate(async ({ src, max }) => {
      const img = new Image(); img.src = src; await img.decode();
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const W = Math.floor(scale * img.width), H = Math.floor(scale * img.height);
      let cur = img, w = img.width, h = img.height;
      do { // halve until one step from the target: a single big bilinear step would alias
        w = Math.max(W, Math.floor(w / 2)); h = Math.max(H, Math.floor(h / 2));
        if (w < W * 2 && h < H * 2) { w = W; h = H; }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(cur, 0, 0, w, h); cur = c;
      } while (w !== W || h !== H);
      return { w: W, h: H, from: [img.width, img.height], url: cur.toDataURL('image/jpeg', 0.9) };
    }, { src, max: R.light.max });
    const dest = path.join(ROOT, path.dirname(rel), 'light', path.basename(rel));
    fs.writeFileSync(dest, Buffer.from(out.url.split(',')[1], 'base64'));
    console.log(`${rel} ${out.from.join('×')} → ${path.relative(ROOT, dest)} ${out.w}×${out.h} ${fs.statSync(dest).size} B`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
