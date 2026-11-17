// #2067 fixed before/after skin detail, three tones, close/day/backlit, motion, budget and matched render cost.
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [site='http://localhost:8174',out='docs/verification/2067']=process.argv.slice(2);
const baseline=process.env.BASELINE||'24957657', old=Object.fromEntries(['src/config.js','src/avatarskin.js'].map(f=>[f,execFileSync('git',['show',`${baseline}:${f}`],{maxBuffer:32e6})]));
(async()=>{fs.mkdirSync(out,{recursive:true});const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'skin2067-'));
 const ctx=await chromium.launchPersistentContext(tmp,{headless:true,executablePath:process.env.CHROME_PATH,viewport:{width:400,height:400},args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const data={baseline,source:execFileSync('git',['rev-parse','HEAD']).toString().trim()},errors=[],rows=[];
 try{for(const tag of ['before','after']){const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 if(tag==='before')await p.route('**/src/**',r=>{const f=new URL(r.request().url()).pathname.slice(1);return old[f]?r.fulfill({contentType:'text/javascript',body:old[f]}):r.continue();});
 await p.goto(site+'/tools/avatarskin2067.html');await p.waitForFunction(()=>window.__ready,null,{timeout:120000});data[tag]={};const tiles=[];
 for(const tone of ['ljus','mellan','mörk'])for(const kind of ['day','back']){const r=await p.evaluate(([t,k])=>window.__snap2067(t,'face',k),[tone,kind]);assert.equal(r.calls,1);tiles.push([tone+' '+kind,r.image]);}
 for(const [view,kind,state]of [['cheek','day','rest'],['ear','back','rest'],['face','day','sweat'],['face','day','rain']]){const r=await p.evaluate(([v,k,s])=>window.__snap2067('mellan',v,k,s),[view,kind,state]);tiles.push([view+' '+kind+' '+state,r.image]);assert.equal(r.calls,1);}
 data[tag].budget=await p.evaluate(()=>window.__budget2067());data[tag].shimmer={};for(const d of [2,5]){const r=await p.evaluate(d=>window.__shimmer(d,'mellan',8),d);data[tag].shimmer[d]=r;if(tag==='after')assert.ok(r.ratio<=1.1,`shimmer${d}: ${r.ratio}`);}
 data[tag].ms=await p.evaluate(()=>window.__time2067());rows.push([tag,tiles]);await p.close();}
 assert.deepEqual(data.before.budget,data.after.budget);
 const p=await ctx.newPage();await p.setContent('<canvas/>');await p.evaluate(async rows=>{const c=document.querySelector('canvas'),w=300,h=320;c.width=w*5;c.height=h*4;const x=c.getContext('2d');x.fillStyle='#eee';x.fillRect(0,0,c.width,c.height);x.font='13px sans-serif';for(let r=0;r<rows.length;r++)for(let i=0;i<rows[r][1].length;i++){const [name,url]=rows[r][1][i],im=new Image();im.src=url;await im.decode();const xx=i%5*w,yy=(r*2+Math.floor(i/5))*h;x.drawImage(im,xx,yy+20,w,w);x.fillStyle='#111';x.fillText(rows[r][0]+': '+name,xx+4,yy+15);}},rows);await p.locator('canvas').screenshot({path:path.join(out,'hud-fore-efter.png')});await p.close();
 data.errors=errors;fs.writeFileSync(path.join(out,'skin.json'),JSON.stringify(data,null,2)+'\n');assert.equal(errors.length,0,errors.join('\n'));console.log('PASS',JSON.stringify(data));
 }finally{await ctx.close();fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
