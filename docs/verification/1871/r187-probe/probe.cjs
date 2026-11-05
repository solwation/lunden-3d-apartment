const fs=require('node:fs'),path=require('node:path');
const repo=process.argv[2],three=process.argv[3],out=process.argv[4];
const kit=require(path.join(repo,'tools/testkit.cjs'));
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await kit.launch();const report={three:JSON.parse(fs.readFileSync(path.join(three,'package.json'))).version,errors:[],warnings:[],requests:[]};let page;
try{page=await browser.newPage({viewport:{width:800,height:500}});
page.on('pageerror',e=>{report.errors.push(e.stack);console.log('PAGEERROR',e.message)});
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warning'&&report.warnings.length<30)report.warnings.push(m.text())});
await page.route('https://cdn.jsdelivr.net/npm/three@*/**',r=>{const file=r.request().url().split(/three@[^/]+\//)[1];report.requests.push(file);return r.fulfill({path:path.join(three,file),contentType:'text/javascript'})});
await page.goto('http://127.0.0.1:8171/?test=lazy&shot&time=12&month=6&weather=clear&freeze&cloud=',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.__app?.renderer||window.__startupError,null,{timeout:150000});
report.runtime=await page.evaluate(async()=>{const T=await import('three'),A=window.__app;if(!A)return{ready:false};A.renderer.setAnimationLoop(null);return{ready:true,revision:T.REVISION,renderer:A.renderer.constructor.name,webgpu:!!navigator.gpu,render:A.renderer.info.render}});
console.log('RUNTIME',JSON.stringify(report.runtime));
if(report.runtime.ready){await kit.skipNameDialog(page);await kit.shot(page,path.join(out,'apartment.png'),{viewport:{width:800,height:500},frames:1});report.draw=await page.evaluate(()=>({...__app.renderer.info.render,programs:__app.renderer.info.programs.length}));}
}catch(e){report.failure=e.stack;console.log('FAILURE',e.message);if(page)await page.screenshot({path:path.join(out,'failure.png'),timeout:15000}).catch(()=>{});process.exitCode=1}
finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log('saved',out)}})();
