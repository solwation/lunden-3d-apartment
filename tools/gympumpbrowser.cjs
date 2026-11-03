// #1837 production-module fixture: real Avatar/Ghosts + local Worker + profile stats save/reload.
// The source onRep callback is invoked 100 times as debug credit; this is not 100 native gym repetitions.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');
const base=process.argv[2]||'http://localhost:8910',worker=process.argv[3]||'http://localhost:8912',out=process.argv[4]||'/tmp/gympump';
fs.mkdirSync(out,{recursive:true});const result={fixture:'production modules, 100 debug onRep callbacks; no full world/native exercise claim',checks:[],errors:[],wire:[]};
const save=()=>fs.writeFileSync(out+'/browser.json',JSON.stringify(result,null,2));
const check=(ok,label,data)=>{result.checks.push({ok,label,...(data===undefined?{}:{data})});save();console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)throw Error(label)};
const main=fs.readFileSync('src/main.js','utf8'),callback=main.match(/outdoorGym\.onRep = (n => \{[^\n]+?\});/)[1];
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
const contexts=[];
const setup=async(name,render=false,existing)=>{
 const context=existing||await browser.newContext({viewport:{width:1100,height:670}});if(!existing)contexts.push(context);
 const p=await context.newPage();p.on('pageerror',e=>{result.errors.push(e.message);save()});p.on('console',m=>{if(m.type()==='error'){result.errors.push(m.text());save()}});
 p.on('websocket',ws=>ws.on('framesent',e=>{try{const m=JSON.parse(e.payload);if(m.p)result.wire.push({name,bp:m.bp??0,bytes:e.payload.length});}catch{}}));
 await p.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// #1837 bounded module fixture'}));await p.goto(base);
 await p.evaluate(async({name,worker,render,callback})=>{
 const T=await import('three'),{Ghosts}=await import('/src/ghosts.js'),{Avatar}=await import('/src/avatar.js'),{pumpSampler}=await import('/src/gympump.js');
 const statsModule=name==='Pump Player'?await import('/src/stats.js'):null;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(30,1100/620,.1,100);camera.position.set(0,1.05,4.4);camera.lookAt(0,1.05,0);
 scene.background=new T.Color('#d5dedf');scene.add(new T.HemisphereLight(0xffffff,0x54534a,2));const light=new T.DirectionalLight(0xfff3df,2);light.position.set(2,4,4);scene.add(light);
 const sample=statsModule?pumpSampler(()=>statsModule.stats.gymPump):()=>0;
 const ghosts=new Ghosts({scene,camera,url:worker,name:()=>name,state:()=>({p:[0,0,0],r:0,bp:sample()}),score:()=>statsModule?.totalScore()||0});
 ghosts.group.visible=false;
 const stage=render?[0,1,2].map((cut,i)=>{const a=new Avatar({...ghosts.myLook,cut,sleeves:cut===2?1:0,gender:0});a.setSolid(true);a.object.position.x=(i-1)*.85;a.object.rotation.y=0;scene.add(a.object);return a;}):[];
 let renderer;if(render){renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1100,620);renderer.setPixelRatio(1);document.body.replaceChildren(renderer.domElement);renderer.domElement.style.cssText='position:fixed;inset:0';const label=document.createElement('div');label.id='fixture-label';label.style.cssText='position:fixed;bottom:0;height:50px;background:#162b35;color:white;width:100%;font:18px system-ui;display:flex;align-items:center;justify-content:center;white-space:pre';document.body.append(label);}
 window.f={T,Avatar,ghosts,scene,camera,stage,renderer,statsModule,sample};
 if(statsModule)f.rep=new Function('bump','growGymPump',`return ${callback}`)(statsModule.bump,statsModule.growGymPump);
 f.frame=()=>{for(const a of stage)a.setPump(sample());if(renderer)renderer.render(scene,camera);};
 f.tick=setInterval(()=>{ghosts.update();f.frame();},50);
 },{name,worker,render,callback});
 await p.waitForFunction(()=>f.ghosts.connected,null,{timeout:20000});return p;
};
const a=await setup('Pump Player',true),b=await setup('Observer');
await b.waitForFunction(()=>[...f.ghosts.others.values()].some(g=>g.name==='Pump Player'),null,{timeout:15000});
const measure=()=>a.evaluate(()=>{f.frame();return {pump:f.sample(),calls:f.renderer.info.render.calls,triangles:f.renderer.info.render.triangles,geometries:f.renderer.info.memory.geometries,mesh:f.stage.map(a=>a.mesh.geometry.uuid),uniform:f.ghosts.selfGhost().avatar.material.userData.u.uPump.value}});
const before=await measure();check(before.pump===0&&before.uniform===0,'initial self and sampled pump are zero',before);
await a.evaluate(()=>document.querySelector('#fixture-label').textContent='Före: 0% pump     ·     T-shirt / linne / långärmat     ·     produktionsavatarer i testvy');await a.screenshot({path:out+'/before.png'});
const credited=await a.evaluate(()=>{for(let i=0;i<100;i++)f.rep(1);f.statsModule.saveStats();return {record:f.statsModule.stats.gymPump,reps:f.statsModule.stats.gymReps,score:f.statsModule.totalScore(),stored:JSON.parse(localStorage.getItem('lunden.stats')).gymPump};});
check(credited.reps===100&&credited.record.value>.999&&credited.stored.value===credited.record.value,'100 debug completed-rep callbacks preserve score/count and persist pump',credited);
await a.waitForFunction(()=>f.sample()===1,null,{timeout:20000});
await b.waitForFunction(()=>[...f.ghosts.others.values()].find(g=>g.name==='Pump Player')?.pump===1,null,{timeout:15000});
const after=await measure();check(before.calls===after.calls&&before.triangles===after.triangles&&before.geometries===after.geometries&&JSON.stringify(before.mesh)===JSON.stringify(after.mesh)&&after.uniform===1,'real GPU before/after: same draws, triangles, geometry allocations and self pump',after);
await a.evaluate(()=>document.querySelector('#fixture-label').textContent='Efter: 100% pump     ·     100 debugkrediterade reps     ·     samma draws och geometri');await a.screenshot({path:out+'/after.png'});
await a.evaluate(()=>f.ghosts.setMyLook({...f.ghosts.myLook,cut:2,sleeves:1,gender:1}));
await b.waitForFunction(()=>{const g=[...f.ghosts.others.values()].find(g=>g.name==='Pump Player');return g?.pump===1&&g.avatar.look.cut===2&&g.avatar.look.gender===1&&g.avatar.material.userData.u.uPump.value===1;},null,{timeout:15000});
check(await a.evaluate(()=>f.ghosts.selfGhost().avatar.material.userData.u.uPump.value===1),'look replacement retains self and remote pump');
// Render the actual received ghost beside another avatar of exactly the same look, left unpumped.
const remote=await b.evaluate(()=>{const g=[...f.ghosts.others.values()].find(g=>g.name==='Pump Player');f.ghosts.group.visible=true;g.root.visible=true;g.root.position.set(-.48,0,0);g.root.rotation.y=Math.PI;if(g.tag)g.tag.visible=false;const control=new f.Avatar(g.avatar.look);control.object.position.x=.48;control.object.rotation.y=0;f.scene.add(control.object);clearInterval(f.tick);const r=new f.T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(1100,620);document.body.replaceChildren(r.domElement);r.domElement.style.cssText='position:fixed;inset:0';r.render(f.scene,f.camera);const label=document.createElement('div');label.style.cssText='position:fixed;bottom:0;height:50px;background:#162b35;color:white;width:100%;font:18px system-ui;display:grid;place-items:center';label.textContent='Vänster: mottagen spelare 100% · Höger: samma look 0% · långärmat efter lookbyte';document.body.append(label);return {remote:g.pump,uniform:g.avatar.material.userData.u.uPump.value,control:control.material.userData.u.uPump.value,shared:g.mesh.geometry.attributes.position===control.mesh.geometry.attributes.position,calls:r.info.render.calls,triangles:r.info.render.triangles};});
check(remote.remote===1&&remote.uniform===1&&remote.control===0&&remote.shared,'actual remote avatar and same-look unpumped control share immutable positions',remote);await b.screenshot({path:out+'/remote-look.png'});
const c=await setup('Late observer');await c.waitForFunction(()=>[...f.ghosts.others.values()].find(g=>g.name==='Pump Player')?.pump===1,null,{timeout:15000});check(true,'late joining Ghosts receives Worker snapshot pump without another rep');await c.close();
const context=a.context();await a.close();const reloaded=await setup('Pump Player',false,context);await reloaded.waitForFunction(()=>f.sample()===1,null,{timeout:5000});check(await reloaded.evaluate(()=>f.statsModule.stats.gymReps===100&&f.statsModule.stats.gymPump.value>.999&&f.ghosts.selfGhost().avatar.material.userData.u.uPump.value===1),'profile save/reload restores pump, count and own avatar');
check(result.wire.some(s=>s.name==='Pump Player'&&s.bp===1&&s.bytes<512),'actual WebSocket state includes bounded bp within existing message size',result.wire);
check(result.errors.length===0,'no browser or shader errors',result.errors);result.ok=true;save();
}finally{await browser.close();}})().catch(e=>{result.error=e.stack;save();console.error(e);process.exitCode=1;});
