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
  let browser, closePromise;
  const exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
  async function cleanup() {
    const errors = [];
    if (browser) {
      let timer;
      try {
        await Promise.race([browser.close(), new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error('Native fixture browser close timed out')), 3000);
        })]);
      } catch (error) { errors.push(error); }
      finally { clearTimeout(timer); }
    }
    // Bound only our spawned master, never other browsers or profiles.
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    let timer;
    let stopped = await Promise.race([exited.then(() => true), new Promise(resolve => {
      timer = setTimeout(() => resolve(false), 3000);
    })]);
    clearTimeout(timer);
    if (!stopped) {
      child.kill('SIGKILL');
      stopped = await Promise.race([exited.then(() => true), new Promise(resolve => {
        timer = setTimeout(() => resolve(false), 1000);
      })]);
      clearTimeout(timer);
    }
    if (!stopped) errors.push(Error('Owned native fixture browser did not exit after SIGKILL'));
    else {
      try {
        // A terminated master does not prove that its profile directory has stopped changing.
        // Bound ENOTEMPTY retries across the WHOLE owned profile, not independently per child directory.
        for (let retry = 0; ; retry++) {
          try { await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 0 }); break; }
          catch (error) {
            if (error.code !== 'ENOTEMPTY' || retry === 5) throw error;
            await new Promise(resolve => setTimeout(resolve, (retry + 1) * 100));
          }
        }
      } catch (error) { errors.push(error); }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, 'Native fixture cleanup failed');
  }
  async function close(primaryError) {
    closePromise ||= cleanup();
    try { await closePromise; }
    catch (cleanupError) {
      if (primaryError) throw new AggregateError([primaryError, cleanupError],
        'Native fixture failed and cleanup also failed', { cause: primaryError });
      throw cleanupError;
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
    return { browser, page, playwrightVersion: version, pid: child.pid, profile, close };
  } catch (error) { await close(error); throw error; }
}
module.exports = { launchNativeFixtureBrowser };
