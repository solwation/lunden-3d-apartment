// Verify the normal welcome/settings panel and a local-only release preview. Serve the checkout with tools/devserve.py.
// tools/browsertest.sh node tools/unreal-engine/tests/stable-menu.cjs http://localhost:8137 <screenshot-directory>
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { launch, skipNameDialog } = require('../../testkit.cjs');

const label = 'Ladda ned Lunden för Windows (64 bitar)';
const publisher = 'Installationsprogram signerat av Svep Design Center AB';
const helpLabel = 'Så kontrollerar du signaturen';
const helpUrl = 'https://github.com/solwation/lunden-3d-apartment#windowsversionen-av-lunden';
const example = 'https://release-preview.invalid/app-v0.0.0/Lunden-Setup-0.0.0-win-x64.exe';

async function openSettings(page, touch) {
  await skipNameDialog(page, {timeout: 120000});
  const early = page.locator('#loading-settings');
  const trigger = await early.isVisible() ? early : page.locator('#menu-settings');
  if (touch) await trigger.tap();
  else await trigger.click();
  await page.locator('#settings-dialog').waitFor();
}

async function layout(link) {
  return link.evaluate(el => {
    const panel = el.closest('.menu-options');
    const r = el.getBoundingClientRect(), clip = panel.getBoundingClientRect();
    return {width: Math.round(r.width), height: Math.round(r.height), scroll: Math.round(panel.scrollTop),
      visible: r.left >= 0 && r.right <= innerWidth && r.top >= clip.top - 1 && r.bottom <= clip.bottom + 1,
      reachable: el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
      overflow: panel.scrollWidth - panel.clientWidth};
  });
}

async function main() {
  const base = new URL(process.argv[2]);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'The preview runs on loopback');
  base.searchParams.set('cloud', '');
  const out = path.resolve(process.argv[3]);
  await fs.mkdir(out, { recursive: true });
  const { linkedSources } = await import('../stable-download.mjs');
  const readme = await fs.readFile(path.resolve(__dirname, '../../../README.md'), 'utf8');
  const browser = await launch();
  try {
    for (const [name, options] of [['desktop', { viewport: {width: 1280, height: 800} }], ['touch', devices['Pixel 7']]]) {
      console.log(name, 'opening the normal menu and the local preview');
      const ctx = await browser.newContext({ ...options, serviceWorkers: 'block', acceptDownloads: false });
      try {
        let preview = false;
        await ctx.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.origin !== base.origin) return route.abort();
          if (preview && url.pathname === base.pathname && route.request().isNavigationRequest()) {
            const response = await route.fetch();
            const [, html] = linkedSources(readme, await response.text(), example);
            return route.fulfill({status: response.status(), contentType: 'text/html; charset=utf-8', body: html});
          }
          return route.continue();
        });
        const page = await ctx.newPage();
        await page.goto(base.href, {waitUntil: 'domcontentloaded'});
        await openSettings(page, name === 'touch');
        const dialog = page.locator('#settings-dialog'), setup = dialog.getByRole('link', {name: new RegExp(label.replace(/[()]/g, '\\$&'))});
        const help = dialog.getByRole('link', {name: helpLabel});
        assert.equal(await setup.count(), 0);
        assert.equal(await help.count(), 0);
        preview = true;
        const ready = new URL(base);
        ready.searchParams.set('test', 'lazy'); // Keep the normal settings UI; skip continuous drawing behind its opaque card.
        await page.goto(ready.href, {waitUntil: 'domcontentloaded'});
        await page.waitForFunction(() => !document.body.classList.contains('welcome-pending'), null, {timeout: 180000})
          .catch(async error => { throw Error(name + ' startup: ' + await page.evaluate(() => window.__lundenLoading?.name), {cause: error}); });
        await openSettings(page, name === 'touch');
        assert.equal(await setup.getAttribute('href'), example);
        assert.equal(await setup.locator('.btn-desc').innerText(), publisher);
        assert.equal(await help.getAttribute('href'), helpUrl);
        assert.equal(await help.getAttribute('target'), '_blank');
        assert.match(await help.getAttribute('rel'), /\bnoopener\b/);
        const privacy = page.locator('#menu-privacy');
        if (name === 'desktop') {
          for (let i = 0; i < 80 && !await setup.evaluate(e => e === document.activeElement); i++)
            await page.keyboard.press('Tab');
          assert.ok(await setup.evaluate(e => e === document.activeElement));
          await page.keyboard.press('Tab');
          assert.ok(await help.evaluate(e => e === document.activeElement));
          await page.keyboard.press('Tab');
          assert.ok(await privacy.evaluate(e => e === document.activeElement));
          await page.keyboard.press('Shift+Tab');
          await page.keyboard.press('Shift+Tab');
          assert.ok(await setup.evaluate(e => e === document.activeElement));
        } else {
          const panel = dialog.locator('.menu-options');
          const rect = await panel.boundingBox();
          const cdp = await ctx.newCDPSession(page);
          for (let i = 0; i < 10 && !(await layout(help)).visible; i++) {
            const x = rect.x + rect.width / 2, y = rect.y + 0.8 * rect.height;
            await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
            for (let j = 1; j <= 8; j++) {
              await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: y - rect.height * .07 * j}]});
            }
            await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
            await page.waitForTimeout(150);
          }
          await cdp.detach();
        }
        const metrics = {setup: await layout(setup), help: await layout(help)};
        for (const row of Object.values(metrics)) {
          assert.ok(row.visible && row.reachable && row.overflow === 0, JSON.stringify(metrics));
        }
        console.log(name, JSON.stringify(metrics));
        await dialog.locator('.card').screenshot({path: path.join(out, name + '-preview.png')});
        if (name === 'desktop') {
          await page.keyboard.press('Escape');
        } else {
          assert.ok(metrics.help.height >= 44);
          const request = ctx.waitForEvent('request', {predicate: r => r.url().split('#')[0] === helpUrl.split('#')[0]});
          const bounds = await help.boundingBox();
          await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          await request; // the loopback-only route intercepts this outbound navigation
          for (const tab of ctx.pages()) if (tab !== page) await tab.close();
          await page.locator('#settings-close').tap();
        }
        assert.ok(await dialog.isHidden());
        assert.ok(await page.locator('#menu-settings').evaluate(e => e === document.activeElement));
      } finally { await ctx.close(); }
    }
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
