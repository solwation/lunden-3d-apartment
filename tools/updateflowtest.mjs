// Regression test for #1878: Update notice reappearing after reload due to stale HTML in HTTP cache.
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from '/home/devcontainers/kvarteret-lunden/node_modules/playwright/index.mjs';
import { prepareStartup } from '../src/startup.js';

let passed = 0;
function check(ok, msg) {
  assert(ok, msg);
  console.log('PASS ' + msg);
  passed++;
}

// 1. Standalone prepareStartup check: ensures _update timestamp is present on navigation
{
  const calls = [], nav = [];
  const local = { version: 'old', content: 'c1' };
  const remote = { version: 'new', content: 'c2' };
  const html = '<script type="module" src="src/bootstrap.js?v=new"></script>';
  const ok = await prepareStartup({
    local,
    url: 'http://localhost/app/?phone=1&time=14#paddock',
    storage: { getItem: () => null, setItem: () => {} },
    fetcher: async (u) => ({
      ok: true,
      json: async () => remote,
      text: async () => html
    }),
    navigate: u => nav.push(u),
    serviceWorker: null
  });
  check(!ok, 'prepareStartup returns false when navigating to new version');
  check(nav.length === 1, 'prepareStartup navigates once');
  const u = new URL(nav[0]);
  check(u.searchParams.get('v') === 'new', 'preserves target version in v');
  check(u.searchParams.has('_update'), 'includes _update cache-busting parameter');
  check(u.searchParams.get('phone') === '1', 'preserves existing phone param');
  check(u.searchParams.get('time') === '14', 'preserves existing time param');
  check(u.hash === '#paddock', 'preserves hash');
}

// 2. HTTP Cache and Update flow test with real Chromium
{
  const oldVer = '111111111111111111111111';
  const newVer = '222222222222222222222222';
  let published = false;
  const requests = [];

  const html = (v) => `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
<div id="build">${v}</div>
<div id="notice" hidden>Ny version finns</div>
<script type="module" src="src/bootstrap.js?v=${v}"></script>
</body>
</html>`;

  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, method: req.method, dest: req.headers['sec-fetch-dest'] });
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/version.json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ version: published ? newVer : oldVer, content: published ? 'h2' : 'h1' }));
      return;
    }
    if (u.pathname.startsWith('/src/')) {
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.end('// module');
      return;
    }
    // HTML document: cached with max-age=600 like GitHub Pages
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'max-age=600');
    // If published is false, server serves old HTML even if ?v=new was requested (simulates in-progress deploy)
    res.end(html(published ? newVer : oldVer));
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch({
    executablePath: '/home/devcontainers/.local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // A. Prime HTTP cache for ?v=newVer while server is still serving old HTML
    await page.goto(`${base}/?v=${newVer}`);
    const primedBuild = await page.textContent('#build');
    check(primedBuild === oldVer, 'initial request to ?v=newVer while unpublished receives old build');

    // B. Publish the new version on the server
    published = true;

    // C. Reloading without cache buster (the old bug): browser uses HTTP cache and returns old build
    await page.goto(`${base}/?v=${newVer}`);
    const cachedBuild = await page.textContent('#build');
    check(cachedBuild === oldVer, 'browser HTTP cache reuses cached old build when URL is identical');

    // D. Reloading with _update cache buster: browser bypasses HTTP cache and loads new build
    const updateUrl = `${base}/?v=${newVer}&_update=${Date.now()}`;
    await page.goto(updateUrl);
    const updatedBuild = await page.textContent('#build');
    check(updatedBuild === newVer, 'navigation with _update parameter fetches fresh HTML from server');

    // E. Verify that the server received a document request for the _update URL
    const docRequests = requests.filter(r => r.dest === 'document');
    check(docRequests.some(r => r.url.includes('_update=')), 'server saw document request with _update');

  } finally {
    await context.close();
    await browser.close();
    await new Promise(r => server.close(r));
  }
}

// 3. checkPublishedHtml verification (unit behavior)
{
  async function checkPublishedHtml(targetVersion, url, fetcher, build = 'test') {
    if (build === 'dev' || !targetVersion) return true;
    try {
      const next = new URL(url);
      next.searchParams.set('v', targetVersion);
      const r = await fetcher(next.href, { cache: 'no-store' });
      if (!r.ok) return false;
      const html = await r.text();
      const stamp = html.match(/src="src\/(?:bootstrap|main)\.js\?v=([^"&]+)"/)?.[1];
      return stamp === targetVersion;
    } catch {
      return false;
    }
  }

  // dev mode passes
  check(await checkPublishedHtml('v2', 'http://localhost/', async () => ({ ok: false }), 'dev'), 'dev mode skips network verification');

  // stamp mismatch fails (deploy not ready)
  const notReadyFetcher = async () => ({
    ok: true,
    text: async () => '<script type="module" src="src/bootstrap.js?v=v1"></script>'
  });
  check(!(await checkPublishedHtml('v2', 'http://localhost/', notReadyFetcher, 'prod')), 'mismatched HTML stamp returns false (deploy pending)');

  // stamp match succeeds
  const readyFetcher = async () => ({
    ok: true,
    text: async () => '<script type="module" src="src/bootstrap.js?v=v2"></script>'
  });
  check(await checkPublishedHtml('v2', 'http://localhost/', readyFetcher, 'prod'), 'matching HTML stamp returns true');

  // network error fails gracefully
  const errorFetcher = async () => { throw new Error('offline'); };
  check(!(await checkPublishedHtml('v2', 'http://localhost/', errorFetcher, 'prod')), 'offline/network error returns false without throwing');
}

console.log(`\nALL ${passed} CHECKS PASSED.`);
