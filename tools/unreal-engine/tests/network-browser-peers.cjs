// Invoked by PlayerBridgeTests with LUNDEN_TEST_BROWSER_PEERS=1 under tools/browsertest.sh.
// Two normal Ghosts clients exercise the launcher's local string-table transport. Synthetic game input only.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [port, folder, mode] = process.argv.slice(2);
const live = mode === "pie";
const origin = 'http://localhost:' + port;
const source = path.resolve(__dirname, '../../../src');
const three = process.env.THREE_ROOT || path.resolve(__dirname, '../../../node_modules/three');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function peer(browser, mobile, name, p) {
  const ctx = await browser.newContext(mobile ? devices['Pixel 7'] : { viewport: { width: 960, height: 640 } });
  // Serve the actual checked-out modules and Three.js without a CDN. The browser owns its real Worker socket.
  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/') return route.fulfill({
      contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>'
    });
    const file = url.pathname.match(/^\/(src|three)\/([A-Za-z0-9_./-]+\.js)$/);
    if (!file || file[2].split('/').includes('..')) return route.abort();
    return route.fulfill({ contentType: 'text/javascript', path: path.join(file[1] === 'src' ? source : three, file[2]) });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('Browser peer error:', e.message));
  await page.goto(origin);
  await page.evaluate(async ({ origin, name, p }) => {
    const T = await import('three'), { Ghosts } = await import('/src/ghosts.js');
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(55, innerWidth / innerHeight, .05, 80);
    camera.position.set(0, 1.6, 5);
    const state = { p, r: .5 };
    const ghosts = new Ghosts({ scene, camera, url: origin, name: () => name, state: () => ({ ...state, p: [...state.p] }), score: () => 0,
      weapon: () => '', active: () => true });
    window.peer = { ghosts, state };
    setInterval(() => ghosts.update(), 40);
  }, { origin, name, p });
  return page;
}

async function run() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling'] });
  try {
    const desktop = await peer(browser, false, 'Dator', [1,0,1]);
    const mobile = await peer(browser, true, 'Telefon', [2,0,2]);
    assert.equal(await mobile.evaluate(() => navigator.maxTouchPoints > 0), true);
    const pages = [desktop, mobile];
    let sequence = 100000; // the fixture takes over after the launcher's wire test
    const nextFile = () => path.join(folder, 'game-'+ ++sequence +'.csv');
    const output = path.join(folder, 'peers.csv');
    let x = 75, epoch = 0;
    async function signal(stage, expected = []) {
      const file = path.join(folder, 'live-step.json');
      await fs.writeFile(file + '.tmp', JSON.stringify({ stage, x, web: expected }));
      await fs.rename(file + '.tmp', file);
    }
    async function observed(stage) {
      try { return JSON.parse(await fs.readFile(path.join(folder,'live-observed.json'),'utf8')).stage === stage; }
      catch (e) { if (e.code !== 'ENOENT') throw e; return false; }
    }
    async function step() {
      const lines = [1, 'Klara', '120310101175u1', x, 130, 0, 0, 15, 0, 0, 0];
      const input = nextFile(), tmp = input + '.test';
      if (!live) {
        await fs.writeFile(tmp, 'Key,SourceString\n"Packet","' + lines.join('\\n') + '"\n');
        await fs.rename(tmp, input);
      }
      try {
        const csv = await fs.readFile(output, 'utf8');
        return csv.match(/"Packet","([^"]*)"/)?.[1].split('\\n').map(row => row.split('\\t')) || [];
      } catch (e) { if (e.code !== 'ENOENT') throw e; return []; }
    }
    async function match(expected) {
      if (live) await signal(epoch, expected);
      const until = Date.now() + 18000;
      let last;
      while (Date.now() < until) {
        const result = await step();
        const screens = await Promise.all(pages.map(page => page.evaluate(() => {
          const g = window.peer.ghosts;
          return [...g.others.values()].map(p => ({ id: p.id, name: p.name, position: p.feet.toArray(),
              yaw: p.root.rotation.y, away: !!p.away, look: p.avatarCode, visible: p.root.visible }));
        })));
        last = { rows: result.map(row => row.slice(0,7)), screens };
        const native = result[0]?.[1];
        const own = screens.map(s => s.find(p => p.name === 'Klara'));
        if (native && (!live || await observed(epoch)) && result.length === 3 && screens.every(s => s.length === 2) &&
            own.every(p => p?.id === native && !p.away && p.visible && p.look === '120310101175u1' &&
              Math.hypot(p.position[0]-x/100,p.position[1],p.position[2]-1.3) <= .05 &&
              Math.abs(p.yaw + Math.PI/2) < .02) &&
            expected.every(([name,px,pz,yaw]) => {
              const row = result.find(r => r[1] === name);
              return row && Math.hypot(+row[3]-px*100,+row[4]-pz*100,+row[5]) <= 5 &&
                Math.abs(+row[6]-(-90-yaw*180/Math.PI)) <= 1;
            })) return native;
        await sleep(80);
      }
      throw new Error('Synthetic peers did not reach phase ' + epoch + ': ' + JSON.stringify(last));
    }
    const id = await match([['Dator',1,1,.5], ['Telefon',2,2,.5]]);
    epoch++; x = 115;
    await desktop.evaluate(() => Object.assign(window.peer.state,{p:[2.75,0,.75],r:.7}));
    await mobile.evaluate(() => Object.assign(window.peer.state,{p:[.5,0,1.5],r:-.4}));
    assert.equal(await match([['Dator',2.75,.75,.7], ['Telefon',.5,1.5,-.4]]),id);
    if (live) await signal('away');
    else await fs.writeFile(nextFile(),'Key,SourceString\n"Packet","away"\n');
    await Promise.all(pages.map(p => p.waitForFunction(id => window.peer.ghosts.others.get(id)?.away === true,id,{timeout:5000})));
    epoch++; x = 185;
    assert.equal(await match([['Dator',2.75,.75,.7], ['Telefon',.5,1.5,-.4]]),id);
    if (live) await signal('done');
    console.log('Desktop and touch phone observed both moves, the away state and one returning avatar. Positions within 5 cm.');
  } finally { await browser.close(); }
}

run().catch(error => { console.error(error.message); process.exitCode = 1; });
