// #1154: an ignored cat walks off after CAT_IGNORED.after s; engagement resets the count; held/fed cats stay; the count
// survives a reload record (keep.js); an unseen Miele walking off keeps her daily guarantee (#1134). Bounded scene, real cat.js.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.argv[2]||'http://localhost:8941',out=process.argv[3]||'/tmp/lunden-cat1154';
fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],checks=[];
try{
 const page=await browser.newPage({viewport:{width:900,height:640}});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/bootstrap.js*',r=>r.fulfill({body:'',contentType:'application/javascript'}));await page.goto(base+'/?cloud=');
 await page.evaluate(async()=>{
  const T=await import('three'),{CatSpawner,BREEDS,VARIANTS,MieleDaily}=await import('/src/cat.js'),{CAT_IGNORED}=await import('/src/config.js'),{saveWorld,loadWorld}=await import('/src/keep.js');
  const scene=new T.Scene();scene.background=new T.Color(0xd8dedc);const camera=new T.PerspectiveCamera(58,900/640,.01,20);camera.position.set(3,1.5,2.6);camera.lookAt(3,.2,0);scene.add(camera);
  scene.add(new T.HemisphereLight(0xffffff,0x6b6350,3));const floor=new T.Mesh(new T.PlaneGeometry(16,16),new T.MeshStandardMaterial({color:0xc0ac90}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  const world={levels:[{segments:[]},{segments:[]}],doors:[]},cat=new CatSpawner(world,()=>.5);scene.add(cat.object);cat.watchPoint=()=>camera.position;
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(900,640);document.body.append(renderer.domElement);renderer.domElement.style.cssText='position:fixed;inset:0;z-index:1000';
  const spawn=(breed=BREEDS[0],kitten=false)=>{cat.hide();cat.setCat(breed,breed.coats[0],kitten);cat.object.visible=true;cat.object.position.set(3,0,0);cat.object.rotation.y=0;cat.ignored=0;cat.awayFor=0;};
  const run=(s,dt=1/30)=>{const n=Math.round(s/dt);for(let i=0;i<n&&cat.visible;i++)cat.update(dt);};
  window.ig={T,cat,BREEDS,VARIANTS,MieleDaily,CAT_IGNORED,saveWorld,loadWorld,world,camera,spawn,run,draw:()=>renderer.render(scene,camera)};
 });
 const check=async(label,fn)=>{const data=await page.evaluate(fn);checks.push({label,ok:!!data.ok,data});assert.ok(data.ok,label+' '+JSON.stringify(data));console.log('PASS '+label,JSON.stringify(data));};
 await check('the wait is in config (60 s guess)',()=>({ok:ig.CAT_IGNORED.after===60,after:ig.CAT_IGNORED.after}));
 await check('ignored cat still sits at 59 s',()=>{ig.spawn();ig.run(59);return{ok:ig.cat.visible&&!ig.cat.leaving,ignored:+ig.cat.ignored.toFixed(1)};});
 await page.evaluate(()=>ig.draw());await page.screenshot({path:path.join(out,'1-ignored-59s.png')});
 await check('at 60 s it walks off away from the visitor',()=>{const {cat}=ig,z0=cat.object.position.z;ig.run(1.2);const L=cat.leaving;ig.run(2.5);return{ok:!!L&&!L.hurt&&cat.visible&&cat.object.position.z<z0-.2&&cat.awayFor<=0,dz:+(cat.object.position.z-z0).toFixed(2)};});
 await page.evaluate(()=>ig.draw());await page.screenshot({path:path.join(out,'2-walking-off.png')});
 await check('then it fades and is gone',()=>{ig.run(10);return{ok:!ig.cat.visible};});
 await check('a pat resets the minute (then the usual walk-off after a pat)',()=>{const {cat,camera}=ig;ig.spawn();ig.run(50);cat.pet(camera.position);ig.run(.1);return{ok:cat.ignored===0&&cat.petting};});
 await check('held for two minutes: stays',()=>{const {cat}=ig;ig.spawn();cat.held=true;ig.run(120);const ok=cat.visible&&!cat.leaving&&cat.ignored===0;cat.held=false;return{ok};});
 await check('after a fish finger (fed): no walk-off meanwhile',()=>{const {cat}=ig;ig.spawn();ig.run(55);cat.fish={phase:'look',t:0,f:{state:'held',model:{scale:{setScalar(){}}}},at:new ig.T.Vector3(3,0,1)};let left=false;for(let i=0;i<300;i++){cat.ignored=Math.max(cat.ignored,0);cat.fish&&(cat.fish.t=0);cat.update(1/30);left||=!!cat.leaving;}const reset=cat.ignored===0;cat.dropFish();return{ok:!left&&reset&&cat.visible};});
 await check('kitten playing with a cup: no walk-off',()=>{const {cat}=ig;ig.spawn(ig.BREEDS[0],true);ig.run(59);cat.toy={phase:'look',t:0};const k=cat.ignored;cat.countIgnored(5);const ok=cat.ignored===0&&!cat.leaving;cat.toy=null;return{ok,k:+k.toFixed(1)};});
 await check('the count survives a reload record',()=>{const {cat}=ig;ig.spawn();ig.run(42);const w=ig.saveWorld({cat,world:ig.world,BREEDS:ig.BREEDS,VARIANTS:ig.VARIANTS});cat.hide();cat.ignored=0;ig.loadWorld({cat,world:ig.world,BREEDS:ig.BREEDS,VARIANTS:ig.VARIANTS},w);const i=cat.ignored;ig.run(17);const still=cat.visible&&!cat.leaving;ig.run(2);return{ok:w.cat?.i===42&&i===42&&still&&!!cat.leaving,i};});
 await check('an old record without the count starts fresh',()=>{const {cat}=ig;ig.spawn();const w=ig.saveWorld({cat,world:ig.world,BREEDS:ig.BREEDS,VARIANTS:ig.VARIANTS});delete w.cat.i;cat.hide();cat.ignored=33;ig.loadWorld({cat,world:ig.world,BREEDS:ig.BREEDS,VARIANTS:ig.VARIANTS},w);return{ok:cat.visible&&cat.ignored===0};});
 await check('unseen Miele walking off keeps her daily guarantee (#1134)',()=>{const {cat}=ig;let rec={day:null};const d=new ig.MieleDaily({load:()=>rec,keep:r=>{rec=r;}});rec=d.today();rec.cats=7;cat.mieleDaily=d;const miele=ig.BREEDS.find(b=>b.superRare);ig.spawn(miele);cat.seen=false;const locked=cat.mieleLock;ig.run(75);return{ok:locked&&!cat.visible&&!cat.mieleLock&&d.extra()===1&&!rec.seen,extra:d.extra()};});
 assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,errors,browser:browser.version()},null,2));console.log('ALL PASS',checks.length);
}finally{await browser.close();}})().catch(e=>{fs.writeFileSync(path.join(out,'failure.txt'),String(e.stack));console.error(e);process.exitCode=1;});
