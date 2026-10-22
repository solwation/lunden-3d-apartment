// #1384: actual World, original/current sign atlas pairs and unchanged room draw cost.
// BASELINE_JS points at the pre-change src/clubhouse.js for retained comparison.
const fs=require('node:fs'),assert=require('node:assert/strict'),kit=require('./testkit.cjs');
const [game='http://localhost:8191',out='/tmp/lekstuga1384']=process.argv.slice(2);
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await kit.launch();try{
 const page=await browser.newPage({viewport:{width:1000,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/baseline-clubhouse.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.BASELINE_JS,'utf8')}));
 await page.goto(`${game}/?shot&test=lazy&cloud=&mp=0&freeze&time=12&month=6`,{waitUntil:'commit'});await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:180000});
 const geometry=await page.evaluate(async()=>{const a=__app,{PLAYROOM:R,decodeAvatarLook}=await import('/src/config.js'),old=await import('/src/baseline-clubhouse.js'),current=await import('/src/clubhouse.js');
 const p=current.clubhouseLayout(),before=old.clubhouseSigns(p),after=current.clubhouseSigns(p);const arrays=m=>Object.fromEntries(Object.entries(m.geometry.attributes).map(([k,v])=>[k,[...v.array]]));
 if(JSON.stringify(arrays(before))!==JSON.stringify(arrays(after))||JSON.stringify([...before.geometry.index.array])!==JSON.stringify([...after.geometry.index.array]))throw Error('sign geometry changed');
 const mesh=a.world.playroom.object.getObjectByName('clubhouse-signs');window.neon={mesh,before:before.material.map,after:mesh.material.map,plan:p};
 const c=after.material.map.image,ctx=c.getContext('2d'),swatch=[...ctx.getImageData(R.clubhouse.swatch/2,R.clubhouse.swatch/2,1,1).data];
 a.showOverlay(false);a.avatarCustomizer.setLook({...decodeAvatarLook('241302112','me'),height:140});a.use({kind:'playhouse'});return{triangles:after.geometry.index.count/3,swatch};
 });assert.deepEqual(geometry.swatch,[255,246,220,255]);await page.waitForFunction(()=>__app.player.inPlayroom);await page.waitForTimeout(300);
 await page.evaluate(()=>{__app.renderer.setAnimationLoop(null);__app.touch.enabled=false;__app.world.playroom.setDisco(false);__app.testMode.setFull(true);});
 const pairs=[];
 for(let i=0;i<4;i++){
  const counts=[];for(const version of ['before','after']){
   counts.push(await page.evaluate(async({i,version})=>{const a=__app,{PLAYROOM:R}=await import('/src/config.js'),s=neon.plan.signs[i];
    a.player.spawn(R.x+s.x,R.z+(i===0?4.6:3.9),0);a.camera.position.set(a.player.pos.x,1.4,a.player.pos.z);a.camera.lookAt(R.x+s.x,s.y,R.z+s.z);a.camera.updateMatrixWorld(true);
    neon.mesh.material.map=neon[version];neon.mesh.material.needsUpdate=true;a.step(0);a.renderer.info.reset();a.testMode.draw();return{calls:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles};
   },{i,version}));await page.screenshot({path:`${out}/${i}-${version}.png`});
  }assert.deepEqual(counts[0],counts[1]);pairs.push(counts[1]);
 }
 const hidden=await page.evaluate(()=>{const a=__app,r=a.world.playroom;r.setInside(false);let lights=0;r.object.traverse(o=>{if(o.isLight)lights++;});return{visible:r.object.visible,lights};});assert.equal(hidden.visible,false);assert.equal(hidden.lights,0);assert.deepEqual(errors,[]);
 fs.writeFileSync(`${out}/result.json`,JSON.stringify({geometry,pairs,hidden,errors},null,2));console.log('PASS neon sign pairs, exact sign geometry, ceiling swatch, unchanged draw/triangle counts, no lights and outside hidden',{geometry,pairs});
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
