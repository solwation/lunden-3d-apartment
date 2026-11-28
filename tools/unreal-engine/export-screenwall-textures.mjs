// #2443: bake the actual screen-wall colour canvas and aligned scalar map on UV0.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './sources.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const three = path.join(ROOT, 'node_modules/three');
const out = path.join(ROOT, 'tools/unreal-engine/screenwall-textures');
const check = process.argv.includes('--check');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.host === 'localhost' && url.pathname === '/') return route.fulfill({contentType: 'text/html', body:
      '<script type="importmap">' + JSON.stringify({imports: {three: '/three/build/three.module.js'}}) + '</script>'});
    if (url.host !== 'localhost' || !/^\/(three|src)\/[\w./-]+\.js$/.test(url.pathname)) return route.abort();
    const file = url.pathname.startsWith('/three/') ? path.join(three,url.pathname.slice(7)) : path.join(ROOT,url.pathname);
    return route.fulfill({contentType: 'text/javascript', body: await fs.readFile(file)});
  });
  await page.goto('http://localhost/');
  const images = await page.evaluate(async () => {
    const { screenWallTexture } = await import('/src/screenwall.js');
    const { screenWallSurface } = await import('/src/screenwallsurface.js');
    const { SRGBColorSpace, NoColorSpace, RepeatWrapping, ClampToEdgeWrapping } = await import('three');
    const colour = screenWallTexture(), surface = screenWallSurface().roughnessMap;
    if (colour.colorSpace !== SRGBColorSpace || surface.colorSpace !== NoColorSpace) throw Error('Unexpected source colour spaces');
    const images = {};
    for (const [name,texture] of Object.entries({Colour: colour, Surface: surface})) {
      if (texture.wrapS !== RepeatWrapping || texture.wrapT !== ClampToEdgeWrapping) throw Error('Unexpected source wrapping');
      const source = texture.image, canvas = document.createElement('canvas');
      canvas.width = source.width; canvas.height = source.height;
      const ctx = canvas.getContext('2d');
      if (source.data) ctx.putImageData(new ImageData(new Uint8ClampedArray(source.data),source.width,source.height),0,0);
      else {
        // Same orientation as GLTFExporter and the existing backdrop baker: UV v=0 samples PNG row0.
        if (texture.flipY) { ctx.translate(0,canvas.height); ctx.scale(1,-1); }
        ctx.drawImage(source,0,0);
      }
      // Both source maps must put the unchanged cream rail at v=.995.
      const px = ctx.getImageData(0,canvas.height-1,1,1).data;
      if (name === 'Colour' && (px[0] !== 214 || px[1] !== 207 || px[2] !== 182)) throw Error('Colour rail orientation');
      if (name === 'Surface' && (px[0] !== 255 || px[1] !== Math.round(.85*255))) throw Error('Surface rail orientation');
      images[name] = canvas.toDataURL('image/png').split(',')[1];
    }
    return images;
  });
  if (!check) await fs.mkdir(out,{recursive:true});
  for (const [name,b64] of Object.entries(images)) {
    const file = path.join(out,name+'.png'), data = Buffer.from(b64,'base64');
    if (check) { if (!data.equals(await fs.readFile(file))) throw Error(name+': source texture differs'); }
    else await fs.writeFile(file,data);
    console.log(name,data.length,'bytes');
  }
} finally { await browser.close(); }
