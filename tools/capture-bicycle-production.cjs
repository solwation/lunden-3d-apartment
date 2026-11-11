const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const port = 8925;
const outDir = 'docs/verification/1901';

// Simple static file server
function startServer() {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.glb': 'model/gltf-binary'
  };

  const server = http.createServer((req, res) => {
    let filePath = path.join(process.cwd(), req.url.split('?')[0]);
    if (filePath.endsWith('/')) filePath += 'index.html';

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404);
          res.end('404 Not Found');
        } else {
          res.writeHead(500);
          res.end('500 Server Error: ' + err.code);
        }
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`Server listening on port ${port}`);
      resolve(server);
    });
  });
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const server = await startServer();

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/home/devcontainers/.local/bin/chromium',
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });

  const page = await browser.newPage({ viewport: { width: 1200, height: 750 } });
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

  const url = `http://localhost:${port}/tools/verify-bicycle-glb.html`;
  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle' });

  await page.waitForFunction(() => window.__bicycleLoaded === true, { timeout: 20000 });
  await page.waitForTimeout(1000);

  // 1. Single bicycle (near LOD)
  await page.screenshot({ path: path.join(outDir, 'bicycle-glb-single.png') });
  console.log('Captured single bicycle view');

  // 2. Far LOD view
  await page.evaluate(() => {
    window.setLOD('far');
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, 'bicycle-glb-lod-far.png') });
  console.log('Captured far LOD view');

  // 3. Row of multi-color bikes in rack
  await page.evaluate(() => {
    window.setLOD('near');
    window.toggleRack();
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, 'bicycle-glb-rack.png') });
  console.log('Captured rack view with multiple colors');

  await browser.close();
  server.close();
  console.log('All verification screenshots captured successfully under', outDir);
  process.exit(0);
})().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
