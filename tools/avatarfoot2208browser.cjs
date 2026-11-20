// #2208: same real app/Avatar/Player.groundAt, baseline helper routed from a saved file.
// The production tree stays frozen for the complete before/after browser run.
const fs=require('fs'),path=require('path'),kit=require('./testkit.cjs');
const [base,out,oldHelper,only]=process.argv.slice(2);
const seq=[
{name:'L',pts:[[3,7.13],[4.35,7.13]],y0:null},
{name:'A',pts:[[-.75,42.45],[-.75,43.85]],y0:0},
{name:'B',pts:[[-32.5,46.7],[-32.5,48.1]],y0:0},
{name:'C',pts:[[-61.9,27.45],[-61.9,28.85]],y0:0}];
(async()=>{fs.mkdirSync(path.join(out,'before'),{recursive:true});const browser=await kit.launch();const errors=[];try{
const {page,ctx}=await kit.open(browser,base+'/?shot&quality=0',{lazy:true});
page.on('pageerror',e=>errors.push(e.message)); await kit.skipNameDialog(page);
await ctx.route('**/before2208/**',async route=>{
 const url=new URL(route.request().url()),rel=url.pathname.replace('/before2208/','');
 const file=rel==='src/avatarfootik.js'?oldHelper:path.resolve(rel);
 const ext=path.extname(file);await route.fulfill({body:fs.readFileSync(file),contentType:ext==='.js'?'text/javascript':ext==='.glb'?'model/gltf-binary':'application/octet-stream'});
});
await page.evaluate(async()=>{
 const before=await import('/before2208/src/avatar.js'),after=await import('/src/avatar.js');
 await Promise.all([before.loadRiggedAvatarModel(),after.loadRiggedAvatarModel()]);window.foot2208={before:before.Avatar,after:after.Avatar};
});
const rows=[];
for(const sq of seq.filter(s=>!only||s.name===only)){
 const result=await page.evaluate(async ({sq,imagesOnly})=>{
 const A=window.__app,{player,scene,camera}=A,cfg=await import('/src/config.js');
 const y0=sq.y0??cfg.LEVELS[0].floor;
 player.pos.set(sq.pts[0][0],y0,sq.pts[0][1]);camera.position.set(sq.pts[0][0],y0+1.6,sq.pts[0][1]);
 for(let i=0;i<8;i++){A.frame(1/60);await new Promise(r=>setTimeout(r,60));}
 const run=(kind,build,capture=null)=>{
 const av=new window.foot2208[kind]({...cfg.avatarLook('foot-ik-2015'),bodyBuild:build,tall:1});scene.add(av.object);
 const [a,b]=sq.pts,len=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/len,dz=(b[1]-a[1])/len;
 const p=new camera.position.constructor();let y=y0,worst={gap:0},n=0,min=Infinity,max=-Infinity;const dirs={up:{min:Infinity,max:-Infinity,n:0},down:{min:Infinity,max:-Infinity,n:0}};
 const frames=Math.ceil((2*len+1)/.9*60);
 for(let i=0;i<frames;i++){
 const u=i/60*.9-.5,dir=u<len?1:-1,s=Math.max(0,Math.min(len,u<len?u:2*len-u)),x=a[0]+dx*s,z=a[1]+dz*s,yaw=Math.atan2(dx*dir,dz*dir),moving=u>0&&u<2*len?.9:0;
 y=player.groundAt(x,z,y);av.object.position.set(x,y,z);av.object.rotation.y=yaw;
 av.update(1/60,{speed:moving,groundSpeed:moving,motionFrame:[x,z,yaw],groundEnabled:true,ground:(x,z,fy)=>player.groundAt(x,z,fy),floorY:y,gaitDir:[0,1]});av.object.updateMatrixWorld(true);
 if(u>.3&&u<2*len-.1)for(let k=0;k<2;k++){
 const bone=av.bones[k?'footR':'footL'];let low=Infinity;for(const sp of [[0,-.05,-.084],[0,-.05,.194]]){p.set(...sp).applyMatrix4(bone.matrixWorld);low=Math.min(low,p.y);}
 p.setFromMatrixPosition(bone.matrixWorld);const ground=player.groundAt(p.x,p.z,y+.02),gap=low-ground,st=av.gaitInfo.stance[k];
 if(av.gaitInfo.contact[k]&&st>.15&&st<.85){n++;min=Math.min(min,gap);max=Math.max(max,gap);const d=dirs[dir>0?'up':'down'];d.n++;d.min=Math.min(d.min,gap);d.max=Math.max(d.max,gap);if(gap<worst.gap)worst={gap,i,k,st,x,y,z,ankle:p.toArray(),ground};}}
 if(i===capture){
 camera.position.set(x-dx*1.05,y+.40,z-dz*1.05);camera.lookAt(x,y+.29,z);camera.fov=48;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
 window.foot2208.shown=av;return {n,min,max,worst,dirs};}
 }
 scene.remove(av.object);av.dispose();return {n,min,max,worst,dirs};
 };
 window.foot2208.run=run;
 return imagesOnly?[]:[0,4,8].map(build=>({build,before:run('before',build),after:run('after',build)}));
 },{sq,imagesOnly:!!only});
 rows.push({house:sq.name,result});console.log(JSON.stringify(rows.at(-1)));
 if(only||sq.name==='L'){
 const recorded=only?JSON.parse(fs.readFileSync(path.join(out,'browser.json'))).rows.find(r=>r.house===sq.name).result:result;
 const frame=recorded[1].before.worst.i;
 for(const kind of ['before','after']){
 const captured=await page.evaluate(({kind,frame})=>{
 const A=window.__app;A.testMode.setFull(true);A.renderer.setPixelRatio(1);A.renderer.setSize(1280,800,false);A.camera.aspect=1280/800;
 window.foot2208.run(kind,4,frame);
 const actor=window.foot2208.shown,at=actor.object.position,cam=new A.camera.constructor(48,1280/800,.02,200);
 cam.position.set(at.x+1.5,at.y+1.2,at.z-.2);cam.lookAt(at.x,at.y+1.15,at.z);cam.fov=62;cam.updateProjectionMatrix();cam.updateMatrixWorld(true);
 A.renderer.setRenderTarget(null);A.renderer.render(A.scene,cam);
 const foot=actor.bones.footR.getWorldPosition(cam.position.clone());
 const diagnostic={kind,frame,actor:at.toArray(),camera:cam.position.toArray(),foot:foot.toArray(),projectedFoot:foot.clone().project(cam).toArray(),near:cam.near,far:cam.far,actorVisible:actor.object.visible,meshVisible:actor.mesh.visible,draws:A.renderer.info.render.calls};
 const png=A.renderer.domElement.toDataURL('image/png');
 const a=window.foot2208.shown;A.scene.remove(a.object);a.dispose();A.testMode.setFull(false);return {png,diagnostic};
 },{kind,frame});
 fs.writeFileSync(path.join(out,kind==='before'?'before/stair.png':'after-stair.png'),Buffer.from(captured.png.split(',')[1],'base64'));console.log('CAPTURE',JSON.stringify(captured.diagnostic));
 }
 }
}
fs.writeFileSync(path.join(out,only?'browser-images.json':'browser.json'),JSON.stringify({rows,errors},null,2));if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
