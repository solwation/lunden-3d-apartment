// #871: real Ghosts/Combat/PlayerRoom and original statistics DOM; no apartment or WebGL.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const game=process.argv[2]||'http://localhost:8865',worker=process.argv[3]||'http://localhost:8866',out=process.argv[4]||'/tmp/lunden-player-kills';
const lines=[],errors=[];const check=(ok,label)=>{lines.push(`${ok?'PASS':'FAIL'} ${label}`);console.log(lines.at(-1));};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--disable-gpu']});
 const pages=[];
 async function setup(page,i){
  await page.evaluate(async({worker,i})=>{
   const context=HTMLCanvasElement.prototype.getContext;window.webglCalls=0;
   HTMLCanvasElement.prototype.getContext=function(kind,...args){if(/webgl/i.test(kind)){webglCalls++;throw Error('WebGL forbidden in kill fixture');}return context.call(this,kind,...args);};
   const T=await import('three'),{Ghosts}=await import('/src/ghosts.js'),{Combat}=await import('/src/combat.js'),S=await import('/src/stats.js');
   window.S=S;const scene=new T.Scene(),camera=new T.PerspectiveCamera();camera.position.set(i*2,1.62,0);
   window.weapon='nerf';window.active=true;window.hits=[];
   window.ghosts=new Ghosts({scene,camera,url:worker,name:()=>i?'Kill B':'Kill A',active:()=>active,state:()=>({p:[i*2,0,0],r:0}),weapon:()=>weapon,mirrored:()=>false});
   const original=ghosts.message.bind(ghosts);ghosts.message=data=>{try{const m=JSON.parse(data);if(m.t==='hit')hits.push(m);}catch{}original(data);};
   window.combat=new Combat({ghosts,scene,camera,weapon:()=>weapon,feet:()=>new T.Vector3(i*2,0,0),onHit:()=>S.bump('pvpHits'),onHurt:()=>S.penalize('pvpHurt')});
   window.tick=setInterval(()=>{ghosts.update();combat.update(0);},40);
   window.drawStats=()=>{document.getElementById('hud').hidden=false;document.getElementById('loading').hidden=true;document.getElementById('overlay').hidden=true;S.renderStats(document.getElementById('stats-body'));document.getElementById('stats').hidden=false;};
  },{worker,i});
 }
 try{
  for(let i=0;i<2;i++){
   const ctx=await browser.newContext(),page=await ctx.newPage({viewport:{width:1280,height:800}});pages.push(page);page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// native stats fixture, no apartment bootstrap'}));
   if(i===0)await page.addInitScript(()=>{if(!localStorage.getItem('lunden.stats'))localStorage.setItem('lunden.stats',JSON.stringify({pvpHits:2,target:33}));});
   await page.goto(game);await setup(page,i);
  }
  const [a,b]=pages;
  async function ready(){for(const p of pages)await p.waitForFunction(()=>ghosts.connected&&ghosts.others.size===1&&[...ghosts.others.values()][0].h==='nerf',null,{timeout:15000});}
  await ready();check(await a.evaluate(()=>S.stats.pvpKills===0&&S.stats.pvpHits===2),'old saved statistics migrate with zero kills and existing hit count intact');
  const score0=await a.evaluate(()=>S.totalScore());
  const fire=()=>a.evaluate(()=>ghosts.fire({w:'nerf',o:[0,1,0],d:[1,0,0],to:[...ghosts.others.values()][0].id}));
  await fire();await a.waitForFunction(()=>hits.length===1);
  check(await a.evaluate(()=>!('kill' in hits[0])&&!hits[0].dead&&S.stats.pvpKills===0),'actual nonlethal server hit adds no kill or receipt');
  const max=await b.evaluate(()=>combat.maxLives);
  for(let n=2;n<=max;n++){await a.waitForTimeout(550);await fire();await a.waitForFunction(n=>hits.length===n,n);}
  const receipt=await a.evaluate(()=>hits.at(-1));
  check(receipt.dead===true&&receipt.l===0&&/^[0-9a-f-]{36}$/.test(receipt.kill),'actual lethal server result supplies a unique receipt');
  check(await a.evaluate(()=>S.stats.pvpKills===1&&combat.hits===combat.maxLives),'actual Ghosts/Combat hit path records exactly one defeated opponent');
  check(await b.evaluate(()=>S.stats.pvpKills===0&&combat.deaths===1&&combat.lives===combat.maxLives),'victim own death/refill creates no kill statistic');
  const score1=await a.evaluate(()=>S.totalScore()),points=await a.evaluate(async()=> (await import('/src/config.js')).SCORE.each.pvpHits);
  check(score1-score0===max*points,'lethal hit uses only unchanged hit points, no kill bonus');
  check(await a.evaluate(m=>{const s=JSON.parse(localStorage.getItem('lunden.stats'));return s.pvpKills===1&&s.killReceipts[m.kill]===true;},receipt),'count and receipt are immediately persisted together in the existing statistics key');
  check(await a.evaluate(m=>!S.recordPlayerKill(m,ghosts.me)&&S.stats.pvpKills===1,receipt),'duplicate confirmed receipt is ignored without changing count');
  check(await a.evaluate(m=>{const score=S.totalScore();m={...m,kill:crypto.randomUUID()};const bad=[{...m,kill:undefined},{...m,kill:'bad'},{...m,kill:42},{...m,dead:false},{...m,dead:1},{...m,l:1},{...m,t:'hurt'},{...m,t:'fall'},{...m,to:ghosts.me},{...m,to:''}];return bad.every(x=>!S.recordPlayerKill(x,ghosts.me))&&S.stats.pvpKills===1&&S.totalScore()===score;},receipt),'legacy/malformed/nonlethal/own/hurt/fall results do not change kills or points');
  const oldId=await a.evaluate(()=>ghosts.me);
  await a.evaluate(()=>{ghosts.disconnect();ghosts.retryAt=0;ghosts.lastMove=performance.now();ghosts.update();});await ready();
  check(await a.evaluate(id=>ghosts.me!==id&&S.stats.pvpKills===1,oldId),'actual reconnect changes socket identity while retaining the kill counter');
  check(await a.evaluate(m=>!S.recordPlayerKill(m,ghosts.me)&&S.stats.pvpKills===1,receipt),'old receipt remains deduplicated after actual reconnect');
  await a.reload();await setup(a,0);await ready();
  check(await a.evaluate(()=>S.stats.pvpKills===1),'actual reload restores the kill counter');
  check(await a.evaluate(m=>!S.recordPlayerKill(m,ghosts.me)&&S.stats.pvpKills===1,receipt),'actual reload restores receipt deduplication');
  await a.evaluate(()=>drawStats());
  check(await a.locator('#stats-body .stat-row').filter({hasText:'Dödade spelare'}).locator('b').textContent()==='1','original statistics DOM displays the Swedish count');
  const row=a.locator('#stats-body .stat-row').filter({hasText:'Dödade spelare'});
  check(await row.isVisible(),'original HUD parent and statistics row are actually visible');
  const box=await row.boundingBox();check(!!box&&box.x>=0&&box.y>=0&&box.x+box.width<=1280&&box.y+box.height<=800,'kill row fits the native statistics viewport');
  await a.screenshot({path:out+'/statistics.png'});
  check(await a.evaluate(async()=>{const {clearLocalHome}=await import('/src/reset.js');clearLocalHome();return JSON.parse(localStorage.getItem('lunden.stats')).pvpKills===1;}),'existing home-reset whitelist preserves statistics and kill receipts');
  await a.evaluate(()=>{S.resetStats();drawStats();});
  check(await a.evaluate(m=>S.stats.pvpKills===0&&S.stats.pvpHits===undefined&&S.stats.killReceipts[m.kill]===true&&JSON.parse(localStorage.getItem('lunden.stats')).pvpKills===0,receipt),'visible statistics reset clears count and old dynamic counters while preserving receipt metadata');
  check(await a.evaluate(m=>!S.recordPlayerKill(m,ghosts.me)&&S.stats.pvpKills===0,receipt),'old receipt cannot become a new kill after statistics reset');
  await a.reload();await setup(a,0);await ready();
  check(await a.evaluate(m=>S.stats.pvpKills===0&&!S.recordPlayerKill(m,ghosts.me),receipt),'reset count and receipt survive genuine reload together');
  const previous=await a.evaluate(()=>S.totalScore()),before=await b.evaluate(()=>combat.hurts);
  for(let n=1;n<=max;n++){await a.waitForTimeout(550);await fire();await b.waitForFunction(n=>combat.hurts===n,n+before);}
  const next=await a.evaluate(()=>hits.at(-1));
  check(next.dead&&next.kill!==receipt.kill&&await a.evaluate(()=>S.stats.pvpKills===1),'a different genuine lethal hit counts normally after reset');
  check(await a.evaluate(()=>S.totalScore())-previous===max*points,'new kills after reset retain existing per-hit scoring only');
  check(await a.evaluate(m=>{const before=S.stats.pvpKills,score=S.totalScore();const invalid=[undefined,NaN,1].every(l=>!S.recordPlayerKill({...m,kill:crypto.randomUUID(),l},ghosts.me));const accepted=S.recordPlayerKill({...m,kill:crypto.randomUUID(),l:-.5},ghosts.me);return invalid&&accepted&&S.stats.pvpKills===before+1&&S.totalScore()===score;},next),'receipt reducer accepts synthetic finite-negative boundary, rejects missing/NaN/positive health without kill bonus');
  check(await Promise.all(pages.map(p=>p.evaluate(()=>webglCalls))).then(v=>v.every(n=>n===0)),'native fixture never requested WebGL');
  check(errors.length===0,'no native page errors');
  fs.writeFileSync(out+'/result.json',JSON.stringify({pass:lines.every(l=>l.startsWith('PASS')),lines,errors,receipt,next,scope:'Actual Ghosts/Combat/PlayerRoom, original statistics DOM and browser storage; no apartment rendering or physical phone'},null,2));
  console.log(lines.every(l=>l.startsWith('PASS'))?'ALL PASS':'SOME FAILED');if(lines.some(l=>l.startsWith('FAIL')))process.exitCode=1;
 }finally{for(const p of pages)await p.evaluate(()=>{clearInterval(window.tick);window.ghosts?.disconnect();}).catch(()=>{});await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
