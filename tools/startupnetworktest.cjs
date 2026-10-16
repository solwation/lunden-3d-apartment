// Real index/bootstrap/ES-module data failures; scene construction is intentionally not loaded.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.argv[2]||'http://localhost:8165';
const baseline=process.env.EXPECT_STARTUP_FAILURE==='1';
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});const results=[];try{
 for(const mode of ['normal','once-503','once-network','once-timeout','always-503','missing','invalid-json']){
  const context=await browser.newContext();const page=await context.newPage();let requests=0;const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/main.js*',r=>r.fulfill({contentType:'text/javascript',body:`import {fetchStartupJSON} from './startuprecovery.js';const plan=await fetchStartupJSON('data/plan.json',{timeout:150,retryDelay:10});window.dataReady=plan.ready;document.getElementById('loading').hidden=true;`}));
  await page.route('**/data/plan.json',r=>{requests++;if(mode==='once-network'&&requests===1)return r.abort('failed');if(mode==='once-timeout'&&requests===1)return;const status=mode==='missing'?404:mode==='always-503'||mode==='once-503'&&requests===1?503:200;return r.fulfill({status,contentType:'application/json',body:mode==='invalid-json'?'{invalid':JSON.stringify({ready:true})});});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.dataReady||document.querySelector('[data-startup-retry]'),{timeout:15000});
  const recovered=await page.evaluate(()=>!!window.dataReady),transient=mode.startsWith('once-');
  assert.equal(recovered,mode==='normal'||transient&&!baseline,`${mode}: startup outcome`);
  assert.equal(requests,mode==='normal'||mode==='missing'||mode==='invalid-json'||baseline?1:2,`${mode}: bounded number of requests`);
  assert.deepEqual(errors,[]);
  const result={mode,recovered,requests};results.push(result);console.log('PASS',JSON.stringify(result));await context.close();
 }
 if(!baseline){
  const page=await browser.newPage();await page.route('**/src/main.js*',r=>r.fulfill({contentType:'text/javascript',body:'throw new TypeError("known startup failure");'}));
  await page.goto(base);await page.locator('[data-startup-retry]').waitFor();
  const record=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('lunden.startupFailure')));
  assert.equal(record.name,'TypeError');assert.equal(record.message,'known startup failure');
  const consumed=await page.evaluate(async()=>{const{takeStartupFailure}=await import('./src/startuprecovery.js');return{failure:takeStartupFailure(),again:takeStartupFailure()};});
  assert.equal(consumed.failure.message,'known startup failure');assert.equal(consumed.again,null);
  await page.evaluate(()=>{sessionStorage.setItem('lunden.startupFailure','not-json');});
  assert.equal(await page.evaluate(async()=>{const{takeStartupFailure}=await import('./src/startuprecovery.js');return takeStartupFailure();}),null);
  const bounded=await page.evaluate(async()=>{
    const {recordStartupFailure,takeStartupFailure}=await import('./src/startuprecovery.js');
    recordStartupFailure(new Error('Failed https://example.test/app.js?token=private-value#private-fragment'));
    const safe=takeStartupFailure();
    sessionStorage.setItem('lunden.startupFailure',JSON.stringify({at:Date.now()-3600001,build:'old',name:'Error',message:'stale'}));
    const stale=takeStartupFailure();
    const descriptor=Object.getOwnPropertyDescriptor(window,'sessionStorage');
    Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw Error('blocked storage');}});
    recordStartupFailure(new Error('still safe'));const blocked=takeStartupFailure();
    Object.defineProperty(window,'sessionStorage',descriptor);
    return {safe,stale,blocked};
  });
  assert(!JSON.stringify(bounded.safe).includes('private-'));assert.equal(bounded.stale,null);assert.equal(bounded.blocked,null);
  console.log('PASS actual caught error preserved once; corrupt/stale records ignored; URL values stripped; blocked storage safe');
  const posted=[];
  await page.route('**/startup-crash-sink/crash',async route=>{posted.push(JSON.parse(route.request().postData()));await route.fulfill({contentType:'application/json',body:'{"ok":true}'});});
  await page.evaluate(()=>sessionStorage.setItem('lunden.startupFailure',JSON.stringify({at:Date.now(),build:'failed-build',name:'TypeError',message:'captured-before-import',stack:'technical stack'})));
  await page.unroute('**/src/main.js*');
  await page.route('**/src/main.js*',r=>r.fulfill({contentType:'text/javascript',body:"import {crashlog} from './crashlog.js';window.fixtureLog=crashlog;document.getElementById('loading').hidden=true;"}));
  await page.goto(base+'/?cloud='+encodeURIComponent(base+'/startup-crash-sink'));
  await page.waitForFunction(()=>window.fixtureLog);
  await page.waitForFunction(()=>sessionStorage.getItem('lunden.startupFailure')===null);
  await page.waitForTimeout(300);
  assert.equal(posted.filter(r=>r.kind==='startup').length,1);
  assert.equal(posted[0].build,'failed-build');assert.equal(posted[0].msg,'TypeError: captured-before-import');
  await page.reload();await page.waitForFunction(()=>window.fixtureLog);await page.waitForTimeout(100);
  assert.equal(posted.filter(r=>r.kind==='startup').length,1);
  console.log('PASS actual crash logger sends the preserved failed build/cause exactly once on next load');

 }
 console.log(JSON.stringify({baseline,passed:true,results}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
