const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.argv[2],out=process.argv[3];fs.mkdirSync(path.join(out,'before'),{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const result={views:{},checks:{},errors:[]};
 try{
 const page=await browser.newPage({viewport:{width:960,height:640},deviceScaleFactor:1});
 page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|VALIDATE_STATUS|compile error/i.test(m.text()))result.errors.push(m.text());});
 await page.goto(`${base}/?shot&quality=3&time=13&month=6&day=15&freeze&weather=clear&lights&cloud=&at=2.1,9.2,0,0`,{waitUntil:'commit'});
 await page.waitForFunction(()=>window.__app?.renderer&&window.__app?.world,null,{timeout:360000,polling:300});
 await page.addStyleTag({content:'#player-dialog,#overlay,#loading,#hud,#note,#toast,.touch-ui {display:none!important}'});
 await page.evaluate(()=>window.__app.renderer.setAnimationLoop(null));
 const views={window:{from:[0.85,1.65,9.2],at:[0.1,1.8,8.4],hour:13},lamp:{from:[3.05,2.05,8.6],at:[3.2,2.65,10.35],hour:22}};
 for(const [name,v]of Object.entries(views)){
  result.views[name]={};
  await page.evaluate(v=>{const a=window.__app;a.day.hour=v.hour;a.step(0);a.camera.position.set(...v.from);a.camera.lookAt(...v.at);a.camera.updateMatrixWorld(true);a.renderer.shadowMap.needsUpdate=true;for(let i=0;i<3;i++)a.renderer.render(a.scene,a.camera);a.renderer.shadowMap.autoUpdate=false;},v);
  for(const enabled of[false,true]){
   const r=await page.evaluate(async({v,enabled})=>{
    const a=window.__app,p=await import('/src/paintsurface.js');p.paintDetail.value=enabled?1:0;
    a.camera.position.set(...v.from);a.camera.lookAt(...v.at);a.camera.updateMatrixWorld(true);a.renderer.shadowMap.autoUpdate=false;
    for(let i=0;i<3;i++)a.renderer.render(a.scene,a.camera);
    a.renderer.info.reset();a.renderer.render(a.scene,a.camera);
    const mats=new Set();a.scene.traverse(o=>{for(const m of[o.material].flat())if(m?.userData?.paintSurface)mats.add(m)});
    return{image:a.renderer.domElement.toDataURL(),calls:a.renderer.info.render.calls,triangles:a.renderer.info.render.triangles,programs:a.renderer.info.programs.length,paintedMaterials:mats.size,enabled:p.paintDetail.value,daylight:a.day.daylight};
   },{v,enabled});
   const file=path.join(out,enabled?'':'before',name+'.png');fs.writeFileSync(file,Buffer.from(r.image.split(',')[1],'base64'));delete r.image;
   result.views[name][enabled?'after':'before']=r;
  }
  assert.equal(result.views[name].before.calls,result.views[name].after.calls);
  assert.equal(result.views[name].before.triangles,result.views[name].after.triangles);
 }
 result.checks=await page.evaluate(async()=>{
  const a=window.__app,p=await import('/src/paintsurface.js'),c=await import('/src/config.js');
  a.quality.set(0);const off=p.paintDetail.value===0;a.quality.set(3);const on=p.paintDetail.value===1;
  return{lowestOff:off,qualityRestored:on,farOff:p.paintDetailAt(50)===0,nearOn:p.paintDetailAt(0)===1,textureBytes:p.paintTexture().image.data.byteLength,wallDepth:c.PAINT_SURFACE.wall.depth,ceilingDepth:c.PAINT_SURFACE.ceiling.depth};
 });
 assert.ok(result.checks.lowestOff&&result.checks.qualityRestored&&result.checks.farOff&&result.checks.nearOn);assert.equal(result.errors.length,0,result.errors.join('\n'));
 result.completed=true;
 }catch(e){result.failure=String(e.stack||e);throw e;}
 finally{fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
