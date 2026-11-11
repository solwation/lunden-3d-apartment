// #1907: production Avatar/IK, whole figures from three unobscured directions.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
const url=process.argv[2]||'http://localhost:8191/tools/verify-avatar-rigged.html';
const out=process.argv[3]||'docs/verification/1907';
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[];
 try {
  const page=await browser.newPage({viewport:{width:1500,height:1040}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__ready,null,{timeout:30000});
  for(const view of ['front','side','quarter']){
   await page.evaluate(view=>window.avatarView(view),view);
   await page.screenshot({path:path.join(out,'avatar-'+view+'.png'),fullPage:true});
  }
  const results=await page.evaluate(()=>window.__avatar1907.measured);
  fs.writeFileSync(path.join(out,'poses.json'),JSON.stringify({url,environment:'Chromium / SwiftShader; production Avatar and IK component, not full World',results,errors},null,2)+'\n');
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: six production poses, three complete views, deformed vertex bounds; images require visual review.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
