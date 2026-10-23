// Normal World/quality, exact #1459 production-step order. No test mode or budget/quality overrides.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {launch, open} = require('./testkit.cjs');
const base = process.argv[2] || 'http://localhost:8159', out = process.argv[3] || '/tmp/patio1459';
const phone = process.argv.includes('--phone'); fs.mkdirSync(out, {recursive:true});
(async () => {
  const browser = await launch();
  try {
    const {page} = await open(browser, `${base}/?shot&cloud=&time=12&month=7&weather=clear&freeze${phone?'&lowmem':''}`, {
      test:false, viewport:phone?{width:844,height:390}:{width:1280,height:800},
      contextOptions:phone?{isMobile:true,hasTouch:true}:{},
      timeout:300000
    });
    const errors=[];page.on('pageerror', e=>errors.push(e.message));
    await page.waitForFunction(()=>__app.loadingEl.hidden || __app.loadingEl.classList.contains('done'),null,{timeout:300000});
    await page.evaluate(() => { const a=__app;a.renderer.setAnimationLoop(null);document.getElementById('start-touch')?.click(); });
    const setup = await page.evaluate(phone => {
      const a=__app; if(a.testMode || a.quality.level!==3 || a.quality.max!==3) throw Error('Expected normal maximum quality3');
      if (!!a.siteInstances === phone) throw Error('Unexpected phone/desktop adapter branch');
      const boards=[a.book.model.children[1],a.book.model.children[2]];
      const groups=boards.map(o=>o.geometry.groups.map(g=>({...g})));
      for(const o of boards)if(o.geometry.index.count!==36 || o.material.length!==6)throw Error('Unexpected book source');
      const sources=(a.siteInstances?.sources??[]).map(o=>({o,g:o.geometry,material:o.material,matrix:o.instanceMatrix,array:o.instanceMatrix.array,bytes:Array.from(o.instanceMatrix.array),count:o.count,raycast:o.raycast,cast:o.castShadow}));
      const T=a.player.pos.constructor, ray=new (a.focus().raycaster.constructor)();ray.layers.enable(7);
      const physical=sources.filter(s=>!s.o.userData.carBatch&&s.o.name!=='car-far').slice(0,4).map(({o})=>{const m=o.instanceMatrix.array;const p=new T(m[12],m[13],m[14]);o.localToWorld(p);ray.set(p.clone().add(new T(0,20,0)),new T(0,-1,0));return {o,origin:ray.ray.origin.clone(),hits:ray.intersectObject(o).map(h=>[h.distance,h.instanceId])};});
      window.__cornerProof={boards,groups,sources,physical,phone};
      window.__cornerToggle=current=>{
        if(!phone){a.colorFrustum.enabled=current;a.siteInstances.enabled=current;}
        boards.forEach((o,i)=>{o.geometry.groups=current?groups[i].map(g=>({...g})):Array.from({length:6},(_,i)=>({start:i*6,count:6,materialIndex:i}));});
      };
      window.__cornerMeasure=()=>{
        const r=a.renderer,rb=r.renderBufferDirect,sm=r.shadowMap.render,auto=r.info.autoReset;let inShadow=false;
        const result={calls:0,tris:0,shadowCalls:0,casters:{}};
        r.info.autoReset=false;
        r.shadowMap.render=function(){inShadow=true;try{return sm.apply(this,arguments)}finally{inShadow=false}};
        r.renderBufferDirect=function(camera,scene,g,m,o){const t=r.info.render.triangles,res=rb.apply(this,arguments),n=r.info.render.triangles-t;
          if(inShadow){result.shadowCalls++;const v=result.casters[o.uuid]??={tris:0,mask:o.layers.mask};v.tris+=n;}
          else if(!r.getRenderTarget()){result.calls++;result.tris+=n;}return res;};
        r.shadowMap.needsUpdate=true;
        try{r.render(a.scene,a.camera);}finally{r.renderBufferDirect=rb;r.shadowMap.render=sm;r.info.autoReset=auto;}
        return result;
      };
      return {quality:a.quality.level,max:a.quality.max,phone,viewport:[innerWidth,innerHeight],sources:sources.length};
    }, phone);
    const results={setup,views:[]};
    const poses=phone?['corner']:['corner','entrance','garage'];
    for(const pose of poses){
      await page.evaluate(pose=>{
        const a=__app;
        if(pose==='corner'){a.player.spawn(6.5,19,0);a.step(1/60);a.camera.lookAt(3,.7,17.2);a.step(1/60);}
        if(pose==='entrance'){a.player.spawn(2.875,-12,Math.PI);a.camera.rotation.x=8*Math.PI/180;a.step(1/60);}
        if(pose==='garage'){a.player.spawn(-46,21,-Math.PI/2);a.player.pos.y=-3;a.player.eyeY=-1.38;a.camera.position.y=-1.38;a.camera.rotation.x=0;a.step(1/60);}
      },pose);
      const entry={pose};
      for(const [name,current]of [['before',false],['after',true]]){
        entry[name]=await page.evaluate(current=>{__cornerToggle(current);return __cornerMeasure();},current);
        await page.screenshot({path:path.join(out,`${pose}-${name}.png`),timeout:120000});
      }
      assert.deepEqual(entry.after.casters,entry.before.casters,`${pose}: fresh shadow caster triangles/masks`);
      if(pose==='corner'){const [calls,tris]=phone?[370,950000]:[520,1000000];assert(entry.after.calls<=calls,`corner calls ${entry.after.calls}`);assert(entry.after.tris<=tris,`corner triangles ${entry.after.tris}`);} // #1498: the phone budget too
      results.views.push(entry);
      fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));
    }
    results.identity=await page.evaluate(()=>{
      const a=__app,{sources,physical}=__cornerProof,ray=new (a.focus().raycaster.constructor)(),T=a.player.pos.constructor;ray.layers.enable(7);
      // Car LOD legitimately changes its counts/buffers between poses; verify identity and current shadow/ray sources.
      for(const s of sources){if(s.o.geometry!==s.g||s.o.material!==s.material||s.o.instanceMatrix!==s.matrix||s.o.instanceMatrix.array!==s.array||s.o.raycast!==s.raycast||s.o.castShadow!==s.cast)throw Error('Source identity changed');}
      for(const p of physical){ray.set(p.origin,new T(0,-1,0));const hits=ray.intersectObject(p.o).map(h=>[h.distance,h.instanceId]);if(JSON.stringify(hits)!==JSON.stringify(p.hits))throw Error('Physical hits changed');}
      const book=a.book,model=book.model,home=model.position.clone();book.take();const held=book.held;book.putBack();
      return {sources:sources.length,positiveRays:physical.filter(p=>p.hits.length).length,bookTaken:held,bookRestored:!book.held&&model.position.distanceTo(home)<1e-8,level:a.quality.level,max:a.quality.max};
    });
    assert(results.identity.bookTaken&&results.identity.bookRestored);if(!phone)assert(results.identity.positiveRays>0);assert.equal(results.identity.level,3);assert.deepEqual(errors,[]);
    results.errors=errors;fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify({setup,views:results.views.map(({pose,before,after})=>({pose,before:[before.calls,before.tris],after:[after.calls,after.tris]})),identity:results.identity,errors},null,2));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
