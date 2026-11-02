// #1817: one continuous real Player walk over the stile and through the full paddock; no teleport/flight between waypoints.
// tools/browsertest.sh node tools/paddockwalktest.cjs GAME OUT [--baseline]
const fs = require('node:fs'), path = require('node:path'), kit = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8933', out = process.argv[3] || '/tmp/paddockwalk1817', baseline = process.argv.includes('--baseline');
const results = []; let pass = true;
const check = (ok, name, data) => { results.push({ ok: !!ok, name, data }); pass &&= !!ok; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${data ? ' '+JSON.stringify(data) : ''}`); };
(async () => {
 const browser = await kit.launch();
 try {
  const ctx = await browser.newContext({ viewport: kit.SMALL, deviceScaleFactor: 1 });
  if (process.env.THREE_DIR) await ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', route => route.fulfill({
    path: path.join(process.env.THREE_DIR, new URL(route.request().url()).pathname.split('three@0.170.0/')[1]), contentType: 'text/javascript',
  }));
  const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/?shot&cloud=&month=6&time=13&freeze&weather=clear&at=-112,223,90,0&test=lazy`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__app?.paddock, null, { timeout: 180000, polling: 100 });
  await kit.skipNameDialog(page); fs.mkdirSync(out, { recursive: true });
  const entry = await page.evaluate(async () => {
    const A = window.__app, p = A.player, g = await import('/src/paddockgeo.js'), fw = await import('/src/farwalk.js'), C = await import('/src/config.js');
    const terrain = await import('/src/surroundings.js'), S = g.stile, dt = 1 / 60;
    const events = []; p.onWaterRescue = kind => events.push(kind);
    let updates = 0, flying = 0, maxGap = 0;
    const walk = points => {
      for (const [x, z] of points) {
        const limit = 10 + Math.hypot(p.pos.x - x, p.pos.z - z) / 1.6; let t = 0;
        while (Math.hypot(p.pos.x - x, p.pos.z - z) > .18) {
          A.camera.rotation.set(0, Math.atan2(-(x - p.pos.x), -(z - p.pos.z)), 0, 'YXZ'); p.keys.add('KeyW');
          p.update(dt); updates++; if (p.flying || p.aloft) flying++;
          maxGap = Math.max(maxGap, p.pos.y - p.groundAt(p.pos.x, p.pos.z, p.pos.y));
          if ((t += dt) > limit) { p.keys.delete('KeyW'); return { ok: false, target: [x,z], at: p.pos.toArray() }; }
        }
      }
      p.keys.delete('KeyW'); return { ok: true, at: p.pos.toArray() };
    };
    // Only the initial test start is spawned. Every subsequent destination is reached through production Player.update.
    p.spawn(S.x - S.nx * 2.6, S.z - S.nz * 2.6, 0);
    const entry = walk([[S.x + S.nx * 3.2, S.z + S.nz * 3.2]]);
    const inside = g.insideFence(p.pos.x, p.pos.z);
    const safe = (x,z) => g.insideFence(x,z,1.2) && fw.slopeAt(x,z,terrain.groundY(x,z)).s < C.WALK.maxSlope * .8 && fw.farWalls(x,z).every(s => {
      const dx=s[2]-s[0], dz=s[3]-s[1], l=dx*dx+dz*dz||1, t=Math.max(0,Math.min(1,((x-s[0])*dx+(z-s[1])*dz)/l));
      return Math.hypot(x-s[0]-t*dx,z-s[1]-t*dz)>C.PLAYER.radius+.35;
    });
    const nodes=new Map(), step=1.5;
    for(let ix=0;ix<=112;ix++)for(let iz=0;iz<=82;iz++){
      const x=-280+ix*step,z=210+iz*step;if(safe(x,z))nodes.set(ix+','+iz,{x,z,ix,iz});
    }
    const nearest=(x,z)=>[...nodes.values()].reduce((a,b)=>!a||Math.hypot(b.x-x,b.z-z)<Math.hypot(a.x-x,a.z-z)?b:a,null);
    const route=(x,z)=>{
      const start=nearest(p.pos.x,p.pos.z),goal=nearest(x,z), queue=[start], prev=new Map([[start,null]]);
      for(let i=0;i<queue.length&&!prev.has(goal);i++)for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){
        const n=nodes.get((queue[i].ix+dx)+','+(queue[i].iz+dz));if(!n||prev.has(n)||!safe((n.x+queue[i].x)/2,(n.z+queue[i].z)/2))continue;prev.set(n,queue[i]);queue.push(n);
      }
      if(!prev.has(goal))throw Error('No safe paddock path');const path=[];for(let n=goal;n;n=prev.get(n))path.push([n.x,n.z]);return path.reverse();
    };
    const pts=[...nodes.values()], north=pts.reduce((a,b)=>b.z<a.z?b:a),west=pts.reduce((a,b)=>b.x<a.x?b:a),south=pts.reduce((a,b)=>b.z>a.z?b:a);
    window.__paddockWalk={A,p,g,fw,C,S,walk,route,events,targets:{north:[north.x,north.z],west:[west.x,west.z],south:[south.x,south.z]},summary:()=>({updates,flying,maxGap,events,at:p.pos.toArray()})};
    return {...entry,inside,targets:window.__paddockWalk.targets,walkBounds:C.WALK};
  });
  check(entry.ok && entry.inside, 'walk from outside over the existing stile ends inside', entry);
  for (const name of ['north','west','south']) {
    const result = await page.evaluate(name => { const t=window.__paddockWalk;return t.walk(t.route(...t.targets[name])); }, name);
    if (baseline && name==='west') {
      check(!result.ok && result.at[0] > -260.5, 'baseline reproduces the invisible western boundary inside the paddock', result);
      await kit.shot(page,path.join(out,'before-west-blocked.png')); break;
    }
    check(result.ok, `continuous ground walk reaches ${name} paddock`, result);
    if(name==='west'){
      await kit.shot(page,path.join(out,'after-west-reached.png'));
      const fence=await page.evaluate(()=>{const t=window.__paddockWalk,r=t.walk([[t.p.pos.x-6,t.p.pos.z]]);return{...r,inside:t.g.insideFence(t.p.pos.x,t.p.pos.z),clearOfOuterWall:t.p.pos.x>t.C.WALK.x0+1};});
      check(!fence.ok&&fence.inside&&fence.clearOfOuterWall,'the actual western fence still stops the same walk before the global boundary',fence);
    }
    if(!result.ok)break;
  }
  if(!baseline && pass){
    const exit=await page.evaluate(()=>{const t=window.__paddockWalk,{S}=t;const back=t.walk(t.route(S.x+S.nx*3.2,S.z+S.nz*3.2));const out=t.walk([[S.x+S.nx*2,S.z+S.nz*2],[S.x-S.nx*2.6,S.z-S.nz*2.6]]);return{back,out,outside:!t.g.insideFence(t.p.pos.x,t.p.pos.z),...t.summary()};});
    check(exit.back.ok&&exit.out.ok&&exit.outside,'same walk returns over the stile to the footpath',exit);
    check(exit.flying===0&&exit.events.length===0,'route uses ground physics without flight, water rescue or building rescue',exit);
    const blockers=await page.evaluate(()=>{const t=window.__paddockWalk,s=t.g.fenceSegments(),gate=s[t.g.gateSpan],cross=p=>t.fw.farWalls(...p).some(q=>q.every((v,i)=>Math.abs(v-gate[i])<1e-7));return{gate:cross([(gate[0]+gate[2])/2,(gate[1]+gate[3])/2]),fenceSegments:s.length,underWater:t.fw.inWater(23.5,123,t.C.SITE.bridges.waterY-1)};});
    check(blockers.gate&&blockers.fenceSegments>100&&blockers.underWater,'closed gate/fence collision and river water guard remain in force',blockers);
  }
  check(errors.length===0,'no browser page errors',errors);
  fs.writeFileSync(path.join(out,baseline?'baseline.json':'result.json'),JSON.stringify({pass,baseline,results},null,2));
 } finally {await browser.close();}
 if(!pass)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
