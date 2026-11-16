// #2004 one component browser, exact frozen before modules, real own/remote consumers.
// CHROME_PATH=… tools/browsertest.sh node tools/avatarmotionbrowser.cjs BASE OUT
const fs=require('fs'),cp=require('child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [base='http://127.0.0.1:8804',out='docs/verification/2004']=process.argv.slice(2);
(async()=>{
 fs.mkdirSync(out,{recursive:true});const errors=[];
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:790}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/before/**',route=>{const rel=new URL(route.request().url()).pathname.slice('/before/'.length);let body;try{body=cp.execFileSync('git',['show','a05683d4:'+rel]);}catch{return route.abort();}return route.fulfill({contentType:rel.endsWith('.js')?'text/javascript':rel.endsWith('.glb')?'model/gltf-binary':'application/octet-stream',body});});
  await page.goto(base+'/tools/avatarmotion.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>motionReady,null,{polling:100,timeout:60000});
  await require('./avatarmotionverify.cjs')(page,out,browser);
  if(errors.length)throw Error(errors.join('\n'));await page.evaluate(()=>disposeMotion());
 }finally{await browser.close();}
 console.log('PASS #2004 sequence, contacts, explicit poses and warm update budget');
})().catch(e=>{console.error(e);process.exitCode=1;});
