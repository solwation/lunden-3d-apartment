// Standalone real Three/Marks/Darts fixture, no renderer or apartment bootstrap.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const previous = execFileSync('git', ['show', '524ebc9:src/marks.js'], { cwd: root, encoding: 'utf8' });
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/marks.js?baseline=524ebc9',route=>route.fulfill({contentType:'application/javascript',body:previous}));
  await page.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',route=>{
   const cached=path.join(process.env.HOME,'.cache/three-0.170.0',route.request().url().split('three@0.170.0/')[1]);
   return fs.existsSync(cached)?route.fulfill({path:cached,contentType:'application/javascript'}):route.continue();
  });
  await page.goto(`${process.env.BASE||'http://127.0.0.1:8715'}/tools/marksbroadphasetest.html`);
  await page.waitForFunction(()=>window.result,null,{timeout:60000});
  const result=await page.evaluate(()=>window.result);console.log(result.lines.join('\n'));
  if(errors.length)console.error(errors.join('\n'));process.exitCode=result.pass&&!errors.length?0:1;
  if(process.env.SHOTS){fs.mkdirSync(process.env.SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.SHOTS,'marks-broad-phase.png'),fullPage:true});fs.writeFileSync(path.join(process.env.SHOTS,'result.json'),JSON.stringify({...result,errors},null,2));}
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
