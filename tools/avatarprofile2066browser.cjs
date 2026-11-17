// #2066: matched profile, every head-slider extreme, skin/beard/hat views, before/after software timings.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const [base = 'http://localhost:8178', out = 'docs/verification/2066', which = 'both', mode = 'full'] = process.argv.slice(2);
const baseline = process.env.BASELINE || '1a5b33ed';
const files = ['src/avatar.js', 'src/config.js', 'src/avatarsculpt.js'];
const proof = { baseline, triangles: {}, errors: {}, frameMs: {}, info: {} };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    for (const phase of which === 'both' ? ['before', 'after'] : [which]) {
      const dir = phase === 'before' ? path.join(out, 'before') : out;
      fs.mkdirSync(dir, { recursive: true });
      const page = await browser.newPage({ viewport: { width: 2600, height: 3200 } }), errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' || /THREE\.WebGLProgram/i.test(m.text())) errors.push(m.text()); });
      if (phase === 'before') for (const f of files) {
        const body = execFileSync('git', ['show', `${baseline}:${f}`], { maxBuffer: 16e6 });
        await page.route(`**/${f}`, (r) => r.fulfill({ contentType: 'text/javascript', body }));
      }
      await page.goto(`${base}/tools/avatarexpr.html`);
      await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
      proof.triangles[phase] = await page.evaluate(async (cell) => {
        const THREE = await import('three'), { Avatar } = await import('/src/avatar.js'), { decodeAvatarLook, avatarEyeHeight } = await import('/src/config.js');
        document.querySelector('canvas').remove();
        const C = cell, COLS = 4, ROWS = 13, renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1); renderer.setSize(C * COLS, C * ROWS); renderer.setScissorTest(true); document.body.appendChild(renderer.domElement);
        const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfc6cc);
        const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7f72, 1.5); scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff2e0, 2.4); scene.add(sun, sun.target);
        const looks = [
          ['000000100', {skin:0xf1c9a8}], ['000000100',{skin:0xb27d59}], ['000000100',{skin:0x6b4430}],
          ['000000103',{skin:0xb27d59,hat:1,phones:1}], ['000000102',{skin:0xf1c9a8,hat:3}],
          ...[0,8].flatMap(headWidth=>[0,8].flatMap(headLength=>[0,8].map(jaw=>['000000100',{headWidth,headLength,jaw,skin:0xb27d59}]))),
        ];
        const av = looks.map(([code, ext, suit]) => {
          const lk = { ...decodeAvatarLook(code, 'contour2043'), tall: 1, build: 1, glasses: 0, ...ext };
          const a = new Avatar(lk); a.object.position.set(0, 1.62 - avatarEyeHeight(lk), 0); a.object.rotation.y = 0; scene.add(a.object);
          if (suit) a.setSuit(true);
          if (a.eyes) a.eyes.blink.wait = 1e9;
          for (let i = 0; i < 60; i++) a.update(1 / 60, {});
          a.object.visible = false; return a;
        });
        const cam = new THREE.PerspectiveCamera(17, 1, 0.05, 50);
        const VIEWS = [[0, 0.03], [0.75, 0.03], [Math.PI / 2, 0.03], [0.6, -0.32]]; // [yaw, camera height m relative to the aim]
        window.__sheet = (backlight) => {
          sun.position.set(backlight ? -0.6 : 1.5, 3, backlight ? -4 : 4); hemi.intensity = backlight ? 0.8 : 1.5;
          av.forEach((a, row) => VIEWS.forEach(([yaw, dy], col) => {
            for (const b of av) b.object.visible = b === a;
            a.update(1 / 60, {}); const u = a.material.userData.u; u.uBlink.value = 0;
            const h = a.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.045, 0.02));
            cam.position.set(h.x + Math.sin(yaw) * 1.0, h.y + dy, h.z + Math.cos(yaw) * 1.0); cam.lookAt(h);
            renderer.setViewport(col * C, (ROWS - 1 - row) * C, C, C); renderer.setScissor(col * C, (ROWS - 1 - row) * C, C, C);
            renderer.render(scene, cam);
          }));
        };
        window.__cost = () => { renderer.setSize(C,C);renderer.setViewport(0,0,C,C);renderer.setScissor(0,0,C,C);for(const a of av)a.object.visible=a===av[0];const h=av[0].bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.045,.02));cam.position.set(h.x+.8,h.y+.03,h.z+.6);cam.lookAt(h);const gl=renderer.getContext(),px=new Uint8Array(4);const frame=()=>{renderer.render(scene,cam);gl.readPixels(Math.floor(C/2),Math.floor(C/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,px)};for(let i=0;i<8;i++)frame();const t=performance.now();for(let i=0;i<16;i++)frame();return{ms:(performance.now()-t)/16,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixel:[...px]}; };
        window.__info = () => { const stats=av.map(a=>({triangles:a.mesh.geometry.attributes.position.count/3,bones:a.mesh.skeleton.bones.length}));return stats; };
        return av.map((a) => a.mesh.geometry.attributes.position.count / 3);
      }, Number(process.env.CELL) || 240);
      if(mode==='full') for (const [backlight, name] of [[false, 'contour.png'], [true, 'contour-backlight.png']]) {
        await page.evaluate((b) => window.__sheet(b), backlight);
        await page.locator('canvas').screenshot({ path: path.join(dir, name) });
      }
      proof.frameMs[phase]=await page.evaluate(()=>window.__cost());
      proof.info[phase]=await page.evaluate(()=>window.__info());
      proof.errors[phase] = errors;
      await page.close();
    }
    if(mode==='full'){ const compose=await browser.newPage();
    for(const name of ['contour.png','contour-backlight.png']){
      const images=[fs.readFileSync(path.join(out,'before',name)).toString('base64'),fs.readFileSync(path.join(out,name)).toString('base64')];
      await compose.setContent('<canvas></canvas>');
      await compose.evaluate(async images=>{const c=document.querySelector('canvas'),im=[];for(const s of images){const i=new Image();i.src='data:image/png;base64,'+s;await i.decode();im.push(i)}c.width=im[0].width*2+12;c.height=im[0].height+26;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.font='18px sans-serif';g.fillStyle='#111';g.fillText('Före',8,20);g.fillText('Efter #2066',im[0].width+20,20);g.drawImage(im[0],0,26);g.drawImage(im[1],im[0].width+12,26)},images);
      await compose.locator('canvas').screenshot({path:path.join(out,name.replace('.png','.jpg'))});
    }
    }
  } finally { await browser.close(); }
  if (which === 'both') fs.writeFileSync(path.join(out, mode==='full'?'browser.json':'timing.json'), JSON.stringify(proof, null, 2) + '\n');
  const bad = Object.values(proof.errors).flat();
  console.log(bad.length ? 'FAIL ' + JSON.stringify(bad) : 'PASS', JSON.stringify(proof.triangles), JSON.stringify(proof.frameMs));
  if (bad.length) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
