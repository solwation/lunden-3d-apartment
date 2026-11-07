// #1882 real-app check for the added outdoor cats: their loops in the actual scene, pictures of new cats in their areas, a meet/pet,
// their binder pages and the draw-call delta of the added cats at representative outdoor views (with them drawn vs hidden).
// Cloud: python3 tools/devserve.py 8182 . ; node tools/outdoorcats1882browser.cjs http://localhost:8182 docs/verification/1882
const fs=require('node:fs'),kit=require('./testkit.cjs');
const [base='http://localhost:8182',out='docs/verification/1882']=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
const result={checks:[],errors:[]},save=()=>fs.writeFileSync(out+'/browser.json',JSON.stringify(result,null,1));
const check=(ok,label,data)=>{result.checks.push({ok:!!ok,label,data});save();console.log(`${ok?'PASS':'FAIL'} ${label} ${JSON.stringify(data)}`);};
async function shot(p,file,frames=3){await p.evaluate(async n=>{const t=__app.testMode;t?.setFull(true);for(let i=0;i<n;i++){await new Promise(r=>requestAnimationFrame(()=>r()));t?.draw();}},frames);await p.screenshot({path:file,timeout:300000});await p.evaluate(()=>__app.testMode?.setFull(false));}
(async()=>{const browser=await kit.launch();try{
 const ctx=await browser.newContext({viewport:{width:960,height:600},deviceScaleFactor:2});await ctx.addInitScript(()=>{localStorage.setItem('lunden.name','Kattest');sessionStorage.setItem('lunden.nameSkipped','1');});
 const p=await ctx.newPage();p.on('pageerror',e=>{result.errors.push(e.message);save();});
 await p.goto(base+'/?test=lazy&shot&cloud=&mp=0&time=12&month=7&weather=clear&freeze',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__app?.outdoorCats&&window.__app?.binderPanel,null,{timeout:300000});await kit.skipNameDialog(p);
 await p.evaluate(()=>__app.showOverlay(true));if(await p.locator('#start-go').isVisible())await p.locator('#start-go').click();else await p.locator('#start-touch').click();
 await p.evaluate(async()=>{const a=__app,O=a.outdoorCats;a.renderer.setAnimationLoop(null);a.showOverlay(false);const route=await import('/src/outdoorcatroute.js'),cfg=await import('/src/config.js'),bestiary=await import('/src/bestiary.js');
  window.T={a,O,route,cfg,bestiary,clock:cfg.OUTDOOR_CATS.epoch+3*86400+12*3600,added:O.cats.slice(4),
   run(n,dt=.1){for(let i=0;i<n;i++){T.clock+=dt;a.step(dt);}},stand(x,z,yaw=0){a.player.spawn(x,z,yaw);a.step(.05);},
   look(x,y,z){const c=a.camera.position,dx=x-c.x,dz=z-c.z;a.camera.rotation.set(Math.atan2(y-c.y,Math.hypot(dx,dz)),Math.atan2(-dx,-dz),0,'YXZ');a.camera.updateMatrixWorld(true);},
   zoom(z){a.camera.zoom=z;a.camera.updateProjectionMatrix();},
   calls(){a.renderer.info.reset();a.renderer.render(a.scene,a.camera);return{calls:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles};},
   delta(){const was0=T.added.map(c=>c.group.visible),pair=()=>{T.added.forEach((c,i)=>c.group.visible=was0[i]);const w=T.calls();T.added.forEach(c=>c.group.visible=false);const wo=T.calls();T.added.forEach((c,i)=>c.group.visible=was0[i]);return[w,wo];};for(let i=0;i<3;i++)pair();const[now,before]=pair(),shown=T.added.filter(c=>c.group.visible).map(c=>c.name),animated=T.added.filter(c=>c.group.visible&&c.puppet.object.visible).map(c=>c.name);return{with:now,without:before,shown,animated,added:now.calls-before.calls};},
   cat(n){return O.cats.find(c=>c.name===n);}};
  O.now=()=>T.clock;O.cats.forEach(c=>{c.st='route';O.place(c,O.scheduled(c));c.alpha=1;});});
 // (1) the added loops in the actual scene: the module's own walkable/free callbacks every 0.5 m
 const routes=await p.evaluate(()=>{const{O,route}=T,bad=[];let n=0;for(const c of T.added)for(const[x,z]of route.routeSamples(c.spec.route,.5)){n++;if(!O.walkable(x,z)||!O.env.free(x,z))bad.push([c.name,x,z]);}return{n,bad:bad.slice(0,10),nbad:bad.length};});
 check(routes.n>2000&&routes.nbad===0,'added loops: walkable, dry, off roads and free in the actual scene',routes);
 // (2) pictures of new cats in their areas, with the added cats' draw-call delta from each view
 const views=[['Misan','1-misan-klocktornsparken.png',4,3.5],['Tiger','2-tiger-hasthagen.png',-4,3.5],['Molly','3-molly-sankt-lars.png',4,-3.5]];
 for(const[name,file,dx,dz]of views){
  const seen=await p.evaluate(({name,dx,dz})=>{const{O,a}=T,c=T.cat(name);if(a.cat.visible)a.cat.hide();
   for(let i=0;i<3000&&(O.scheduled(c).walking||O.scheduled(c).restLeft<60);i++)T.clock+=3;
   O.cats.forEach(q=>{q.st='route';q.alpha=1;});T.run(1,.05);const yaw=c.group.rotation.y+Math.atan2(dx,dz)*.25,r=Math.hypot(dx,dz);T.stand(c.x+Math.sin(yaw)*r,c.z+Math.cos(yaw)*r);T.run(4,.05);T.zoom(1.6);T.run(1,.02);T.look(c.x,c.group.position.y+.15,c.z);
   return{st:c.st,activity:c.activity,x:+c.x.toFixed(1),z:+c.z.toFixed(1),visible:c.group.visible,animated:c.puppet.object.visible,d:+Math.hypot(a.camera.position.x-c.x,a.camera.position.z-c.z).toFixed(1),draw:T.delta()};},{name,dx,dz});
  check(seen.visible&&seen.d<8,`picture: ${name} in its area`,seen);await shot(p,`${out}/${file}`);await p.evaluate(()=>T.zoom(1));
 }
 // (3) representative outdoor views (no zoom): the added cats' draw-call delta
 const rep=await p.evaluate(()=>{const res=[];for(const[label,x,z,lx,lz]of[['innergården mot gräsmattan',-16,26,-16,50],['parken vid Höje å',-60,100,-90,130],['södra åstranden',-20,185,-20,215],['klocktornsparken',60,-140,60,-180]]){T.run(1,.05);T.stand(x,z);T.run(3,.05);T.look(lx,T.a.camera.position.y-1,lz);res.push({label,...T.delta()});}return res;});
 check(rep.every(r=>r.added<=r.shown.length+24*r.animated.length),'added cats: one merged call each beyond the animated distance (an animated near cat ~22)',rep);
 // (4) walk up to Misan: she becomes the ordinary cat, purrs when petted; the siames page records the find
 const meet=await p.evaluate(()=>{const{O,a}=T,c=T.cat('Misan'),k=a.cat;if(k.visible)k.hide();T.stand(c.x+6,c.z);T.run(2,.05);T.stand(c.x+2.2,c.z+.6);T.look(c.x,.2,c.z);
  let i=0;for(;i<80&&c.st!=='bound';i++)T.run(1,.05);const r={st:c.st,outdoorCat:k.outdoorCat,breed:k.breed?.name,coat:k.variant?.name,options:k.visible?k.interact.options().map(o=>o.id):[]};
  k.interact.options().find(o=>o.id==='pet')?.run();T.run(10,.05);r.petting=k.petting;r.record=a.bestiary.get(T.bestiary.catEntryId('siames','siames',false));return r;});
 check(meet.st==='bound'&&meet.outdoorCat==='Misan'&&meet.breed==='siames'&&meet.petting&&meet.options.includes('take')&&meet.record.found,'Misan: meets, becomes the ordinary cat, purrs, can be carried; binder records the find',meet);
 // (5) the binder pages of two added forms (Tiger seen as a fixture; Misan found above)
 for(const[name,file]of[['Misan','5-parm-misan.png'],['Tiger','6-parm-tiger.png']]){
  const page=await p.evaluate(name=>{const{a,bestiary}=T,c=T.cat(name),id=bestiary.catEntryId(c.spec.breed,c.spec.coat,false);a.bestiary.lastSeen.delete(id);a.bestiary.record(id,'seen');if(!a.binderPanel.open)a.showBinder(true);a.binderPanel.detail(id);
   const card=document.querySelector('#binder-view .dex-card');return{id,no:a.bestiaryRegistry.get(id).no,text:card?.innerText.slice(0,600)};},name);
  await p.waitForFunction(()=>[...document.querySelectorAll('#binder-view .dex-card:not(.dex-next-card) .dex-art')].every(n=>n.classList.contains('loaded')),null,{timeout:120000}).catch(()=>{});
  check(page.text?.includes(name)&&page.text.includes(await p.evaluate(n=>T.cat(n).spec.zone,name)),`binder page: ${name}`,page);
  await p.evaluate(()=>document.querySelector('#binder-view .dex-card:not(.dex-next-card) .dex-info')?.scrollIntoView({block:'center'}));await shot(p,`${out}/${file}`,1);
 }
 check(result.errors.length===0,'no page errors',result.errors.slice(0,5));
}finally{save();await browser.close();}})().catch(e=>{result.error=e.stack;save();console.error(e);process.exitCode=1;});
