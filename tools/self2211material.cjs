const fs=require('fs'),path=require('path'),kit=require('./testkit.cjs');
const [base='http://127.0.0.1:8433',out='docs/verification/2211']=process.argv.slice(2);
(async()=>{const b=await kit.launch();try{
const {page}=await kit.open(b,base+'/?shot&quality=0&time=12&freeze&at=12.5,26.2,180,-72',{test:false,viewport:{width:900,height:600}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>__app.warm.done,null,{timeout:240000});await kit.skipNameDialog(page);await page.evaluate(()=>{__app.showOverlay(false);__app.touch.enabled=true;document.body.classList.add('touch');});
await page.screenshot({path:path.join(out,'after-start.png')});
const result=await page.evaluate(()=>{const a=__app;a.renderer.setAnimationLoop(null);const g=a.ghosts.myGhost;
 const result={pos:a.player.pos.toArray(),meshMask:g.mesh.layers.mask,noDetail:g.mesh.userData.noDetail,frames:[]};
 a.player.crouch=true;for(let i=0;i<40;i++)a.step(1/60);a.ghosts.update(1/60);a.ghosts.showStandBody();a.camera.rotation.x=-65*Math.PI/180;a.camera.updateMatrixWorld(true);
 const av=g.avatar,m=av.material,u=m.userData.u,orig={blending:m.blending,alphaToCoverage:m.alphaToCoverage};
 for(const mode of ['baseline','normalBlend','noCoverage','noRim']){
 m.blending=orig.blending;m.alphaToCoverage=orig.alphaToCoverage;u.uOutline.value=0;
 if(mode==='normalBlend'){m.blending=1;m.alphaToCoverage=false;}
 if(mode==='noCoverage')m.alphaToCoverage=false;
 if(mode==='noRim'){u.uRim.value=0;u.uRimColor.value.set(0);}
 m.needsUpdate=true;a.renderer.render(a.scene,a.camera);
 result.frames.push({mode,outline:u.uOutline.value,mask:g.mesh.layers.mask,blending:m.blending,alphaToCoverage:m.alphaToCoverage,materialVisible:m.visible,image:a.renderer.domElement.toDataURL()});
 }
 return result;
});
for(const s of result.frames){fs.writeFileSync(path.join(out,'diagnostic-crouch-'+s.mode+'.png'),Buffer.from(s.image.split(',')[1],'base64'));delete s.image;}
fs.writeFileSync(path.join(out,'material-diagnosis.json'),JSON.stringify({result,errors},null,2));console.log(JSON.stringify(result));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});