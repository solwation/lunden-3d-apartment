// #2203: same real-room view with the new halo/emissive falloff bypassed and enabled, plus actual switch/power/quality.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
const views = {
  living: { spawn: [3.6, 8.2, 0], from: [3.64, 1.4, 8.65], at: [3.64, 1.8, 10.8], fov: 90 },
  paper: { spawn: [3.2, 8.9, 0, 0, 3.25], from: [3.1, 4.6, 8.8], at: [3.8, 5.1, 9.8], fov: 80 },
};
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
 const errors = [], result = { views: {}, checks: {} };
 try {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /shader|VALIDATE_STATUS|compile error/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${base}/?shot&quality=3&time=21.5&month=11&day=15&freeze&weather=clear&lights&at=3.6,8.2,0,0`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__app?.lights?.halos && window.__app?.renderer, null, { timeout: 300000, polling: 250 });
  await page.addStyleTag({ content: '#player-dialog, #overlay, #loading, #hud, .touch-ui, #note, #toast { display:none !important }' });
  await page.waitForTimeout(1200);
  for (const [name, v] of Object.entries(views)) {
   await page.evaluate(s => { const a = window.__app; a.showOverlay?.(false); a.player.spawn(...s); }, v.spawn);
   await page.waitForTimeout(800);
   result.views[name] = {};
   for (const enabled of [false, true]) {
    const data = await page.evaluate(({ v, enabled }) => {
     const a = window.__app, l = a.lights, r = a.renderer, c = a.camera;
     r.setAnimationLoop(null); l.halos.enabled = enabled;
     const materials = new Set([...l.rooms.values()].flatMap(R => R.mats).concat(l.floorLamps.map(f => f.spec.shade)));
     for (const m of materials) {
      const s = m?.userData.shadeEmission; if (!s) continue;
      s.after ??= m.emissiveMap;
      if (s.before) s.enabled.value = enabled ? 1 : 0;
      else { m.emissiveMap = enabled ? s.after : s.before; m.needsUpdate = true; }
     }
     for (let i = 0; i < 10; i++) l.update(v.from[1] > 3 ? 1 : 0, { x:v.from[0], y:v.from[1], z:v.from[2] }, 1 / 30);
     c.position.set(...v.from); c.fov = v.fov; c.updateProjectionMatrix(); c.lookAt(...v.at); c.updateMatrixWorld(true);
     a.detail()?.update?.(c); r.render(a.scene,c); r.render(a.scene,c);
     return { image:r.domElement.toDataURL('image/png'), calls:r.info.render.calls, triangles:r.info.render.triangles, programs:r.info.programs.length,
      halos:l.halos.mesh.count, visible:l.halos.mesh.visible, opacity:l.halos.mesh.material.opacity, daylight:l.halos.daylight, exposure:r.toneMappingExposure };
    }, { v, enabled });
    const phase = enabled ? 'after' : 'before', folder = enabled ? out : path.join(out,'before'); fs.mkdirSync(folder,{recursive:true});
    fs.writeFileSync(path.join(folder,`${name}.png`),Buffer.from(data.image.split(',')[1],'base64')); delete data.image;
    result.views[name][phase] = data;
   }
  }
  result.checks = await page.evaluate(() => {
   const a=window.__app,l=a.lights,h=l.halos,r=a.renderer;
   const p={x:3.6,y:1.6,z:8.5};
   // Actual existing lamp toggles, room switches and supply API, retaining their remembered state.
   for (const f of l.floorLamps) f.set(false);
   for (const R of l.rooms.values()) if (R.on) R.toggle();
   l.update(0,p); const allOff=!h.mesh.visible;
   const f=l.floorLamps[0]; f.toggle(); l.update(0,p); const on=h.mesh.visible && h.on.some(k=>k>0);
   l.setSupply(0); l.update(0,p); const powerCut=!h.mesh.visible;
   l.setSupply(1); l.update(0,p); const restored=h.mesh.visible;
   a.quality.set(0); l.update(0,p); const lowest=!h.mesh.visible;
   a.quality.set(3); l.update(0,p); const qualityRestored=h.mesh.visible;
   l.updateAuto(1,0); l.update(0,p); const daylight=!h.mesh.visible;
   l.updateAuto(0,0); f.set(true); l.update(0,p);
   const lamp=f.room.lamps[0],old=lamp.pos.clone(); lamp.pos.x+=0.3; l.update(0,p);
   const index=h.entries.findIndex(e=>e.lamp===lamp), moved=Math.abs(h.mesh.instanceMatrix.array[index*16+12]-lamp.pos.x)<1e-5;
   lamp.pos.copy(old); l.update(0,p);
   return {allOff,on,powerCut,restored,lowest,qualityRestored,daylight,moved};
  });
  for (const [k,v] of Object.entries(result.checks)) assert.equal(v,true,k);
  result.errors=errors; assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
