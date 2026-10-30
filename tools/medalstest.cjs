// #1711: medals — the grid in Meny → Medaljer (desktop + touch width), a live level that spins in the middle of the screen
// and ends, the bonus once, the restore on a second device without a bonus, and no page error.
// node tools/medalstest.cjs SITE FRESH_LOCAL_WORKER OUT   (three.js from ~/.cache/three-0.170.0 when the CDN is blocked)
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [site,worker,out]=process.argv.slice(2);
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch(),errors=[];
 const open=async(touch,name,pid)=>{
  const ctx=await browser.newContext(touch?{viewport:{width:844,height:390},hasTouch:true,isMobile:true}:{viewport:{width:1100,height:800}});
  const p=await ctx.newPage();
  await p.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>{const f=path.join(process.env.HOME,'.cache/three-0.170.0',r.request().url().split('three@0.170.0/')[1]);return fs.existsSync(f)?r.fulfill({path:f,contentType:'text/javascript'}):r.abort();});
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(([n,id])=>{localStorage.setItem('lunden.name',n);localStorage.setItem('lunden.playerId',id);localStorage.setItem('lunden.avatar','402230113172');sessionStorage.setItem('lunden.nameSkipped','1');},[name,pid]);
  await p.goto(`${site}/?shot&test=lazy${touch?'&touch':''}&cloud=${encodeURIComponent(worker)}&freeze&time=12&month=6`,{waitUntil:'commit'});
  await p.waitForFunction(()=>window.__app?.medals?.ready,null,{timeout:240000});
  return p;
 };
 try{
  for(const touch of [false,true]){
   const pid=`medal-test-${touch?'t':'d'}-0001`,pre=touch?'telefon-':'';
   const p=await open(touch,touch?'Mia':'Provspelare',pid);
   // the menu grid: a few unlocked, the rest locked with progress, a secret
   await p.evaluate(()=>{const a=__app;Object.assign(a.stats,{squirrelFeeds:70,petted:230,steps:15000,falls:12,sandwiches:11});a.stats.taskCounts={washDish:4,makeBed:10};a.stats.tasks=14;a.stats.medalsSeeded=true;});
   await p.evaluate(()=>{__app.medals.check();__app.medals.queue.length=0;__app.medals.pop.hidden=true;});
   await p.evaluate(()=>{document.getElementById('menu-medals').click();});
   await p.waitForSelector('#medal-grid li');
   const info=await p.evaluate(()=>({n:document.querySelectorAll('#medal-grid li').length,got:document.querySelectorAll('#medal-grid li.got').length,secret:[...document.querySelectorAll('#medal-grid li.secret')].length,txt:document.getElementById('medal-count').textContent,w:[document.documentElement.scrollWidth,innerWidth]}));
   console.log(touch?'touch':'desktop',JSON.stringify(info));
   assert(info.n>=20&&info.got>=3&&info.secret>=1,'grid has unlocked, locked and secret');assert(info.w[0]<=info.w[1],'no horizontal scroll');
   await p.locator('#medal-dialog .card').screenshot({path:`${out}/${pre}menyn.png`,timeout:120000});
   await p.evaluate(()=>document.getElementById('medal-dialog-close').click());
   // a live level while playing: two at once -> a queue, one spinning at a time, each ends, bonus once each
   await p.evaluate(()=>{document.getElementById('overlay').hidden=true;window.__pts0=__app.stats.medalPoints??0;const s=__app.stats;s.squirrelFeeds=100;s.sandwiches=26;});
   await p.waitForFunction(()=>!document.getElementById('medal-pop').hidden,null,{timeout:15000});
   await p.waitForTimeout(900);
   const first=await p.evaluate(()=>({name:document.querySelector('#medal-pop .medal-name').textContent,lvl:document.querySelector('#medal-pop .medal-level').textContent,q:__app.medals.queue.length}));
   console.log('pop',JSON.stringify(first));
   await p.screenshot({path:`${out}/${pre}medaljen-mitt-i-rutan.png`,timeout:120000});
   await p.waitForFunction(()=>document.getElementById('medal-pop').hidden&&!__app.medals.queue.length&&!__app.medals.showing,null,{timeout:20000});
   const paid=await p.evaluate(()=>__app.stats.medalPoints-window.__pts0);
   assert.equal(paid,30,'bonus: squirrels level 2 (+20) and sandwiches level 1 (+10)');
   await p.waitForTimeout(4000);
   assert.equal(await p.evaluate(()=>__app.stats.medalPoints-window.__pts0),paid,'bonus is paid once');
   // the menu opening while it spins drops it and puts it back
   await p.evaluate(()=>{__app.stats.petted=300;});
   await p.waitForFunction(()=>!document.getElementById('medal-pop').hidden,null,{timeout:15000});
   await p.evaluate(()=>{document.getElementById('overlay').hidden=false;});
   await p.waitForFunction(()=>document.getElementById('medal-pop').hidden&&__app.medals.queue.length===1,null,{timeout:8000});
   await p.evaluate(()=>{document.getElementById('overlay').hidden=true;});
   await p.waitForFunction(()=>document.getElementById('medal-pop').hidden&&!__app.medals.queue.length&&!__app.medals.showing&&__app.stats.medals.cats.l===3,null,{timeout:20000});
   // sync, then a second device with the same player id gets the medals back silently
   await p.evaluate(async()=>{await __app.leaderboard.boards.send();});
   if(!touch){
    const q=await open(false,'Provspelare',pid);
    const r=await q.evaluate(()=>({sq:__app.stats.medals.squirrels?.l,cats:__app.stats.medals.cats?.l,pts:__app.stats.medalPoints,pop:!document.getElementById('medal-pop').hidden,seeded:__app.stats.medalsSeeded}));
    console.log('second device',JSON.stringify(r));
    assert.equal(r.sq,2);assert.equal(r.cats,2,'the server caps the jump 230 -> 300 at perMin (cats level 2 only)');assert.equal(r.pts,0,'restore pays no bonus');assert.equal(r.pop,false);
    await q.context().close();
   }
   await p.context().close();
  }
  assert.deepEqual(errors,[]);console.log('PASS all');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
