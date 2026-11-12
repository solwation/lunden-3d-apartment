// Actual Hand consumer, paired source baseline, fixed lighting/camera and bounded warm timing.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const [base='http://localhost:8200',out='docs/verification/1917/after',phase='after']=process.argv.slice(2);
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 fs.rmSync(path.join(out,'results.json'),{force:true});
 fs.writeFileSync(path.join(out,'state.json'),JSON.stringify({status:'running',phase,startedAt:new Date().toISOString()}));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[],rows=[];
 try{
  const page=await browser.newPage({viewport:{width:1000,height:770}});page.on('pageerror',e=>{errors.push(e.message);console.error('PAGEERROR',e.stack)});
  const sourcePath=base+(phase==='before'?'/__before/src/hand.js':'/src/hand.js');
  const sourceHash=crypto.createHash('sha256').update(await (await page.request.get(sourcePath)).body()).digest('hex');
  await page.goto(base+'/tools/hand-realism.html'+(phase==='before'?'?before':''),{waitUntil:'networkidle'});
  if(errors.length)throw Error(errors.join('\n'));
  await page.waitForFunction(()=>window.__ready,null,{timeout:10000});
  for(const mode of ['reach','grip','palm','hug','web','wet','bare','accessories']){
   for(const detail of [false,true,'back']){
    const record=await page.evaluate(([m,d])=>handAudit.pose(m,d),[mode,detail]);
    if(!record.finite||!record.geometryShared||record.morphCounts.some(n=>n!==record.vertices))throw Error('Broken geometry/morph layout: '+mode);
    rows.push({mode,detail,...record});
    await page.screenshot({path:path.join(out,`${mode}-${detail==='back'?'back':detail?'detail':'normal'}.png`)});
   }
  }
  const timings=[];
  for(let round=0;round<3;round++){
   await page.evaluate(()=>handAudit.pose('reach',false));
   timings.push(await page.evaluate(()=>handAudit.timing(100)));
  }
  const construction=await page.evaluate(()=>handAudit.construction());
  if(errors.length)throw Error(errors.join('\n'));
  if(sourceHash!==crypto.createHash('sha256').update(await (await page.request.get(sourcePath)).body()).digest('hex'))throw Error('Source changed during capture');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({phase,head:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),handSHA256:sourceHash,environment:{browser:browser.version(),renderer:'SwiftShader',viewport:[1000,700],dpr:1},rows,timings,construction,errors},null,2)+'\n');
  fs.writeFileSync(path.join(out,'state.json'),JSON.stringify({status:'passed',phase,finishedAt:new Date().toISOString(),handSHA256:sourceHash}));
  console.log('PASS '+phase+': eight actual Hand states × normal/inspection; three warm samples; zero page errors.');
 }finally{await browser.close();}
})().catch(e=>{fs.writeFileSync(path.join(out,'state.json'),JSON.stringify({status:'failed',phase,error:e.message,finishedAt:new Date().toISOString()}));console.error(e);process.exitCode=1});
