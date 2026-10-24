// #1585: top lists with avatar thumbnails (dialog + Klossar board, real Worker data) and a Tab stats panel without a top list.
// node tools/leaderboardavatartest.cjs SITE FRESH_LOCAL_WORKER OUT (three.js from ~/.cache/three-0.170.0 when the CDN is blocked)
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [site,worker,out]=process.argv.slice(2);
const api=(p,b)=>fetch(worker+p,{method:b?'POST':'GET',headers:{Origin:'http://localhost','Content-Type':'text/plain'},body:b&&JSON.stringify(b)}).then(r=>r.json());
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const seed=[['seed-ada-0001','Ada',2400,'241302112'],['seed-sam-0001','Sam',1800,'310220010165'],['seed-sam-0002','Sam',1500,'1453101'],['seed-old-0001','Gammal',900,undefined],['seed-bea-0001','Bea',600,'99<img>']];
 for(const [id,name,score,avatar] of seed)await api('/scores',{id,name,score,avatar});
 for(const [id,name,score,avatar] of seed.slice(0,4))await api('/games/klossar',{id,name,score:Math.round(score/3),lines:2,ms:90000,avatar});
 const top=await api('/scores');console.log('GET /scores',JSON.stringify(top));
 assert(!JSON.stringify(top).includes('seed-'),'no private ids in GET');
 const browser=await chromium.launch(),errors=[];
 try{
  const p=await browser.newPage({viewport:{width:1100,height:800}});
  await p.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**',r=>{const f=path.join(process.env.HOME,'.cache/three-0.170.0',r.request().url().split('three@0.170.0/')[1]);return fs.existsSync(f)?r.fulfill({path:f,contentType:'text/javascript'}):r.abort();});
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{localStorage.setItem('lunden.name','Provspelare');localStorage.setItem('lunden.avatar','402230113172');sessionStorage.setItem('lunden.nameSkipped','1');});
  await p.goto(`${site}/?shot&test=lazy&cloud=${encodeURIComponent(worker)}&freeze&time=12&month=6`,{waitUntil:'commit'});
  await p.waitForFunction(()=>window.__app?.leaderboard&&window.__app?.computerHub,null,{timeout:240000});
  await p.evaluate(async()=>{const a=__app;a.stats.doors+=400;await a.leaderboard.send();await a.leaderboard.refresh();});
  const posted=(await api('/scores')).find(r=>r.name==='Provspelare');assert(posted&&posted.avatar,'own row carries the look code: '+JSON.stringify(posted));
  await p.evaluate(()=>__app.leaderboard.openLeaderboardDialog());
  await p.waitForFunction(()=>document.querySelectorAll('#lb-dialog-list li .lb-face').length>=6&&document.querySelector('#lb-dialog-list li.me'),null,{timeout:20000});
  const rows=await p.evaluate(()=>[...document.querySelectorAll('#lb-dialog-list li')].map(li=>({t:li.textContent,me:li.classList.contains('me'),face:!!li.querySelector('canvas.lb-face')})));
  console.log('dialog rows',JSON.stringify(rows));
  assert(rows.every(r=>r.face),'every row has a thumbnail');assert.equal(rows.filter(r=>/Sam/.test(r.t)).length,2,'two Sam rows');
  assert(rows.find(r=>r.me)?.t.includes('Provspelare'),'own row marked by key');
  // the neutral silhouette vs a drawn face: compare pixel variety
  const variety=await p.evaluate(()=>[...document.querySelectorAll('#lb-dialog-list li')].map(li=>{const c=li.querySelector('canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,s=new Set();for(let i=0;i<d.length;i+=4)s.add(d[i]<<16|d[i+1]<<8|d[i+2]);return[li.textContent.replace(/\d{4}-\d\d-\d\d/,''),s.size];}));
  console.log('thumb colours',JSON.stringify(variety));
  await p.locator('#leaderboard-dialog .card').screenshot({path:`${out}/topplista-dialog.png`,timeout:120000});
  await p.evaluate(()=>__app.leaderboard.closeLeaderboardDialog());
  // a game board: Klossar's global list through the real GameBoards + the monitor's canvas drawing and panel list
  const card=await p.evaluate(async()=>{const h=__app.computerHub,b=h.boards;await b.refresh('klossar',true);const {drawArcadeCard}=await import('/src/arcadeview.js');
   const c=document.createElement('canvas');c.width=1024;c.height=576;drawArcadeCard(c,'KLOSSAR','',b.top('klossar'),'#6cf');
   const ol=document.createElement('ol');ol.className='computer-top';const t=document.createElement('h4');h.renderTop(ol,t,'klossar');
   return{url:c.toDataURL('image/png'),rows:b.top('klossar').map(r=>[r.name,r.score,!!r.avatar,!!r.key]),panel:[...ol.querySelectorAll('li')].map(li=>[li.textContent,!!li.querySelector('canvas.lb-face')])};});
  fs.writeFileSync(`${out}/klossar-topplista.png`,Buffer.from(card.url.split(',')[1],'base64'));
  console.log('klossar',JSON.stringify(card.rows),JSON.stringify(card.panel));
  assert(card.panel.length>=4&&card.panel.every(r=>r[1]),'panel rows have thumbnails');
  // Tab statistics: no top list
  await p.evaluate(()=>__app.showOverlay(false));
  await p.keyboard.down('Tab');await p.waitForTimeout(700);
  const stats=await p.evaluate(()=>({shown:!document.getElementById('stats').hidden,rows:document.querySelectorAll('#stats-body .stat-row').length,lb:document.querySelectorAll('#stats-body ol.lb, #stats-body .lb-head, #stats-body .lb-face').length,text:document.getElementById('stats-body').textContent.includes('Provspelare')}));
  console.log('stats',JSON.stringify(stats));
  if(!stats.shown){await p.evaluate(()=>{const s=document.getElementById('stats');s.hidden=false;});await p.waitForTimeout(600);}
  const st2=await p.evaluate(()=>({rows:document.querySelectorAll('#stats-body .stat-row').length,lb:document.querySelectorAll('#stats-body ol.lb, #stats-body .lb-head, #stats-body .lb-face').length}));
  assert(st2.rows>5&&st2.lb===0,'stats has rows and no top list '+JSON.stringify(st2));
  await p.locator('#stats').screenshot({path:`${out}/tab-statistik.png`,timeout:120000});
  await p.keyboard.up('Tab');
  assert.deepEqual(errors,[]);console.log('PASS all');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
