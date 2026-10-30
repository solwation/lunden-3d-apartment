// #1710: the alternative top lists in the Topplista dialog (picker, a "flest" and a "först" list, touch width) against a fresh local Worker.
// node tools/boardstest.cjs SITE FRESH_LOCAL_WORKER OUT (three.js from ~/.cache/three-0.170.0 when the CDN is blocked)
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [site,worker,out]=process.argv.slice(2);
const api=(p,b)=>fetch(worker+p,{method:b?'POST':'GET',headers:{Origin:'http://localhost','Content-Type':'text/plain'},body:b&&JSON.stringify(b)}).then(r=>r.json());
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const seed=[['seed-ada-0001','Ada',{squirrelFeeds:240,catButts:12,steps:90000},'241302112'],['seed-sam-0001','Sam',{squirrelFeeds:120,catButts:30,steps:40000},'310220010165'],['seed-bea-0001','Bea',{squirrelFeeds:15,steps:1200},undefined]];
 for(const [id,name,c,avatar] of seed){await api('/boards',{id,name,c,avatar});await new Promise(r=>setTimeout(r,60));}
 const lists=(await api('/boards')).lists;console.log('GET /boards squirrels',JSON.stringify(lists['flest-squirrelFeeds']));
 assert(!JSON.stringify(lists).includes('seed-'),'no private ids');
 const browser=await chromium.launch(),errors=[];
 try{
  for(const touch of [false,true]){
   const p=await browser.newPage(touch?{viewport:{width:844,height:390},hasTouch:true,isMobile:true}:{viewport:{width:1100,height:800}});
   await p.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>{const f=path.join(process.env.HOME,'.cache/three-0.170.0',r.request().url().split('three@0.170.0/')[1]);return fs.existsSync(f)?r.fulfill({path:f,contentType:'text/javascript'}):r.abort();});
   p.on('pageerror',e=>errors.push(e.message));
   await p.addInitScript((n)=>{localStorage.setItem('lunden.name',n);localStorage.setItem('lunden.avatar','402230113172');sessionStorage.setItem('lunden.nameSkipped','1');},touch?'Mia':'Provspelare');
   await p.goto(`${site}/?shot&test=lazy${touch?'&touch':''}&cloud=${encodeURIComponent(worker)}&freeze&time=12&month=6`,{waitUntil:'commit'});
   await p.waitForFunction(()=>window.__app?.leaderboard?.boards,null,{timeout:240000});
   await p.evaluate(async()=>{const a=__app;a.stats.squirrelFeeds=60;a.stats.catButts=3;await a.leaderboard.boards.send();});
   const mine=(await api('/boards')).lists['flest-squirrelFeeds'].find(r=>r.name===(touch?'Mia':'Provspelare'));assert(mine&&mine.value===60,'own counters synced: '+JSON.stringify(mine));
   await p.evaluate(()=>__app.leaderboard.openLeaderboardDialog());
   assert.equal(await p.inputValue('#lb-board'),'score','Totalpoäng is the default');
   await p.selectOption('#lb-board','flest-squirrelFeeds');
   await p.waitForFunction(()=>document.querySelectorAll('#lb-dialog-list li').length>=4&&document.querySelector('#lb-dialog-list li.me'),null,{timeout:20000});
   const rows=await p.evaluate(()=>[...document.querySelectorAll('#lb-dialog-list li')].map(li=>li.textContent));
   console.log(touch?'touch':'desktop','squirrels',JSON.stringify(rows));assert(/Ada/.test(rows[0])&&/240 ekorrar/.test(rows[0]),'sorted by count');
   if(!touch){await p.locator('#lb-board').focus();}
   await p.locator('#leaderboard-dialog .card').screenshot({path:`${out}/${touch?'telefon-':''}flest-ekorrar.png`,timeout:120000});
   await p.selectOption('#lb-board','forst-catButts');
   await p.waitForFunction(()=>/Först/.test(document.getElementById('lb-board-hint').textContent)||true);
   await p.waitForTimeout(600);
   const first=await p.evaluate(()=>[...document.querySelectorAll('#lb-dialog-list li')].map(li=>li.textContent));
   console.log('first',JSON.stringify(first));assert(/Ada/.test(first[0]),'first by server time');
   await p.locator('#leaderboard-dialog .card').screenshot({path:`${out}/${touch?'telefon-':''}forst-kattrumpor.png`,timeout:120000});
   assert.equal(await p.evaluate(()=>localStorage.getItem('lunden.board')),'forst-catButts','pick is kept locally');
   if(touch){const w=await p.evaluate(()=>[document.documentElement.scrollWidth,innerWidth]);assert(w[0]<=w[1],'no horizontal scroll '+w);}
   await p.selectOption('#lb-board','score');await p.waitForTimeout(300);
   await p.locator('#leaderboard-dialog .card').screenshot({path:`${out}/${touch?'telefon-':''}totalpoang.png`,timeout:120000});
   await p.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS all');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
