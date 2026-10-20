// #1397: actual winter rugs, body pose, seasons, culling and real focus/use in the full World.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs'), assert = require('node:assert/strict');
const base = process.argv[2] || 'http://localhost:8242', out = process.argv[3] || '/tmp/ponyblankets';fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { let a;Object.defineProperty(window, '__app', { get: () => a, set: v => { a = v;v.renderer.setAnimationLoop(null); } }); });
  try {
    await page.goto(base + '/?shot&time=12&month=1&weather=clear&freeze&cloud=');
    await page.waitForFunction(() => window.__app?.paddock?.blankets, null, { timeout: 300000 });
    const result = await page.evaluate(async () => {
      const a = __app, p = a.paddock, b = p.blankets, s = p.spots.shelter, { applySeason } = await import('/src/seasons.js'), T = await import('three');a.showOverlay(false);
      const R = [], images = [], add = (name, ok, data) => R.push({ name, ok, data });
      const aim = (x, z, y, target) => { a.player.spawn(x, z, 0);a.step(0);a.camera.position.set(x, y, z);a.camera.lookAt(...target);a.camera.updateMatrixWorld(true);p.update(.01);a.scene.updateMatrixWorld(true); };
      const draw = name => { a.renderer.render(a.scene, a.camera);images.push({ name, image: a.renderer.domElement.toDataURL('image/png') }); };
      aim(s.x + Math.sin(s.yaw) * 8, s.z + Math.cos(s.yaw) * 8, p.ground(s.x, s.z) + 1.7, [s.x, p.ground(s.x, s.z) + 1, s.z]);
      applySeason(7);p.update(.1, true, 0);applySeason(1);p.update(.1, true, 0);p.update(.1, false, 0);p.write();
      add('winter: two full-size occupants and two distinct rugs share the real body buffer', b.count === 2 && b.visible && p.mesh.visible && b.parent === p.mesh && b.instanceMatrix === p.mesh.instanceMatrix && p.ponies.every((q,i) => !q.gone && q.scale > .9 && Math.hypot(q.x-p.stable(i).x,q.z-p.stable(i).z)<.1) && b.instanceColor.array[0] !== b.instanceColor.array[3], { count: b.count, scale: p.ponies.map(q => q.scale) });
      const calls = () => { let n = 0;const r = a.renderer, old = r.renderBufferDirect;r.renderBufferDirect = function(c,s,g,m,o){ if(o===b&&!r.getRenderTarget())n++;return old.apply(this,arguments); };r.render(a.scene,a.camera);r.renderBufferDirect=old;return n; };
      add('one rug draw and 140 total rug triangles; no lights/textures/raycast', calls() === 1 && b.geometry.attributes.position.count / 3 * b.count === 140 && !b.material.map && !b.castShadow && new T.Raycaster().intersectObject(b).length === 0, {});draw('winter-front');
      const geometry=b.geometry,material=b.material;
      applySeason(7);p.update(.1);add('summer hides rugs with zero submissions and retains buffers', !b.visible && calls() === 0 && b.geometry === geometry && b.material === material, {});draw('summer-front');
      // Arrange a valid field start on existing waypoints; the real winter decision then routes them home.
      const starts=p.waypoints.filter(w=>{const d=Math.hypot(w[0]-s.x,w[1]-s.z);return d>12&&d<20;});
      p.ponies.forEach((q,i)=>{const w=starts.find(w=>i===0||Math.hypot(w[0]-p.ponies[0].x,w[1]-p.ponies[0].z)>4);q.x=w[0];q.z=w[1];q.y=p.ground(q.x,q.z);q.state='idle';q.left=0;q.target=q.goal=null;q.feedGoal=null;q.spot=null;});
      applySeason(1);let moved=0,walking=false,matched=true,amp=0;
      for(let i=0;i<100 && moved<.6;i++){const q=p.ponies[0],x=q.x,z=q.z;p.update(.1);moved+=Math.hypot(q.x-x,q.z-z);walking ||= q.state==='walk';amp=Math.max(amp,q.amp);matched &&= b.instanceMatrix===p.mesh.instanceMatrix;}
      const q=p.ponies[0],sn=Math.sin(q.yaw),cs=Math.cos(q.yaw);
      aim(q.x+cs*3.2+sn*.8,q.z-sn*3.2+cs*.8,q.y+1.3,[q.x,q.y+1,q.z]);draw('winter-walk-side');
      add('actual winter walk animates legs while the rugs retain the exact moving torso matrices', moved>.3 && walking && amp>.05 && matched && b.visible, {moved,walking,amp});
      // Use the actual main focus/use path while the rug is visible.
      a.touch.enabled=true;a.player.spawn(q.x-cs*1.35,q.z+sn*1.35,0);q.state='idle';q.left=99;p.update(.1);
      a.camera.position.set(a.player.pos.x,q.y+1.25,a.player.pos.z);a.camera.lookAt(q.x,q.y+1,q.z);a.camera.updateMatrixWorld(true);a.step(0);
      const f=a.focus().focused,score=a.totalScore();if(f?.kind==='pony')a.use(f);
      let ear=0,neck=0,head=0;for(let i=0;i<25;i++){p.update(.1);ear=Math.max(ear,q.ear);neck=Math.max(neck,q.neck);head=Math.max(head,Math.abs(q.headYaw));}
      add('real focus/use still pets the winter pony and animates its free head/ears', f?.kind==='pony' && a.totalScore()===score+1 && ear>.3 && neck>.35 && b.visible && b.instanceMatrix===p.mesh.instanceMatrix, {kind:f?.kind,ear,neck,head,score:a.totalScore()-score});draw('winter-pet-side');a.touch.enabled=false;
      const q2=p.ponies[1],ss=Math.sin(q2.yaw),cc=Math.cos(q2.yaw);aim(q2.x+cc*1.4+ss*2.4,q2.z-ss*1.4+cc*2.4,q2.y+1.1,[q2.x,q2.y+1,q2.z]);draw('winter-second-side');
      p.update(.1,true);const hidden=calls();p.update(.1,false);const back=calls();
      const saved=a.camera.position.clone();a.camera.position.x+=3000;p.update(.1);const far=calls();a.camera.position.copy(saved);p.update(.1);const returned=calls();
      applySeason(7);p.update(.1);const summer=calls();applySeason(1);p.update(.1);
      add('hidden/far/summer submit no rugs; near/winter restores the same meshes', hidden===0&&far===0&&summer===0&&back===1&&returned===1&&calls()===1&&b.geometry===geometry&&b.material===material,{hidden,far,summer,back,returned});
      if(p.feed){
        p.ponies.forEach((q,i)=>{p.restInShed(q,i);q.left=0;q.feedGoal=null;});p.feed.amount.fill(1);p.feed.next.fill(0);
        const eaten=Array.from(p.feed.eaten);let feeding=false,low=0;
        for(let i=0;i<120;i++){p.update(.1);feeding ||= p.ponies.some(q=>q.state==='feed');low=Math.max(low,...p.ponies.map(q=>q.neck));}
        add('combined feeding: winter rugs follow full-size eating ponies without blocking their lowered heads',feeding&&low>1.1&&p.feed.eaten.some((v,i)=>v>eaten[i])&&b.visible&&b.instanceMatrix===p.mesh.instanceMatrix,{feeding,neck:low,eaten:Array.from(p.feed.eaten).map((v,i)=>v-eaten[i])});
        aim(s.x+Math.sin(s.yaw)*7,s.z+Math.cos(s.yaw)*7,p.ground(s.x,s.z)+1.7,[s.x,p.ground(s.x,s.z)+1,s.z]);draw('winter-feeding-front');
      }
      return { R, images };
    });
    for(const r of result.R){console.log(r.ok?'PASS':'FAIL',r.name,JSON.stringify(r.data));}
    for(const i of result.images)fs.writeFileSync(`${out}/${i.name}.png`,Buffer.from(i.image.split(',')[1],'base64'));
    assert.deepEqual(errors,[],'no JavaScript exceptions');assert(result.R.every(r=>r.ok),'all rug checks pass');console.log('ALL PASS');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
