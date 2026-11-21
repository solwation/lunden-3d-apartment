// Share of pixels in the closed leaf's rectangle that are darker than halfway between the crop's 5th and 95th luminance percentiles.
const fs = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE);
(async () => {
  const [rect, ...files] = process.argv.slice(2); const [x0, y0, x1, y1] = rect.split(',').map(Number);
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, args: ['--no-sandbox']});
  const page = await browser.newPage();
  for (const f of files) {
    const url = 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
    const r = await page.evaluate(async ({url, x0, y0, x1, y1}) => {
      const img = new Image(); img.src = url; await img.decode();
      const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const X = Math.round(x0 * img.width), Y = Math.round(y0 * img.height), W = Math.round((x1 - x0) * img.width), H = Math.round((y1 - y0) * img.height);
      const d = g.getImageData(X, Y, W, H).data, L = [];
      for (let i = 0; i < d.length; i += 4) L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      const s = [...L].sort((a, b) => a - b), lo = s[Math.floor(0.05 * s.length)], hi = s[Math.floor(0.95 * s.length)], mid = (lo + hi) / 2;
      return {pixels: L.length, p5: +lo.toFixed(1), p95: +hi.toFixed(1), gapShare: +(L.filter((v) => v < mid).length / L.length).toFixed(3)};
    }, {url, x0, y0, x1, y1});
    console.log(f.split('/').pop(), JSON.stringify(r));
  }
  await browser.close();
})();
