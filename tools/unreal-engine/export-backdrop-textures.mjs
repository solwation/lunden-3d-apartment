// #2323. Bake the actual web canvases for the Unreal backdrop masters. Serve imports only from the checkout and
// the pinned local three.js package. The saved PNGs have the same orientation as GLTFExporter base-colour images.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './sources.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const three = process.env.THREE_DIR || path.join(ROOT, 'node_modules/three');
const out = path.join(ROOT, 'tools/unreal-engine/backdrop-textures');
const check = process.argv.includes('--check');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.host === 'localhost' && u.pathname === '/') {
      const imports = { three: '/three/build/three.module.js', 'three/addons/': '/three/examples/jsm/' };
      return route.fulfill({ contentType: 'text/html', body: '<script type="importmap">' + JSON.stringify({ imports }) + '</script>' });
    }
    if (u.host !== 'localhost' || !/^\/(three|src)\/[\w./-]+\.js$/.test(u.pathname)) return route.abort();
    const file = u.pathname.startsWith('/three/') ? path.join(three, u.pathname.slice(7)) : path.join(ROOT, u.pathname);
    await route.fulfill({ contentType: 'text/javascript', body: await fs.readFile(file) });
  });
  await page.goto('http://localhost/');
  const { images, tints } = await page.evaluate(async () => {
    const { SITE } = await import('/src/config.js');
    const { SRGBColorSpace, ClampToEdgeWrapping, RepeatWrapping } = await import('three');
    const { brickTexture, oldFacadeTexture } = await import('/src/surroundings.js');
    const { roofMap, roofColor } = await import('/src/roofsurface.js');
    const { schoolTextures, SCHOOL_ROOF_LEVEL } = await import('/src/schoolfacade.js');
    const { karpBrickTexture } = await import('/src/karpfacade.js');
    const { hepcatTexture } = await import('/src/hepcat.js');
    const textures = { Roof: roofMap(), HistoricBrick: brickTexture(), CampusBrick: schoolTextures().brick,
      KarpBrick: karpBrickTexture(), HepCat: hepcatTexture(), Villa: oldFacadeTexture() };
    const roofs = { West: roofColor(SITE.west.roof), East: roofColor(SITE.east.roof), North: roofColor(SITE.north.roof),
      Karp: roofColor(SITE.west.karp.colors.roof), Campus: roofColor(0xffffff, SCHOOL_ROOF_LEVEL),
      South: roofColor(), HepCat: roofColor(0x2c3034) };
    const images = Object.fromEntries(Object.entries(textures).map(([name, texture]) => {
      const wrap = name === 'HepCat' ? ClampToEdgeWrapping : RepeatWrapping;
      if (texture.colorSpace !== SRGBColorSpace || texture.wrapS !== wrap || texture.wrapT !== wrap)
        throw Error(name + ': source canvas colour space or wrapping changed');
      const source = texture.image;
      const canvas = document.createElement('canvas');
      canvas.width = source.width; canvas.height = source.height;
      const g = canvas.getContext('2d');
      if (texture.flipY) { g.translate(0, canvas.height); g.scale(1, -1); }
      g.drawImage(source, 0, 0);
      return [name, canvas.toDataURL('image/png').split(',')[1]];
    }));
    return { images, tints: Object.fromEntries(Object.entries(roofs).map(([name, color]) => [name, color.toArray()])) };
  });
  const { materials } = JSON.parse(await fs.readFile(path.join(ROOT, 'tools/unreal-engine/material-map.json'), 'utf8'));
  for (const [name, tint] of Object.entries(tints)) {
    const actual = materials['/Game/Lunden/Generated/BackdropMaterials/MI_LundenBackdrop' + name + 'Roof'].params.BaseColor;
    if (tint.some((value, i) => Math.abs(actual[i] - value) > 1e-8)) throw Error(name + ': update the roof’s linear BaseColor to ' + tint);
  }
  if (!check) await fs.mkdir(out, { recursive: true });
  for (const [name, value] of Object.entries(images)) {
    const file = path.join(out, name + '.png'), data = Buffer.from(value, 'base64');
    if (check) {
      if (!data.equals(await fs.readFile(file))) throw Error(name + ': web canvas differs from checked-in PNG');
    } else await fs.writeFile(file, data);
    console.log(name, data.length, 'bytes');
  }
} finally { await browser.close(); }
