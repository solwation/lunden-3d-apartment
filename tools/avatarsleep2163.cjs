// #2163: browser run. tools/browsertest.sh node tools/avatarsleep2163.cjs BASE OUT  (BEFORE_REV = frozen base revision, default be173bd4)
const fs=require('fs'),cp=require('child_process'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [base='http://127.0.0.1:8238',out='docs/verification/2163']=process.argv.slice(2);
const rev=process.env.BEFORE_REV||'be173bd4';
(async()=>{
 fs.mkdirSync(path.join(out,'before'),{recursive:true});const errors=[];
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:300}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/before/**',route=>{const rel=new URL(route.request().url()).pathname.slice('/before/'.length);let body;try{body=cp.execFileSync('git',['show',rev+':'+rel],{maxBuffer:1<<28});}catch{return route.abort();}return route.fulfill({contentType:rel.endsWith('.js')?'text/javascript':'application/octet-stream',body});});
  await page.goto(base+'/tools/avatarsleep2163.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.ready,null,{polling:100,timeout:90000});
  const save=(f,b)=>fs.writeFileSync(path.join(out,f),Buffer.from(b,'base64'));
  await page.evaluate(()=>{let x=12345;Math.random=()=>(x=(x*16807)%2147483647)/2147483647;});
  const down=[{t:0,pose:0,x:.9},{t:.3,pose:2,x:0}],up=[{t:0,pose:2,x:0},{t:.3,pose:0,x:.9}],lie=[{t:0,pose:2,x:0}];
  const seq=[.2,1.0,1.9,3.0],log={};
  for(const v of ['before','after']){
   const d=v==='before'?'before/':'';
   save(d+'lie-down.png',await page.evaluate(([v,s,t])=>run(v,s,t,'side'),[v,down,seq]));
   save(d+'get-up.png',await page.evaluate(([v,s,t])=>run(v,s,t,'side'),[v,up,seq]));
   save(d+'sleep-head.png',await page.evaluate(([v,s,t])=>run(v,s,t,'head'),[v,lie,[2,6,20,26]]));
   log[v]=await page.evaluate(v=>probe(v),v);
   if(v==='after')save('sleep-side.png',await page.evaluate(([v,s,t])=>run(v,s,t,'foot'),[v,lie,[3,30,48,70]]).catch(e=>{throw e}));
  }
  fs.writeFileSync(path.join(out,'probe.json'),JSON.stringify(log));
  if(errors.length)throw Error(errors.join('\n'));
  console.log('done',JSON.stringify(log));
 }finally{await browser.close();}
})();
