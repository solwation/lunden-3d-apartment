// #2002: one owned browser, early source-bound art review before final scoped verification.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const out='docs/verification/2002',base=process.argv[2]||'http://localhost:8802',gate=process.env.ART_REVIEW_GATE;
const files=['src/avatar.js','src/config.js','src/olof.js','src/avatarpreview.js'],baseline='a05683d477d8705c912cd88b323ee21c555dcce6';
const old=Object.fromEntries(files.map(f=>[f,execFileSync('git',['show',`${baseline}:${f}`],{maxBuffer:8e6})]));const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{for(let revision=0;;revision++){
 const proof={baseline,revision,hashes:{}};
 for(const phase of ['before','after']){
  const page=await browser.newPage({viewport:{width:1200,height:600}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(phase==='before')for(const[f,body]of Object.entries(old))await page.route(`**/${f}`,r=>r.fulfill({contentType:'text/javascript',body}));
  await page.goto(`${base}/tools/verify-avatar-head.html`);await page.waitForFunction(()=>window.__ready);
  for(const[mode,meeting]of [['quarter',false],['profile',false],['front',true]]){
   await page.evaluate(({mode,meeting})=>{const H=window.H;H.setLooks(H.looks.filter((_,i)=>meeting||[0,1,4].includes(i)));H.draw(mode,meeting);},{mode,meeting});
   await page.screenshot({path:`${out}/${phase==='before'?'before/':''}${meeting?'meeting':mode}.png`});
  }
  proof.hashes[phase]=Object.fromEntries(files.map(f=>[f,hash(phase==='before'?old[f]:fs.readFileSync(f))]));proof[phase+'Errors']=errors;await page.close();
 }
 fs.writeFileSync(`${out}/art.json`,JSON.stringify(proof,null,2)+'\n');console.log('HEAD_ART_READY',revision);
 if(!gate)break;const end=Date.now()+600000;while(!fs.existsSync(gate)){if(Date.now()>end)throw Error('art review gate timed out');await new Promise(r=>setTimeout(r,1000));}
 const decision=fs.readFileSync(gate,'utf8').trim();fs.unlinkSync(gate);if(decision==='revise')continue;
 break;
 }}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
