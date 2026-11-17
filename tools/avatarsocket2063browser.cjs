// #2063: matched socket depth/silhouette, slider ends, accessories, blink/gaze and render/readback timing.
const fs=require('fs'),os=require('os'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [base='http://localhost:8171',out='docs/verification/2063',before='http://localhost:8170']=process.argv.slice(2);
const skins=[['ljus',0xf1c9a8],['mellan',0xb27d59],['mörk',0x6b4430]];
const cases=skins.flatMap(([n,skin])=>[0,Math.PI/4,Math.PI/3,Math.PI/2].map(yaw=>[`${n} ${Math.round(yaw*180/Math.PI)}°`,{look:{skin,eyes:0x3f6fa8},yaw}]));
cases.push(...[.8,1.2].flatMap(eyeSize=>[0,Math.PI/3,Math.PI/2].map(yaw=>[`${eyeSize} ögon ${Math.round(yaw*180/Math.PI)}°`,{eyeSize,eyeShape:eyeSize===.8?.8:1.2,yaw}])));
cases.push(...[1,2,3].map(glasses=>[`glasögon ${glasses}`,{glasses,yaw:.7}]));
cases.push(...[0,.5,1].map(blink=>[`blink ${blink}`,{blink,yaw:.4,gaze:[.0042,-.0026]}]));
cases.push(['motljus',{sun:[-1,1.5,-4],yaw:Math.PI/3}]);
const closeStart=cases.length;cases.push(...[0,Math.PI/4,Math.PI/3,Math.PI/2].map(yaw=>[`närbild ${Math.round(yaw*180/Math.PI)}°`,{aim:1,dist:.5,fov:6,yaw}]),...['ljus','mörk'].flatMap((name,i)=>[.5,1].map(blink=>[`${name} blink ${blink}`,{aim:1,dist:.5,fov:6,blink,look:{skin:skins[i?2:0][1]}}])));
(async()=>{fs.mkdirSync(out,{recursive:true});const dir=fs.mkdtempSync(path.join(os.tmpdir(),'socket2063-'));
 const ctx=await chromium.launchPersistentContext(dir,{headless:true,executablePath:process.env.CHROME_PATH,viewport:{width:800,height:800},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const results={},rows=[];try{for(const [tag,url]of [['före',before],['efter',base]]){const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});await p.goto(url+'/tools/avatareyes.html');await p.waitForFunction(()=>window.__ready,{timeout:90000});const tiles=[];
 for(const [name,o]of cases){const r=await p.evaluate(o=>window.__frame({dist:1.2,fov:16,seconds:1,follow:true,...o}),o);if(r.calls!==1)errors.push(`${name}: ${r.calls} calls`);const data=await p.evaluate(()=>document.querySelector('canvas').toDataURL('image/jpeg',.9));tiles.push({name,data});}
 const times=await p.evaluate(()=>{const times=[];for(let i=0;i<15;i++){const t=performance.now();window.__frame({dist:1.2,fov:16,seconds:0,follow:true});document.querySelector('canvas').toDataURL();times.push(performance.now()-t);}return times.slice(3)});
 results[tag]={errors,frames:cases.length,renderReadbackMs:times.reduce((a,b)=>a+b)/times.length};if(errors.length)throw Error(errors.join('\n'));rows.push([tag,tiles]);await p.close();}
 const page=await ctx.newPage();await page.setContent('<canvas></canvas>');
 for(const [file,start,end]of [['ogon',0,12],['reglage',12,18],['tillbehor-blink',18,closeStart],['narbild',closeStart,cases.length]]){await page.evaluate(async({rows,start,end})=>{const c=document.querySelector('canvas'),tw=240,th=180,lab=22,cols=4,n=end-start,lines=Math.ceil(n/cols);c.width=tw*cols;c.height=rows.length*lines*(th+lab);const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.font='13px sans-serif';g.fillStyle='#000';for(let r=0;r<rows.length;r++)for(let i=start;i<end;i++){const tile=rows[r][1][i],img=new Image();img.src=tile.data;await img.decode();const j=i-start,x=j%cols*tw,y=(r*lines+Math.floor(j/cols))*(th+lab);g.drawImage(img,0,0,img.width,img.height,x,y+lab,tw,th);g.fillText(rows[r][0]+': '+tile.name,x+3,y+16)}},{rows,start,end});await page.locator('canvas').screenshot({path:path.join(out,file+'.jpg')});}
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));console.log('PASS');
 }finally{await ctx.close();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
