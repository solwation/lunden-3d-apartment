// #1287: a held cat can be put down where the visitor stands outdoors: on a roof (Hus L), on far outdoor ground; it stays
// there sitting (no walk-off, no fall), is kept across a reload record and fades only after CAT_OUTDOOR.stay s.
// PLAYWRIGHT_MODULE=… CHROME_PATH=… node tools/catputdowntest.cjs http://localhost:8782 OUTDIR
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.argv[2]||'http://localhost:8782',out=process.argv[3]||'/tmp/lunden-cat1287';
fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],checks=[];
try{
 const page=await browser.newPage({viewport:{width:900,height:600}});page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/?shot&test&at=3,5,0,0,12.75&freeze&time=12');
 await page.waitForFunction(()=>window.__app?.world&&window.__app.player&&window.__app.cat,null,{timeout:420000});
 await page.waitForTimeout(3000);
 await page.evaluate(()=>{window.__app.touch.enabled=true;}); // the game logic (focus, E) runs while playing
 const check=async(label,fn,arg)=>{const data=await page.evaluate(fn,arg);checks.push({label,ok:!!data.ok,data});assert.ok(data.ok,label+' '+JSON.stringify(data));console.log('PASS '+label,JSON.stringify(data));};
 const frames=(n)=>page.evaluate(async(n)=>{for(let i=0;i<n;i++)await new Promise(r=>requestAnimationFrame(r));},n);
 // put a cat in the arms, look at the ground ahead, press E
 const hold=async(pitchDeg)=>console.log('hold',JSON.stringify(await page.evaluate((pitchDeg)=>{const diag=[];const A=window.__app,{cat,miele,camera}=A;cat.hide();cat.setCat(A.BREEDS[0],A.BREEDS[0].coats[0],false);cat.catName='Test';cat.object.visible=true;cat.object.position.copy(A.player.pos);cat.photoDone=true;miele.take({silent:true});camera.rotation.x=-pitchDeg*Math.PI/180;let yaw=null;for(const a of [0,Math.PI/2,Math.PI,-Math.PI/2,Math.PI/4,-Math.PI/4,3*Math.PI/4,-3*Math.PI/4]){camera.rotation.y=a;camera.updateMatrixWorld(true);const r=A.focus().raycaster;r.setFromCamera({x:0,y:0},camera);const os=A.outdoorSpot();diag.push({a,os:os&&os.point.toArray(),gy:A.player.groundAt(camera.position.x-Math.sin(a)*1.6,camera.position.z-Math.cos(a)*1.6,A.player.pos.y+.1)});if(os){yaw=a;break;}}return {held:cat.held,yaw,diag};},pitchDeg)));
 const putDown=async()=>{await frames(3);const r=await page.evaluate(()=>{const A=window.__app,t=A.placement.target();if(!t)return{target:null};A.use(t);return{target:t.point.toArray(),feet:A.player.pos.y};});await frames(3);return r;};
 await check('standing on Hus L roof',()=>{const A=window.__app,p=A.player;return{ok:p.aloft&&!p.flying&&Math.abs(p.pos.y-12.75)<0.3,pos:p.pos.toArray()};});
 await hold(35);
 await page.evaluate(()=>window.__app.camera.updateMatrixWorld());
 const r1=await putDown();console.log(JSON.stringify(r1));
 await check('cat put down on the roof, outdoor flag set, at roof height',()=>{const {cat,player}=window.__app;const p=cat.object.position;return{ok:!cat.held&&cat.visible&&cat.outdoor&&Math.abs(p.y-player.pos.y)<0.05,pos:p.toArray(),outdoor:cat.outdoor};});
 await page.screenshot({path:path.join(out,'1-roof-put-down.png')});
 const pos1=await page.evaluate(()=>window.__app.cat.object.position.toArray());
 await page.evaluate(()=>{const {cat}=window.__app;for(let i=0;i<1;i++)cat.update(0);});
 await page.evaluate(()=>{const {cat}=window.__app;for(let i=0;i<120;i++)cat.update(0.1);});
 await check('after 12 s of game time: still there, sitting, not leaving, not fallen',(p1)=>{const {cat}=window.__app,p=cat.object.position;return{ok:cat.visible&&!cat.leaving&&!cat.released&&p.distanceTo({x:p1[0],y:p1[1],z:p1[2]})<0.001,pos:p.toArray()};},pos1);
 await check('kept in the record with the out flag, restored as outdoor',async()=>{const A=window.__app,K=await import('/src/keep.js'),a={cat:A.cat,world:A.world,BREEDS:A.BREEDS,VARIANTS:A.VARIANTS},w=K.saveWorld(a),p=A.cat.object.position.toArray();A.cat.hide();K.loadWorld(a,w);return{ok:w.cat?.out===1&&A.cat.outdoor&&A.cat.visible&&A.cat.object.position.distanceTo({x:p[0],y:p[1],z:p[2]})<0.01,rec:w.cat};});
 await frames(2);
 // far outdoor ground
 await page.evaluate(()=>{const A=window.__app;A.cat.hide();A.player.pos.set(-60,A.player.groundAt(-60,-17.5,5),-17.5);A.camera.rotation.y=0;});
 await frames(5);
 const gy=await page.evaluate(()=>window.__app.player.pos.toArray());console.log('far pos',gy);
 await hold(35);
 const r2=await putDown();console.log(JSON.stringify(r2));
 await check('cat put down on far ground stays outdoors',()=>{const {cat,player}=window.__app;const p=cat.object.position;return{ok:!cat.held&&cat.visible&&cat.outdoor&&Math.abs(p.y-player.pos.y)<0.05&&Math.hypot(p.x-player.pos.x,p.z-player.pos.z)<2.3,pos:p.toArray()};});
 await page.screenshot({path:path.join(out,'2-far-ground.png')});
 await check('fades away only after CAT_OUTDOOR.stay',()=>{const A=window.__app,{cat}=A;const t0=cat.object.position.toArray();for(let i=0;i<580;i++)cat.update(1);const still=cat.visible&&!cat.leaving;for(let i=0;i<30;i++)cat.update(1);const leaving=!!cat.leaving||!cat.visible;for(let i=0;i<10;i++)cat.update(1);return{ok:still&&leaving&&!cat.visible,still,leaving};});
 await check('F in the air over the roof: drop spot is the roof, not mid-air',()=>{const A=window.__app;A.player.pos.set(3,20,5);const d=A.miele.dropSpot();return{ok:Math.abs(d.y-12.75)<0.3,y:d.y};});
 assert.equal(errors.length,0,errors.join('\n'));
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,errors},null,2));console.log('ALL PASS',checks.length);
}finally{await browser.close();}})().catch(e=>{fs.writeFileSync(path.join(out,'failure.txt'),String(e.stack));console.error(e);process.exitCode=1;});
