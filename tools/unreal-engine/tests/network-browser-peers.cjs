// Invoked by PlayerBridgeTests with LUNDEN_TEST_BROWSER_PEERS=1 under tools/browsertest.sh.
// Two normal Ghosts clients exercise the launcher's local string-table transport. Synthetic game input only.
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [port, folder, mode] = process.argv.slice(2);
const live = mode === 'pie';
const shared = process.env.LUNDEN_TEST_SHARED_ROOM === '1' ? require('./network-shared-peers.cjs') : null;
const capture = process.env.LUNDEN_TEST_UE_CAPTURE;
const workerOrigin = 'http://127.0.0.1:' + port;
const source = path.resolve(__dirname, '../../../src');
const three = process.env.THREE_ROOT || path.resolve(__dirname, '../../../node_modules/three');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Chromium needs the document's actual loopback address for its local-network checks.
function fixtureServer() {
  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://127.0.0.1');
    if (pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>');
      return;
    }
    const file = pathname.match(/^\/(src|three)\/([A-Za-z0-9_./-]+\.js)$/);
    if (file && !file[2].split('/').includes('..')) {
      try {
        const body = await fs.readFile(path.join(file[1] === 'src' ? source : three, file[2]));
        res.writeHead(200, { 'Content-Type': 'text/javascript' });
        res.end(body);
        return;
      } catch (e) {
        if (e.code !== 'ENOENT') { res.writeHead(500); res.end(); return; }
      }
    }
    res.writeHead(404);
    res.end();
  });
}

async function peer(browser, fixtureOrigin, mobile, name, p) {
  const ctx = await browser.newContext(mobile ? devices['Pixel 7'] : { viewport: { width: 960, height: 640 } });
  await ctx.route('**/*', route => new URL(route.request().url()).origin === fixtureOrigin ? route.continue() : route.abort());
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('Browser peer error:', e.message));
  await page.goto(fixtureOrigin);
  await page.evaluate(async ({ origin, name, p }) => {
    const T = await import('three'), { Ghosts } = await import('/src/ghosts.js');
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(55, innerWidth / innerHeight, .05, 80);
    camera.position.set(0, 1.6, 5);
    const state = { p, r: .5 };
    const ghosts = new Ghosts({ scene, camera, url: origin, name: () => name, state: () => ({ ...state, p: [...state.p] }), score: () => 0,
      weapon: () => '', active: () => true });
    window.peer = { ghosts, state };

  }, { origin: workerOrigin, name, p });
  if (shared) await shared.install(page, name);
  await page.evaluate(() => setInterval(() => window.peer.ghosts.update(), 40));
  return page;
}

// Draw the two received avatars at their actual feet with their normal Ghost name sprites.
async function capturePeer(page, filename, touch) {
  const image = await page.evaluate(async touch => {
    const T = await import('three');
    const { ghosts } = window.peer;
    const others = [...ghosts.others.values()];
    const names = new Set(others.map(g => g.name));
    if (matchMedia('(pointer: coarse)').matches !== touch || (navigator.maxTouchPoints > 0) !== touch)
      throw Error('Capture is running in the wrong browser profile.');
    if (!ghosts.connected || others.length !== 2 || !names.has('Klara') || !names.has(touch ? 'Dator' : 'Telefon')
        || others.some(g => g.away || !g.root.visible || !g.avatar.object.visible)) {
      throw new Error('Capture requires two visible, connected peers.');
    }
    const [left, right] = others.map(g => g.feet);
    const center = left.clone().lerp(right, .5);
    center.y += 1.05;
    const across = right.clone().sub(left);
    const view = new T.Vector3(-across.z, 0, across.x).normalize();
    if (view.z < 0) view.negate();
    const camera = ghosts.camera;
    // Leave room for the existing sprites above the players on either viewport.
    const halfHeight = Math.max(1.3, (across.length() / 2 + .45) / camera.aspect);
    camera.position.copy(center).addScaledVector(view, halfHeight / Math.tan(T.MathUtils.degToRad(camera.fov / 2)));
    camera.position.y += .23;
    camera.lookAt(center);
    const scene = ghosts.scene;
    scene.background = new T.Color(0xbfc6cc);
    scene.add(new T.HemisphereLight(0xffffff, 0x8a7f72, 1.6));
    const sun = new T.DirectionalLight(0xfff2e0, 2.2);
    sun.position.copy(center).addScaledVector(view, 3);
    sun.position.y += 4;
    scene.add(sun);
    scene.add(new T.GridHelper(12, 24, 0x859097, 0xa4adb1));
    // Use one drawing-buffer pixel per viewport CSS pixel on both profiles.
    const renderer = new T.WebGLRenderer({antialias: true});
    try {
      renderer.setSize(innerWidth, innerHeight, false);
      renderer.toneMapping = T.ACESFilmicToneMapping;
      ghosts.update();
      renderer.render(scene, camera);
      const frame = document.createElement('canvas');
      frame.width = renderer.domElement.width;
      frame.height = renderer.domElement.height;
      const ctx = frame.getContext('2d', {willReadFrequently: true});
      ctx.drawImage(renderer.domElement, 0, 0);

      // Compare the saved frame to a second rendering with just this avatar's body hidden.
      // The real name sprite, other peer, grid, camera and lighting stay in both images.
      const sample = document.createElement('canvas');
      const reference = sample.getContext('2d', {willReadFrequently: true});
      const coverage = [];
      for (const ghost of others) {
        const projected = h => ghost.feet.clone().addScaledVector(camera.up, h * ghost.avatar.look.tall).project(camera);
        const low = projected(.65), high = projected(1.45);
        const y = Math.floor((1 - high.y) * frame.height / 2);
        const height = Math.ceil((high.y - low.y) * frame.height / 2), width = Math.ceil(height * .55);
        const x = Math.floor((1 + low.x) * frame.width / 2 - width / 2);
        if (!(height >= 12 && x >= 0 && y >= 0 && x + width <= frame.width && y + height <= frame.height))
          throw Error(ghost.name + ' is outside the captured view');
        sample.width = width;
        sample.height = height;
        const actual = ctx.getImageData(x, y, width, height).data;
        const body = ghost.avatar.object;
        try {
          body.visible = false;
          renderer.render(scene, camera);
          reference.drawImage(renderer.domElement, x, y, width, height, 0, 0, width, height);
        } finally { body.visible = true; }
        const background = reference.getImageData(0, 0, width, height).data;
        let changed = 0;
        for (let i = 0; i < actual.length; i += 4) {
          if (Math.max(Math.abs(actual[i] - background[i]), Math.abs(actual[i+1] - background[i+1]),
                       Math.abs(actual[i+2] - background[i+2])) >= 12) changed++;
        }
        if (changed < .05 * width * height)
          throw Error(ghost.name + ' contributed only ' + changed + ' visible body pixels in its projected torso');
        coverage.push({name: ghost.name, changed, samples: width * height});
      }
      if (renderer.getContext().isContextLost()) throw Error('WebGL context lost during peer capture');
      return {png: frame.toDataURL('image/png'), coverage, width: frame.width, height: frame.height};
    } finally {
      renderer.dispose();
      renderer.forceContextLoss();
    }
  }, touch);
  const prefix = 'data:image/png;base64,';
  assert.ok(image.png.startsWith(prefix), 'No rendered peer PNG');
  await fs.writeFile(filename, Buffer.from(image.png.slice(prefix.length), 'base64'));
  console.log(touch ? 'Touch' : 'Desktop', image.width + 'x' + image.height, JSON.stringify(image.coverage));
}

async function run() {
  if (capture && (!path.isAbsolute(capture) || path.extname(capture).toLowerCase() !== '.png')) {
    throw new Error('LUNDEN_TEST_UE_CAPTURE must be an absolute PNG path.');
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling'] });
  const server = fixtureServer();
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const fixtureOrigin = 'http://127.0.0.1:' + server.address().port;
    const desktop = await peer(browser, fixtureOrigin, false, 'Dator', [1,0,1]);
    const mobile = await peer(browser, fixtureOrigin, true, 'Telefon', [2,0,2]);
    assert.equal(await mobile.evaluate(() => navigator.maxTouchPoints > 0), true);
    const pages = [desktop, mobile];
    let sequence = 100000; // the fixture takes over after the launcher's wire test
    const nextFile = () => path.join(folder, 'game-'+ ++sequence +'.csv');
    const output = path.join(folder, 'peers.csv');
    let x = 75, epoch = 0;
    async function signal(stage, expected = []) {
      const file = path.join(folder, 'live-step.json');
      await fs.writeFile(file + '.tmp', JSON.stringify({ stage, x, web: expected }));
      // Windows can briefly deny replacement while PIE is reading the previous step.
      const until = Date.now() + 3000;
      while (true) {
        try { await fs.rename(file + '.tmp', file); break; }
        catch (error) {
          if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || Date.now() >= until) throw error;
          await sleep(20);
        }
      }
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
    function matchesGhost(ghost, id, px, pz, yaw, look) {
      if (!ghost || ghost.id !== id || ghost.away || !ghost.visible || ghost.look !== look) return false;
      const [gx, gy, gz] = ghost.position;
      const delta = ghost.yaw - yaw;
      return Math.hypot(gx - px, gy, gz - pz) <= .05 &&
        Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) <= Math.PI / 180;
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
        if (native && (!live || await observed(epoch)) && result.length === 3 && screens.every(s => s.length === 2) &&
            screens.every(s => matchesGhost(s.find(p => p.name === 'Klara'), native, x / 100, 1.3, -Math.PI / 2, '120310101175u1')) &&
            expected.every(([name, px, pz, yaw], index) => {
              const row = result.find(r => r[1] === name);
              const onOtherScreen = screens[1 - index].find(p => p.name === name);
              return row && Math.hypot(+row[3] - px * 100, +row[4] - pz * 100, +row[5]) <= 5 &&
                Math.abs(+row[6] - (-90 - yaw * 180 / Math.PI)) <= 1 &&
                matchesGhost(onOtherScreen, row[0], px, pz, yaw, row[2]);
            })) return native;
        await sleep(80);
      }
      last.clients = await Promise.all(pages.map(page => page.evaluate(() => {
        const g = window.peer.ghosts;
        return { connected: g.connected, hidden: document.hidden, attempts: g.connects, messages: g.messages };
      })));
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
    if (capture) {
      const stem = capture.slice(0, -4);
      await fs.mkdir(path.dirname(stem), { recursive: true });
      let capturing = true;
      // PIE keeps ticking its real component. Keep providing the same game frames in a synthetic capture.
      const tickWhileCapturing = async () => {
        while (!live && capturing) { await step(); await sleep(200); }
      };
      const captureBoth = async () => {
        try {
          await capturePeer(desktop, stem + '-desktop.png', false);
          await capturePeer(mobile, stem + '-touch.png', true);
        } finally { capturing = false; }
      };
      await Promise.all([tickWhileCapturing(), captureBoth()]);
      if (live) {
        const marker = path.join(folder, 'live-captured');
        const until = Date.now() + 75000;
        while (true) {
          try { await fs.access(marker); break; }
          catch (e) { if (e.code !== 'ENOENT') throw e; }
          if (Date.now() >= until) throw new Error('Timed out waiting for the stage 2 Unreal capture.');
          await sleep(150);
        }
        for (const page of pages) {
          assert.equal(await page.evaluate(id => {
            const g = window.peer.ghosts;
            return g.connected && g.others.size === 2 && g.others.get(id)?.away === false;
          }, id), true, 'Peers must remain connected through the Unreal capture');
        }
      }
    }
    if (shared) await shared.run({ desktop, mobile, folder, live, nextFile, signal, step,
      lateMobile: () => peer(browser, fixtureOrigin, true, 'Mobilgäst', [1.5,0,.5]) });
    if (live) await signal('done');
    console.log('Desktop and touch phone observed both moves, the away state and one returning avatar. Positions within 5 cm.');
  } finally {
    await browser.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => { console.error(error.message); process.exitCode = 1; });
