const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const port = 8927;
const outDir = 'docs/verification/1903';

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

  const url = `http://localhost:${port}/tools/verify-figures-glb.html`;
  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle' });

  await page.waitForFunction(() => window.figuresReady === true, { timeout: 20000 });
  console.log('Figures ready in browser.');

  // 1. Santa sitting
  await page.evaluate(() => window.setView('santa-sit'));
  await page.waitForTimeout(600);
  const shot1 = path.join(outDir, 'santa-sitting-glb.png');
  await page.screenshot({ path: shot1, fullPage: true });
  console.log(`Saved screenshot 1: ${shot1}`);

  // 2. Santa sleeping
  await page.evaluate(() => window.setView('santa-sleep'));
  await page.waitForTimeout(600);
  const shot2 = path.join(outDir, 'santa-sleeping-glb.png');
  await page.screenshot({ path: shot2, fullPage: true });
  console.log(`Saved screenshot 2: ${shot2}`);

  // 3. Pingping cushion
  await page.evaluate(() => window.setView('pingping'));
  await page.waitForTimeout(600);
  const shot3 = path.join(outDir, 'pingping-cushion-glb.png');
  await page.screenshot({ path: shot3, fullPage: true });
  console.log(`Saved screenshot 3: ${shot3}`);

  // 4. Pingping hug squash
  await page.evaluate(() => window.setView('pingping-hug'));
  await page.waitForTimeout(600);
  const shot4 = path.join(outDir, 'pingping-hug-squash.png');
  await page.screenshot({ path: shot4, fullPage: true });
  console.log(`Saved screenshot 4: ${shot4}`);

  await browser.close();
  server.close();
  console.log('All verification captures completed successfully.');
})();
