// #2027: SPEL room views (hex LED panels, neon, LED lines, corner lamps) with per-view draw calls and triangles.
// usage: tools/browsertest.sh node tools/clubhouseleds2027test.cjs http://localhost:8628 docs/verification/2027/before
const fs=require('node:fs'),kit=require('./testkit.cjs');
const [game='http://localhost:8628',out='/tmp/leds2027']=process.argv.slice(2);
const views=[
 ['north-wall',[6,0.9],[6,1.8,-5.2]],
 ['south-wall',[6,-4.4],[6,1.9,1.54]],
 ['southeast-corner',[3.9,-3.6],[8.4,1.2,1.2]],
 ['northwest-corner',[8.2,0.6],[4.0,1.5,-5.0]],
];
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await kit.launch();try{
 const page=await browser.newPage({viewport:{width:1000,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${game}/?shot&test=lazy&cloud=&mp=0&freeze&time=12&month=6`,{waitUntil:'commit'});await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:180000});await kit.skipNameDialog(page).catch(()=>{});
 await page.evaluate(async()=>{const a=__app,{decodeAvatarLook}=await import('/src/config.js');a.showOverlay(false);a.avatarCustomizer.setLook({...decodeAvatarLook('241302112','me'),height:140});a.use({kind:'playhouse'});});
 await page.waitForFunction(()=>__app.player.inPlayroom);await kit.skipNameDialog(page).catch(()=>{});await page.waitForTimeout(300);
 await page.evaluate(()=>{__app.renderer.setAnimationLoop(null);__app.touch.enabled=false;__app.world.playroom.setDisco(false);__app.testMode.setFull(true);});
 const res={};
 for(const [name,[x,z],[lx,ly,lz]] of views){
  res[name]=await page.evaluate(async({x,z,lx,ly,lz})=>{const a=__app,{PLAYROOM:R}=await import('/src/config.js');
   a.player.spawn(R.x+x,R.z+z,0);a.camera.position.set(a.player.pos.x,1.4,a.player.pos.z);a.camera.lookAt(R.x+lx,ly,R.z+lz);a.camera.updateMatrixWorld(true);
   a.step(0);a.renderer.info.reset();a.testMode.draw();const mesh=a.world.playroom.roomPosters.mesh;
   return{calls:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles,postersMeshTris:mesh.geometry.attributes.position.count/3,lights:(()=>{let n=0;a.world.playroom.object.traverse(o=>{if(o.isLight)n++;});return n;})()};
  },{x,z,lx,ly,lz});
  await page.screenshot({path:`${out}/${name}.png`});
 }
 fs.writeFileSync(`${out}/result.json`,JSON.stringify({res,errors},null,2));console.log(JSON.stringify({res,errors}));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
