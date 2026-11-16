// #1988: actual vehicle geometry + actual Garage builder; isolated component views, not a full-world performance profile.
const kit=require('./testkit.cjs'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const [base='http://127.0.0.1:8798',out='docs/verification/1988']=process.argv.slice(2);fs.mkdirSync(out,{recursive:true});
const lightingOnly=process.argv.includes('--lighting-only');
const result={checks:[],views:{},errors:[],source:{},environment:{viewport:[960,600],canvas:[960,540],renderer:'Chromium SwiftShader',scope:'actual carGeometry/carFarGeometry, addCarLod and Garage/garageBikeRowLod; isolated scenes, not full app or device/performance evidence'}};
for(const f of ['src/viewlod.js','src/garagelods.js','src/garage.js','src/config.js','src/lod.js','src/streetlife.js'])result.source[f]=crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const check=(ok,name,detail)=>{result.checks.push({ok:!!ok,name,detail});console.log(`${ok?'PASS':'FAIL'} ${name}`,JSON.stringify(detail??''));if(!ok)throw Error(name)};
(async()=>{const browser=await kit.launch();result.chromium=browser.version();try{
 const page=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text())});
 if(process.env.THREE_DIR)await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>r.fulfill({path:path.join(process.env.THREE_DIR,r.request().url().split('three@0.170.0/')[1]),contentType:'text/javascript'}));
 await page.goto(base+'/tools/vehiclelodtest.html',{waitUntil:'commit'});await page.waitForFunction(()=>window.__vehicles,null,{timeout:180000});
 result.geometry=await page.evaluate(()=>__vehicles.stats());check(result.geometry.rows>0&&result.geometry.storageRows>0&&result.geometry.geometryPreserved&&result.geometry.carDepth,'actual near/far car and rack geometry kept; real garage contains rack/storage rows; untiled car depth follows fade',result.geometry);
 const configs=[['desktop',[12,60,75]],['phone',[10,30,45]],['garage',[result.geometry.near-4,result.geometry.near,result.geometry.near+4]]];
 if(!lightingOnly)for(const[kind,distances]of configs)for(let i=0;i<3;i++){
  const phase=['near','mid','far'][i],d=distances[i],key=`${kind}-${phase}`;
  const hard=await page.evaluate(([k,d])=>__vehicles.measure(k,d,'hard'),[kind,d]);
  const fade=await page.evaluate(([k,d])=>__vehicles.measure(k,d,'fade'),[kind,d]);result.views[key]={distance:d,hard,fade};console.log('MEASURE',key,JSON.stringify(result.views[key]));
  if(i!==1)check(fade.calls===hard.calls&&fade.triangles===hard.triangles,`${key}: ordinary view costs exactly the same as the previous hard level`,result.views[key]);
  else check(fade.fade>.49&&fade.fade<.51&&(kind==='garage'?fade.level.near&&fade.level.far:fade.level.near===1&&fade.level.far===1)&&fade.calls>hard.calls,`${key}: complementary half-fade draws both existing levels`,result.views[key]);
  await page.evaluate(t=>__vehicles.title(t),`${kind==='garage'?'Garagets cykelrad':kind==='phone'?'Parkerad bil · telefonens 30 m-gräns':'Parkerad bil · datorns 60 m-gräns'} · ${phase==='mid'?'mitt i övergången':phase==='near'?'nära':'långt bort'} · ${d.toFixed(1)} m`);
  await page.screenshot({path:path.join(out,key+'.png'),timeout:120000});
 }
 if(lightingOnly)for(const[kind,d]of [['desktop',60],['desktop',75],['phone',30],['phone',45]]){
  await page.evaluate(([k,d])=>{__vehicles.camera.zoom=d/12;__vehicles.camera.updateProjectionMatrix();__vehicles.measure(k,d,'fade');__vehicles.title(`Parkerad bil · ${k==='desktop'?'dator':'telefon'} · ${d} m · diagnostisk inzoomning för att se dithermönstret`);},[kind,d]);
  await page.screenshot({path:path.join(out,`${kind}-${d===60||d===30?'mid':'far'}-zoom.png`),timeout:120000});
 }
 check((await page.evaluate(()=>__vehicles.lighting(0))).every(v=>Math.abs(v-.035)<1e-9),'both garage levels follow actual sensor-off shell colour');
 check((await page.evaluate(()=>__vehicles.lighting(1))).every(v=>v===1),'both garage levels follow actual sensor-on shell colour');
 check(result.errors.length===0,'no page or GLSL shader errors',result.errors);result.passed=true;
} catch(e){result.passed=false;result.failure=e.stack;console.error(e);}finally{await browser.close();fs.writeFileSync(path.join(out,lightingOnly?'lighting-correction.json':'result.json'),JSON.stringify(result,null,2)+'\n');}process.exit(result.passed?0:1)})();
