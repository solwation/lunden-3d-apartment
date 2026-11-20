const fs=require('fs'),path=require('path'),kit=require('./testkit.cjs');
const [base='http://127.0.0.1:8433',out='docs/verification/2211']=process.argv.slice(2);
(async()=>{fs.mkdirSync(path.join(out,'before'),{recursive:true});const b=await kit.launch();try{
const {page}=await kit.open(b,base+'/?shot&quality=0&time=12&freeze&at=12.5,26.2,180,-72',{test:false,viewport:{width:900,height:600}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>__app.warm.done,null,{timeout:240000});await kit.skipNameDialog(page);
await page.evaluate(()=>{__app.showOverlay(false);__app.touch.enabled=true;document.body.classList.add('touch');});
const result=await page.evaluate(()=>{const a=__app;a.renderer.setAnimationLoop(null);a.ghosts.showStandBody();const g=a.ghosts.myGhost,av=g.avatar,mesh=av.mesh;
 const ancestry=[];for(let o=mesh;o;o=o.parent)ancestry.push({id:o.id,name:o.name,type:o.type,visible:o.visible,mask:o.layers.mask});
 const children=[];g.root.traverse(o=>{if(o.isMesh||o.isSprite||o.isPoints)children.push({id:o.id,name:o.name,type:o.type,visible:o.visible,mask:o.layers.mask,isGhostMesh:o===g.mesh,isAvatarMesh:o===av.mesh});});
 const u=av.material.userData.u;let draws=0;const old=mesh.onBeforeRender;mesh.onBeforeRender=function(...args){draws++;return old.apply(this,args)};
 a.renderer.render(a.scene,a.camera);const baseline=draws;
 const states=[];
 for(const mode of ['fullSelf','forceVisible','noClip','noColorCull']){
 if(mode==='fullSelf')a.ghosts.setSelfView(false);
 if(mode==='forceVisible'){for(let o=mesh;o;o=o.parent){o.visible=true;o.layers.mask=1;}mesh.frustumCulled=false;}
 if(mode==='noClip')u.uSelfView.value.set(0,0);
 if(mode==='noColorCull')a.colorFrustum.enabled=false;
 a.renderer.render(a.scene,a.camera);states.push({mode,draws,visible:mesh.visible,bs:mesh.boundingSphere?.radius??null,image:a.renderer.domElement.toDataURL()});}
 return {ghostMesh:g.mesh.id,avatarMesh:mesh.id,ancestry,children,baselineDraws:baseline,states,uniform:u.uSelfView.value.toArray(),material:{blending:av.material.blending,alphaToCoverage:av.material.alphaToCoverage,opacity:av.material.opacity},pos:a.player.pos.toArray()};
});
for(const s of result.states){fs.writeFileSync(path.join(out,`diagnostic-${s.mode}.png`),Buffer.from(s.image.split(',')[1],'base64'));delete s.image;}
fs.writeFileSync(path.join(out,'diagnosis.json'),JSON.stringify({result,errors},null,2));console.log(JSON.stringify(result));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});