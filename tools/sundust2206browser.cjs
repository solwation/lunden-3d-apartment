// #2206: real November morning sunlight in the living room, with actual Mess dust and existing windows/curtains.
const kit=require('./testkit.cjs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.argv[2],out=process.argv[3],result={views:{},checks:{},errors:[]};fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await kit.launch();
 try {
  const {page}=await kit.open(browser,`${base}/?shot&quality=3&time=11&month=11&day=15&year=2026&freeze&weather=clear&blinds=0&at=2,9.5,180,0`,{test:false,viewport:{width:960,height:640}});
  page.on('pageerror',e=>{result.errors.push(e.message);console.error('pageerror',e.message);});
  page.on('console',m=>{if(/Shader Error|VALIDATE_STATUS|Program Info Log|ERROR: 0:/.test(m.text())){result.errors.push(m.text());console.error(m.text());}});
  await page.waitForFunction(()=>__app.sunDust?.mesh,null,{timeout:300000});await kit.skipNameDialog(page);
  await page.addStyleTag({content:'#player-dialog,#overlay,#loading,#hud,.touch-ui,#note,#toast,#qr,[class*=qr]{display:none!important}'});
  console.log('app ready');
  await page.evaluate(()=>{
   const a=__app;for(const b of a.blinds.list)b.set(0);for(const c of a.blinds.curtains)c.set(0);
   const room=a.world.roomMaps[0].at(3.5,10.5);a.life.mess.clear();
   for(let i=0;i<8;i++)a.life.mess.add('dust',1.2+(i%4)*0.65,0,8.6+Math.floor(i/4)*0.7,{amt:1,room,level:0});
   a.showOverlay?.(false);
  });
  await page.waitForTimeout(1000);
  for(const [name,v]of Object.entries({living:{from:[1.1,1.4,8.8],at:[3.4,1.45,11.8],fov:80},window:{from:[1.2,1.5,10.1],at:[3.3,1.3,11.9],fov:75}})){
   result.views[name]={};
   for(const enabled of[false,true]){
    const shot=await page.evaluate(async({v,enabled})=>{
     const a=__app,r=a.renderer,c=a.camera,d=a.sunDust,T=await import('three'),C=(await import('/src/config.js')).SUN_DUST;
     r.setAnimationLoop(null);c.position.set(...v.from);c.fov=v.fov;c.updateProjectionMatrix();c.lookAt(...v.at);c.updateMatrixWorld(true);
     d.enabled=enabled;d.due=0;d.clock=7;
     const sun=a.scene.children.find(o=>o.isDirectionalLight&&o.castShadow);
     const env={sun:a.day.sunDir,intensity:sun.intensity,eye:c.position,spots:a.life.mess.spots,blinds:a.blinds.list,curtains:a.blinds.curtains,inside:true};d.update(.2,env);
     a.detail()?.update?.(c);r.render(a.scene,c);r.render(a.scene,c);
     const data={calls:r.info.render.calls,triangles:r.info.render.triangles,programs:r.info.programs.length,count:d.mesh.count,beams:d.beams||0,visible:d.mesh.visible,sun:a.day.sunDir.toArray(),sunIntensity:sun.intensity,region:a.windowLight.region?.id,roomDust:a.life.mess.total({kind:'dust',room:a.world.roomMaps[0].at(3.5,10.5),level:0}),sources:a.windowLight.shown.filter(s=>!s.well).map(s=>({x:s.x,y:s.y,z:s.z,nz:s.nz,room:d.roomAt(s.level,s.ox,s.oz),pass:s.pass}))};
     // Conservative sum of clipped screen bounding rectangles of all transparent quads. Includes empty soft corners
     // and overlaps, so it bounds blend-fragment coverage, not a GPU timer or an Iris measurement.
     let area=0,onScreen=0;const matrix=new T.Matrix4(),p=new T.Vector3();
     for(let i=0;i<d.mesh.count;i++){
      d.mesh.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix).applyMatrix4(c.matrixWorldInverse);if(p.z>=0)continue;
      const ppm=c.projectionMatrix.elements[5]*640*.5/-p.z,j=i*4,halfW=d.data.array[j],halfL=d.data.array[j+1];
      let rx,ry;if(halfL>0){const axis=a.day.sunDir.clone().negate().transformDirection(c.matrixWorldInverse),l=Math.hypot(axis.x,axis.y)||1;rx=(Math.abs(axis.y/l)*halfW+Math.abs(axis.x/l)*halfL)*ppm;ry=(Math.abs(axis.x/l)*halfW+Math.abs(axis.y/l)*halfL)*ppm;}
      else rx=ry=Math.max(C.pixels[0],Math.min(C.pixels[1],halfW*ppm));
      p.applyMatrix4(c.projectionMatrix);const x=(p.x+1)*480,y=(1-p.y)*320;
      const w=Math.max(0,Math.min(960,x+rx)-Math.max(0,x-rx)),h=Math.max(0,Math.min(640,y+ry)-Math.max(0,y-ry));area+=w*h;if(w*h>0)onScreen++;
     }
     data.transparentPixelBound=area;data.overdrawBound=area/(960*640);data.onScreen=onScreen;
     return{image:r.domElement.toDataURL('image/png'),data};
    },{v,enabled});
    const phase=enabled?'after':'before',folder=enabled?out:path.join(out,'before');fs.mkdirSync(folder,{recursive:true});
    fs.writeFileSync(path.join(folder,`${name}.png`),Buffer.from(shot.image.split(',')[1],'base64'));result.views[name][phase]=shot.data;console.log(name,phase,JSON.stringify(shot.data));
    if(enabled){assert.ok(shot.data.count>0&&shot.data.count<=200,'visible bounded dust');assert.ok(shot.data.onScreen>0,'dust projects into view');assert.ok(shot.data.overdrawBound<0.1,'bounded transparent coverage');}
   }
  }
  result.checks=await page.evaluate(async()=>{
   const a=__app,d=a.sunDust,r=a.renderer,sun=a.scene.children.find(o=>o.isDirectionalLight&&o.castShadow),m=d.mesh,c=a.camera;
   const env={sun:a.day.sunDir,intensity:sun.intensity,eye:c.position,spots:a.life.mess.spots,blinds:a.blinds.list,curtains:a.blinds.curtains,inside:true};
   const run=(e=env)=>{d.due=0;d.update(.2,e);return m.count;};d.enabled=true;const dirty=run();
   const clean=run({...env,spots:[]})===0,cloud=run({...env,intensity:0})===0,night=run({...env,sun:{x:0,y:-1,z:0}})===0;
   const less=run({...env,spots:env.spots.slice(0,1)});const amounts=less<dirty;
   for(const b of a.blinds.list)b.set(1);for(const c of a.blinds.curtains)c.set(1);const drawn=run()===0;
   for(const b of a.blinds.list)b.set(0);for(const c of a.blinds.curtains)c.set(0);const open=run()>0;
   a.quality.set(0);run();const lowest=!m.visible;a.quality.set(3);run();const restored=m.visible;
   r.render(a.scene,c);r.render(a.scene,c); // settle the existing quality 0→3 shader/target changes before measuring reuse
   const p0=r.info.programs.length,t0=r.info.memory.textures,g0=r.info.memory.geometries;
   for(let i=0;i<3;i++){run();r.render(a.scene,c);}const stable=r.info.programs.length===p0&&r.info.memory.textures===t0&&r.info.memory.geometries===g0;
   return{clean,cloud,night,amounts,drawn,open,lowest,restored,stable,dirtyCount:dirty,lessDustCount:less,resourcesBefore:[p0,t0,g0],resourcesAfter:[r.info.programs.length,r.info.memory.textures,r.info.memory.geometries]};
  });
  for(const[k,v]of Object.entries(result.checks))if(typeof v==='boolean')assert.equal(v,true,k);
  assert.deepEqual(result.errors,[]);
 }finally{fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2));await browser.close();}
 console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
