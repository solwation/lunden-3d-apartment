const fs=require('fs'),path=require('path'),kit=require('./testkit.cjs');
const [base='http://127.0.0.1:8433',out='docs/verification/2211']=process.argv.slice(2);
(async()=>{const b=await kit.launch();try{
const ctx=await b.newContext({viewport:{width:800,height:640},deviceScaleFactor:1});
const html=fs.readFileSync('tools/avatarhit.html','utf8').replace('window.__ready = true;',`
window.__2211 = async (mode) => {
 const {fabricLight} = await import('../src/avatarfabric.js');
 remote.root.visible=true;mirror.root.visible=false;dart.visible=false;remote.avatar.time=0;
 for(let i=0;i<90;i++)remote.avatar.update(1/60,{});scene.updateMatrixWorld(true);
 renderer.setSize(800,640);renderer.setScissorTest(false);
 const camera=new THREE.PerspectiveCamera(24,800/640,.05,50);camera.position.set(.9,1.35,-3.6);camera.lookAt(0,1.18,0);
 const m=remote.avatar.material;m.userData.originalCompile??=m.onBeforeCompile;
 const term=fabricLight();m.onBeforeCompile=function(sh,r){m.userData.originalCompile.call(this,sh,r);if(mode==='off')sh.fragmentShader=sh.fragmentShader.replace(term,'');if(mode==='candidate')sh.fragmentShader=sh.fragmentShader.replace(term,term.replace('pow(fbV, 2.20000)','pow(fbV, 2.20000) * (1.0 - fbV)'));};
 m.customProgramCacheKey=()=> '2211-fabric-'+mode;m.needsUpdate=true;renderer.render(scene,camera);
 return {mode,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,term,image:renderer.domElement.toDataURL()};
};window.__ready=true;`);
await ctx.route('**/tools/avatarhit.html',r=>r.fulfill({body:html.replaceAll('https://cdn.jsdelivr.net/npm/three@0.170.0/','/__three/'),contentType:'text/html'}));
const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/tools/avatarhit.html');await page.waitForFunction(()=>window.__ready);const result=[];
for(const mode of ['baseline','off','candidate']){const r=await page.evaluate(m=>__2211(m),mode);fs.writeFileSync(path.join(out,'fabric-'+mode+'.png'),Buffer.from(r.image.split(',')[1],'base64'));delete r.image;result.push(r);}
fs.writeFileSync(path.join(out,'fabric-diagnosis.json'),JSON.stringify({result,errors},null,2));console.log(JSON.stringify({result,errors}));if(errors.length)process.exitCode=1;
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});