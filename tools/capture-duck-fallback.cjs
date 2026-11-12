const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1500,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.route('**/models/duck-rigged.glb',r=>r.fulfill({status:404,body:'missing model fixture'}));
  const failed=page.waitForResponse(r=>r.url().endsWith('/models/duck-rigged.glb')&&r.status()===404);
  await page.goto('http://127.0.0.1:8200/tools/duckvisualtest.html?fallback');await failed;
  await page.waitForFunction(()=>window.duckVisual?.ready&&duckVisual.ducks.animals.every(a=>!a.riggedScene));
  const data={views:[],errors};
  for(const view of['land','swim','normal']){
   const result=await page.evaluate(async view=>{
    const T=await import('/node_modules/three/build/three.module.js'),{ducks,scene,camera,renderer,arrange}=duckVisual;arrange('idle',view==='swim');
    const b=ducks.animals[0].brain,cx=b.x+.65,cz=b.z;
    ducks.animals.forEach((a,i)=>Object.assign(a.brain,{x:cx+(i%2?.65:-.65),z:cz-Math.floor(i/2)*1.1}));ducks.update(0,false);
    camera.fov=view==='normal'?70:40;camera.position.set(cx,view==='normal'?1.62:.85,cz+3.5);camera.lookAt(cx,.34,cz-.25);camera.updateProjectionMatrix();scene.updateMatrixWorld(true);renderer.render(scene,camera);
    const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));let finite=[...camera.matrixWorld.elements,...camera.projectionMatrix.elements].every(Number.isFinite);scene.traverse(o=>{if(!o.matrixWorld.elements.every(Number.isFinite))finite=false});
    return{view,submitted:{...renderer.info.render},finite,intended:ducks.animals.every(a=>a.mesh.visible&&a.mesh.material.visible&&!a.riggedScene&&frustum.intersectsObject(a.mesh))};
   },view);
   if(!result.finite||!result.intended||result.submitted.calls!==5)throw Error(JSON.stringify(result));
   await page.locator('canvas').screenshot({path:`docs/verification/1921/fallback-${view}.png`});data.views.push(result);
  }
  if(errors.length)throw Error(JSON.stringify(errors));fs.writeFileSync('docs/verification/1921/fallback.json',JSON.stringify(data,null,2));console.log(JSON.stringify(data));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
