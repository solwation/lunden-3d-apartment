const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const port = 8926;
const outDir = 'docs/verification/1902';

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

  const url = `http://localhost:${port}/tools/verify-fish-glb.html`;
  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle' });

  await page.waitForFunction(() => window.modelsReady === true, { timeout: 20000 });
  console.log('Models ready in browser.');

  // 1. View rigged fish
  await page.evaluate(() => window.setView('fish'));
  await page.waitForTimeout(600);
  const shot1 = path.join(outDir, 'fish-rigged-animated.png');
  await page.screenshot({ path: shot1, fullPage: true });
  console.log(`Saved screenshot 1: ${shot1}`);

  // 2. View fish school
  await page.evaluate(() => window.setView('school'));
  await page.waitForTimeout(600);
  const shot2 = path.join(outDir, 'fish-school-instanced.png');
  await page.screenshot({ path: shot2, fullPage: true });
  console.log(`Saved screenshot 2: ${shot2}`);

  // 3. View shark fin and bones
  await page.evaluate(() => window.setView('shark'));
  await page.waitForTimeout(600);
  const shot3 = path.join(outDir, 'shark-fin-and-bones.png');
  await page.screenshot({ path: shot3, fullPage: true });
  console.log(`Saved screenshot 3: ${shot3}`);

  await browser.close();
  server.close();
  console.log('All verification captures completed successfully.');
})();
