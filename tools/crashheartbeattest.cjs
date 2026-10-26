// #669: actual native Chromium visibility + production CrashLog/Worker, no renderer/WebGL.
// Run from repo root: PLAYWRIGHT_MODULE=... CHROME_PATH=... node tools/crashheartbeattest.cjs [OUTPUT_DIR] [--baseline]
// A URL or flag argument (e.g. http://localhost:8634) is never an output path: the test runs its own server, results default to /tmp/crash-heartbeat (#1634).
// Controlled timestamps below model stale storage; they are not elapsed phone/crash measurements.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { spawn } = require('node:child_process'), { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--') && !/^[a-z][a-z0-9+.-]*:\/\//i.test(a)) || '/tmp/crash-heartbeat'), baseline = process.argv.includes('--baseline');
fs.mkdirSync(out, { recursive: true });
const root = process.cwd(), sourceFiles = ['src/crashlog.js','src/config.js','src/cloud.js','src/version.js','src/lowmemory.js','cloudflare/crash.js','cloudflare/worker.js','tools/crashheartbeattest.cjs'];
const hashes = () => Object.fromEntries(sourceFiles.map(f => [f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
const result = { baseline, frozen: hashes(), checks: [], reports: [], projections: [], errors: [], noWebGL: true };
const write = () => fs.writeFileSync(path.join(out,'result.json'), JSON.stringify(result,null,2)+'\n');
const check = (ok, label, data) => { result.checks.push({ok:!!ok,label,data}); write(); assert.ok(ok,label); console.log('PASS '+label); };
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const proc = pid => { const p='/proc/'+pid; const s=fs.readFileSync(p+'/stat','utf8'); return {pid,startTicks:s.slice(s.lastIndexOf(')')+2).split(' ')[19],cwd:fs.readlinkSync(p+'/cwd'),status:fs.readFileSync(p+'/status','utf8').match(/^PPid:\s*(\d+)/m)?.[1]}; };
(async()=>{
  const worker = (await import(pathToFileURL(path.join(root,'cloudflare/worker.js')))).default;
  const store = new Map(), kv = {
    async get(k,t) {const e=store.get(k);return e ? t==='json'?JSON.parse(e.v):e.v:null;},
    async getWithMetadata(k) {const e=store.get(k);return {value:e?.v??null,metadata:e?.meta??null};},
    async put(k,v,o={}) {store.set(k,{v,meta:o.metadata});}, async delete(k) {store.delete(k);},
    async list(o={}) {return {keys:[...store.keys()].filter(k=>k.startsWith(o.prefix??'')).map(name=>({name,metadata:store.get(name).meta})),list_complete:true};}
  };
  const env={LUNDEN:kv,ADMIN_TOKEN:'local-heartbeat-only'};
  const server=http.createServer(async(req,res)=>{
    try {
      if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
      if(req.url.startsWith('/crash')) {
        const chunks=[];for await(const c of req)chunks.push(c);
        const body=Buffer.concat(chunks).toString();
        if(req.method==='POST') {result.reports.push(JSON.parse(body));write();}
        const request=new Request('http://localhost:8878'+req.url,{method:req.method,headers:req.headers,...(body?{body}: {})});
        const response=await worker.fetch(request,env);
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
      }
      if(req.url.startsWith('/fixture')) {
        res.setHeader('Content-Type','text/html');res.end(`<!doctype html><title>Heartbeat native lifecycle fixture</title>
          <p>Production CrashLog, native tab visibility, local Worker. No WebGL or apartment.</p>
          <script type="importmap">{"imports":{"three":"/__three/build/three.module.js"}}</script>
          <script>HTMLCanvasElement.prototype.getContext=function(){throw Error('Canvas context forbidden in heartbeat fixture')};
          window.events=[];document.addEventListener('visibilitychange',()=>events.push({hidden:document.hidden,t:Date.now()}));
          window.loadCrash=async()=>{window.crash=(await import('/src/crashlog.js')).crashlog;clearInterval(crash.timer);return crash.snapshot()};</script>`);return;
      }
      const name=new URL(req.url,'http://localhost').pathname;
      const file=name.startsWith('/__three/')?path.join(os.homedir(),'.cache/three-0.170.0',name.slice(9)):path.join(root,name);
      res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/plain');res.end(fs.readFileSync(file));
    }catch(e){result.errors.push(String(e));write();res.writeHead(500);res.end(String(e));}
  });
  let child,browser,profile,exitPromise,timer;
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8878,'127.0.0.1',resolve);});
    profile=fs.mkdtempSync(path.join(os.tmpdir(),'heartbeat-669-'));
    child=spawn(process.env.CHROME_PATH||chromium.executablePath(),['--headless','--no-sandbox','--disable-gpu','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','about:blank'],{stdio:['ignore','ignore','pipe']});
    exitPromise=new Promise(resolve=>{child.once('exit',(code,signal)=>{result.chromeExit={code,signal};resolve();});child.once('error',resolve);});
    result.owner={node:proc(process.pid),chrome:proc(child.pid),profile,start:new Date().toISOString()};write();
    const endpoint=await new Promise((resolve,reject)=>{let text='';timer=setTimeout(()=>reject(Error('CDP timeout')),10000);child.stderr.on('data',b=>{text+=b;const m=text.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});child.once('error',reject);});
    browser=await chromium.connectOverCDP(endpoint,{noDefaults:true,timeout:10000});
    const ctx=browser.contexts()[0], control=ctx.pages()[0];
    await control.goto('http://127.0.0.1:8878/fixture?control');
    const make=async()=>{const p=await ctx.newPage();p.on('pageerror',e=>result.errors.push(String(e)));await p.goto('http://127.0.0.1:8878/fixture?cloud=http://127.0.0.1:8878');await p.waitForFunction(()=>window.loadCrash);return p;};
    const beat=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('lunden.crash.beat')));
    const clear=p=>p.evaluate(()=>localStorage.clear());
    const page=await make();await clear(page);
    await control.bringToFront();await page.waitForFunction(()=>document.hidden);
    const initial=await page.evaluate(()=>loadCrash());
    const persisted=await beat(page);
    check(initial.hidden===1&&persisted.hidden===1&&persisted.s===(baseline?'run':'bg'),'actual initially hidden DOM persists '+(baseline?'the original run despite hidden DOM':'bg'),{initial,persisted,events:await page.evaluate(()=>events)});
    await page.bringToFront();await page.waitForFunction(()=>!document.hidden);
    check((await beat(page)).s==='run','native visible transition persists run');
    await control.bringToFront();await page.waitForFunction(()=>document.hidden);
    check((await beat(page)).s==='bg','native hidden transition persists bg');
    await page.bringToFront();await page.waitForFunction(()=>!document.hidden);
    await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
    check((await beat(page)).s==='clean','nonpersisted pagehide marks clean (synthetic PageTransitionEvent)');
    await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    check((await beat(page)).s==='bg','persisted pagehide marks bg (synthetic PageTransitionEvent)');
    // A foreign tab must not mark the shared heartbeat that it does not own.
    await page.evaluate(()=>{const b=JSON.parse(localStorage.getItem('lunden.crash.beat'));b.tab='other-owner';b.s='run';localStorage.setItem('lunden.crash.beat',JSON.stringify(b));crash.mark('clean');});
    check((await beat(page)).s==='run','mark preserves another tab ownership');
    await page.close();
    async function restart(label,old,want){
      const p=await make();await p.bringToFront();await p.waitForFunction(()=>!document.hidden);await clear(p);
      env.LUNDEN={...kv}; // independent local Worker binding/cache per controlled restart case
      const n=result.reports.length;
      await p.evaluate(b=>localStorage.setItem('lunden.crash.beat',JSON.stringify(b)),old);
      await p.evaluate(()=>loadCrash());
      await p.evaluate(async()=>{await fetch('/fixture?barrier')});await sleep(80);
      const sent=result.reports.slice(n);
      check(sent.length===want,label,{old,sent});
      if(want){
        const r=sent[0];assert.equal(r.kind,'killed');assert.equal(r.build,old.build);assert.equal(r.gap,Math.round((r.ts-old.t)/1000));assert.equal(r.why,r.gap<=180?'quick':'late','#1629 why: back within 180 s is quick, later is late');
        const rows=await (await fetch('http://127.0.0.1:8878/crash/public')).json();
        result.projections.push(rows);write();
        check(rows.some(r=>r.kind==='killed'&&r.build===old.build&&r.state.background===(old.hidden?1:0)),'actual Worker POST/public keeps original build/background and seconds');
      }
      await p.close();
    }
    await restart('new initially hidden beat follows existing bg policy after restart',{...persisted,t:Date.now()-21926_000,tab:'initial-hidden-source',build:'hidden-new'},baseline?1:0);
    const old={...persisted,t:Date.now()-21926_000,tab:'old-hidden-source',build:'7834406',s:'run',hidden:1};
    await restart('legacy hidden run remains an ambiguous abrupt signal',old,1);
    await restart('stale visible run still reports abrupt ending',{...old,tab:'actual-foreground',hidden:0},1);
    await restart('#1629 a visitor back after 40 s is a quick return',{...old,tab:'quick-return',t:Date.now()-40_000,hidden:0,build:'quick1629'},1);
    for(const s of ['bg','clean'])await restart('stale '+s+' does not report',{...old,tab:'old-'+s,s,hidden:0},0);
    await restart('fresh visible run from another tab does not report',{...old,tab:'fresh-tab',t:Date.now(),hidden:0},0);
    // Duplicate old foreground record remains deduplicated without resetting its daily record.
    const p=await make();await p.bringToFront();await clear(p);await p.evaluate(()=>loadCrash());
    const caps=await p.evaluate(()=>{const b={tab:'same-dead',s:'run',hidden:0,t:Date.now()-10000};const a=crash.report('död','killed',{beat:b,gap:10}),dup=crash.report('död','killed',{beat:b,gap:10});for(let i=0;i<30;i++)crash.report('fel','error',{msg:'cap '+i});return{a,dup,n:crash.sessionSent,max:crash.stats.sent.length,drops:crash.stats.dropped.length};});
    check(caps.a&&!caps.dup&&caps.n===12&&caps.max===12&&caps.drops>0,'foreground dedup and original per-session cap survive',caps);
    await p.close();
    // #1626: the covering panel and the age of the last resize reach the heartbeat, the loss report and the public view.
    const q=await make();await q.bringToFront();await q.waitForFunction(()=>!document.hidden);await clear(q);await q.evaluate(()=>loadCrash());
    env.LUNDEN={...kv};const n1626=result.reports.length;
    const panel=await q.evaluate(async()=>{const c=document.createElement('canvas');document.body.append(c);let open='note';
      crash.attach({renderer:{domElement:c,getPixelRatio:()=>1},panel:()=>open});crash.beat();const beat=JSON.parse(localStorage.getItem('lunden.crash.beat'));
      dispatchEvent(new Event('resize'));await new Promise(r=>setTimeout(r,1200));open=null;crash.beat();
      c.dispatchEvent(new Event('webglcontextlost'));await fetch('/fixture?barrier');
      return{beatPanel:beat.panel,rows:JSON.parse(localStorage.getItem('lunden.crash.beat')).history.map(r=>r.panel)};});
    await sleep(80);
    const lost=result.reports.slice(n1626).find(r=>r.kind==='webglcontextlost');
    const pub=(await (await fetch('http://127.0.0.1:8878/crash/public')).json()).find(r=>r.kind==='webglcontextlost');
    check(panel.beatPanel==='note'&&panel.rows.at(-2)==='note'&&panel.rows.at(-1)===null&&lost?.context.panel===null&&lost.context.surfaceAgeS>=1.1&&lost.context.surfaceAgeS<10
      &&pub?.context.surfaceAgeS===lost.context.surfaceAgeS&&pub.context.surface.kind==='window-resize'&&pub.state.history.at(-2).panel==='note','#1626 panel and surface age reach heartbeat, loss report and public view',{panel,context:lost?.context,public:pub?.context});
    await q.close();
    check(result.errors.length===0,'no page/server errors and no canvas contexts');
    assert.deepEqual(hashes(),result.frozen,'frozen source bytes unchanged');result.finished=new Date().toISOString();write();
  }finally{
    clearTimeout(timer);
    if(browser)await browser.close();
    if(child){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await Promise.race([exitPromise,sleep(3000)]);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exitPromise;}}
    if(profile)await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
    await new Promise(resolve=>server.close(resolve));result.cleanup={profileRemoved:!profile||!fs.existsSync(profile),end:new Date().toISOString()};write();
  }
})().catch(e=>{result.failure=String(e.stack||e);write();console.error(e);process.exitCode=1;});
