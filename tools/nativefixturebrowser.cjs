// #889: focus emulation makes Chromium fullscreen-within-tab, not window fullscreen.
// Use the documented noDefaults CDP mode in an owned, disposable default context.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process');
const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = require(moduleName);
async function launchNativeFixtureBrowser() {
  const version = require(moduleName + '/package.json').version;
  const [major, minor] = version.split('.').map(Number);
  if (!(major > 1 || major === 1 && minor >= 60))
    throw Error('Native window fullscreen fixture requires Playwright >= 1.60 (connectOverCDP noDefaults)');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'native-fullscreen-'));
  const child = spawn(process.env.CHROME_PATH || chromium.executablePath(), [
    '--headless', '--no-sandbox', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1',
    '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let browser, closed = false;
  const exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
  async function close() {
    if (closed) return;
    closed = true;
    try { if (browser) await browser.close(); }
    finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      let timer;
      await Promise.race([exited, new Promise(resolve => { timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000); })]);
      clearTimeout(timer);
      await exited;
      fs.rmSync(profile, { recursive: true, force: true });
    }
  }
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => done(Error('Native fixture browser CDP startup timed out')), 10000);
      const onData = bytes => { text = (text + bytes.toString()).slice(-8192); const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) done(null, match[1]); };
      const onError = error => done(error);
      const onExit = () => done(Error('Native fixture browser exited before CDP startup'));
      function done(error, value) { clearTimeout(timer); child.stderr.off('data', onData); child.off('error', onError); child.off('exit', onExit); error ? reject(error) : resolve(value); }
      child.stderr.on('data', onData); child.once('error', onError); child.once('exit', onExit);
    });
    browser = await chromium.connectOverCDP(endpoint, { noDefaults: true, timeout: 10000 });
    const context = browser.contexts()[0];
    const page = context.pages()[0];
    if (!page) throw Error('Native fixture default page missing');
    return { browser, page, playwrightVersion: version, close };
  } catch (error) { await close(); throw error; }
}
module.exports = { launchNativeFixtureBrowser };
