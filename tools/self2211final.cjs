// #2211: final same-pose fabric A/B on the existing real Ghost fixture, then the actual app at unchanged spawn + crouch.
const fs=require('fs'),path=require('path'),kit=require('./testkit.cjs');
const [base='http://127.0.0.1:8433',out='docs/verification/2211']=process.argv.slice(2);
(async()=>{fs.mkdirSync(path.join(out,'before'),{recursive:true});const b=await kit.launch();const errors=[];try{
const ctx=await b.newContext({viewport:{width:800,height:640},deviceScaleFactor:1});
const oldTerm=JSON.parse(fs.readFileSync(path.join(out,'fabric-diagnosis.json'))).result[0].term;
const html=fs.readFileSync('tools/avatarhit.html','utf8').replace('window.__ready = true;',`
window.__2211 = async (mode,oldTerm) => {
 const {fabricLight} = await import('../src/avatarfabric.js');
 const {loadRiggedAvatarModel} = await import('../src/avatar.js');await loadRiggedAvatarModel();
 remote.root.visible=true;mirror.root.visible=false;dart.visible=false;
 if(!window.__posed2211){remote.avatar.time=0;for(let i=0;i<90;i++)remote.avatar.update(1/60,{});window.__posed2211=true;}
 scene.updateMatrixWorld(true);renderer.setSize(800,640);renderer.setScissorTest(false);
 const camera=new THREE.PerspectiveCamera(24,800/640,.05,50);camera.position.set(.9,1.35,-3.6);camera.lookAt(0,1.18,0);
 const m=remote.avatar.material;m.userData.originalCompile??=m.onBeforeCompile;const term=fabricLight();
 m.onBeforeCompile=function(sh,r){m.userData.originalCompile.call(this,sh,r);if(mode==='before')sh.fragmentShader=sh.fragmentShader.replace(term,oldTerm);};
 m.customProgramCacheKey=()=> '2211-final-'+mode;m.needsUpdate=true;renderer.render(scene,camera);
 return {mode,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,rigged:remote.avatar.isRigged,term,image:renderer.domElement.toDataURL()};
};window.__ready=true;`);
await ctx.route('**/tools/avatarhit.html',r=>r.fulfill({body:html.replaceAll('https://cdn.jsdelivr.net/npm/three@0.170.0/','/__three/'),contentType:'text/html'}));
const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/tools/avatarhit.html');await page.waitForFunction(()=>window.__ready);const fabric=[];
for(const mode of ['before','after']){const r=await page.evaluate(({mode,oldTerm})=>__2211(mode,oldTerm),{mode,oldTerm});fs.writeFileSync(path.join(out,mode==='before'?'before/fabric.png':'after-fabric.png'),Buffer.from(r.image.split(',')[1],'base64'));delete r.image;fabric.push(r);}
await ctx.close();
const app=await kit.open(b,base+'/?shot&quality=0&time=12&freeze&at=12.5,26.2,180,-72',{test:false,viewport:{width:900,height:600}});app.page.on('pageerror',e=>errors.push(e.message));
await app.page.waitForFunction(()=>__app.warm.done,null,{timeout:240000});await kit.skipNameDialog(app.page);await app.page.evaluate(()=>{__app.showOverlay(false);__app.touch.enabled=true;document.body.classList.add('touch');});
await app.page.waitForFunction(()=>__app.ghosts.myGhost?.mesh.userData.noDetail&&__app.ghosts.mine);await app.page.screenshot({path:path.join(out,'after-start.png')});
const start=await app.page.evaluate(()=>{const a=__app,g=a.ghosts.myGhost;return{player:a.player.pos.toArray(),root:g.root.position.toArray(),mask:g.mesh.layers.mask,geometry:g.mesh.geometry.attributes.position.count,programs:a.renderer.info.programs.length,noDetail:g.mesh.userData.noDetail};});
await app.page.evaluate(()=>{__app.player.crouch=true;__app.camera.rotation.x=-65*Math.PI/180;});await app.page.waitForFunction(()=>__app.player.crouched&&__app.ghosts.myGhost.crouch>.99,null,{timeout:30000});
await app.page.screenshot({path:path.join(out,'after-crouch.png')});const crouch=await app.page.evaluate(()=>({player:__app.player.pos.toArray(),crouched:__app.player.crouched,bodyCrouch:__app.ghosts.myGhost.crouch,mask:__app.ghosts.myGhost.mesh.layers.mask}));
const result={fabric,start,crouch,errors};fs.writeFileSync(path.join(out,'final-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(errors.length)process.exitCode=1;
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});