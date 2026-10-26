// Explicit trusted-input companion (#839): node tools/sonosstart.cjs sonostest.html --jobs 1
// The published runner remains unchanged; this wrapper combines its exit with structured activation evidence.
const path = require('path');

if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args.some(arg => /^sonostest(?:\.html)?$/.test(arg))) {
    console.error('Usage: node tools/sonosstart.cjs sonostest.html [published runner options]');
    process.exit(2);
  }
  const { fork } = require('child_process');
  const child = fork(path.join(__dirname, 'runtests.cjs'), args,
    { execArgv: ['--require', __filename], stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
  const expected = args.includes('--list') ? 0 : args.includes('--compare') ? 2 : 1;
  let successes = 0, failed = false, signalCode = null;
  child.on('message', message => {
    if (message?.type !== 'sonos-start') return;
    if (message.ok) successes++; else failed = true;
  });
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.on(signal, () => {
    signalCode = code; child.kill(signal); // unchanged runner closes its owned browsers/server before exiting
  });
  child.on('error', error => { console.error(error); failed = true; });
  child.on('exit', (code, signal) => {
    if (failed || successes !== expected) console.error(`[sonos-start] verified ${successes}/${expected} activations; failure=${failed}`);
    process.exit(code !== null && code !== 0 ? code : signalCode ?? (signal ? 1 : failed || successes !== expected ? 1 : 0));
  });
} else {
  // Preloaded only in the runner child. No routes, source rewrites, autoplay flags or state stubs.
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const launch = chromium.launch.bind(chromium);
  const report = message => process.send?.({ type: 'sonos-start', ...message });

  async function activate(page) {
    await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow.__sonosStart?.ready === true,
      null, { timeout: 210000 });
    const frame = page.frames().find(f => /\/index\.html(?:\?|$)/.test(f.url()));
    if (!frame) throw new Error('Sonos game frame missing');
    const readiness = await frame.evaluate(() => {
      const inspect = id => {
        const element = document.getElementById(id);
        if (!element) return { missing: true };
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { hidden: element.hidden, display: style.display, visibility: style.visibility,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          hit: hit ? { id: hit.id, tag: hit.tagName } : null };
      };
      return { url: location.href, viewport: [innerWidth, innerHeight], bodyClass: document.body.className,
        phone: document.body.classList.contains('phone'), ready: window.__sonosStart.ready,
        elements: Object.fromEntries(['loading', 'overlay', 'start-touch', 'start-go'].map(id => [id, inspect(id)])) };
    });
    console.log('[sonos-start-ready] ' + JSON.stringify({ frames: page.frames().map(f => f.url()), ...readiness }));
    // #441: the first-visit name dialog covers the start button; a player leaves it with "Hoppa över" (#1633, like #1623).
    // Native click, only when the dialog is actually shown, and before the single start click the fixture waits for.
    await require('./testkit.cjs').skipNameDialog(frame);
    // Exactly one native input, after the fixture itself reports app/cover/listener readiness.
    await frame.locator('#start-touch').click({ timeout: 30000 });
    await frame.waitForFunction(() => window.__sonosStart?.beforeFirstMedia, null, { timeout: 30000 });
    const evidence = await frame.evaluate(() => ({ url: location.href, viewport: [innerWidth, innerHeight],
      controller: !!window.__app.testMode, ...window.__sonosStart }));
    if (!evidence.click?.trusted || !evidence.click.active || !evidence.click.loadingHidden ||
        !evidence.click.hasBeenActive || !evidence.beforeFirstMedia.hasBeenActive ||
        evidence.click.time > evidence.beforeFirstMedia.time) {
      throw new Error('Sonos trusted-start ordering/activation evidence failed: ' + JSON.stringify(evidence));
    }
    console.log('[sonos-start] ' + JSON.stringify(evidence));
    report({ ok: true, evidence });
  }

  chromium.launch = async (...args) => {
    const browser = await launch(...args), newContext = browser.newContext.bind(browser);
    browser.newContext = async (...options) => {
      const context = await newContext(...options);
      context.on('page', page => {
        let started = false;
        page.on('domcontentloaded', () => {
          if (started || new URL(page.url()).pathname !== '/tools/sonostest.html') return;
          started = true;
          activate(page).catch(error => {
            console.error('[sonos-start] ' + error.stack);
            report({ ok: false, error: error.message });
          });
        });
      });
      return context;
    };
    return browser;
  };
}
