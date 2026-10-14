// #669: real index CSS/matchMedia/viewport binding, actual CrashLog and camera; NO WebGL.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.argv[2],out=process.argv[3],baseline=process.argv.includes('--baseline');fs.mkdirSync(out,{recursive:true});
const files=['index.html','src/main.js','src/viewport.js','src/crashlog.js','src/config.js','tools/portraitlayouttest.cjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',f))).digest('hex')]));
const frozen=hashes(),checks=[],errors=[],rows=[];function check(ok,label,data){checks.push({ok:!!ok,label,data});console.log((ok?'PASS ':'FAIL ')+label);}
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-gpu']});try{
 const page=await browser.newPage({viewport:{width:852,height:393},hasTouch:true,deviceScaleFactor:3});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/bootstrap.js*',r=>r.fulfill({body:'',contentType:'application/javascript'}));await page.route('**/crash',r=>r.fulfill({body:'{}',contentType:'application/json'}));
 await page.goto(base+'/?lowmem&cloud='+encodeURIComponent(base));
 await page.evaluate(async()=>{
  const THREE=await import('three'),{bindGameViewport,gameView}=await import('/src/viewport.js'),{crashlog}=await import('/src/crashlog.js');
  const main=await(await fetch('/src/main.js')).text(),expr=main.match(/deferViewportResize = \(\) => ([\s\S]*?);/g).at(-1).replace('deferViewportResize = () => ','').slice(0,-1);
  const defer=new Function('lowMemory','shotMode','warm','startupSceneReady','document','portraitCover','return '+expr);
  const flags={lowMemory:true,shotMode:false,warm:{done:false},startupSceneReady:false};const media=matchMedia('(orientation: portrait) and (pointer: coarse) and (max-width: 1100px)');
  const canvas=document.createElement('canvas');canvas.id='game-canvas';document.body.prepend(canvas);let contextCalls=0;canvas.getContext=()=>{contextCalls++;throw Error('No GL allowed');};
  const camera=new THREE.PerspectiveCamera(72,1,.05,10),calls=[];const renderer={domElement:canvas,getPixelRatio:()=>.75,setSize(w,h,style){canvas.width=Math.floor(w*.75);canvas.height=Math.floor(h*.75);calls.push({w,h,style});}};
  const shouldDefer=()=>defer(flags.lowMemory,flags.shotMode,flags.warm,flags.startupSceneReady,document,media);
  const binding=bindGameViewport(renderer,camera,{deferResize:shouldDefer});crashlog.attach({renderer,camera,viewportBinding:binding});crashlog.report=(typ,kind,p)=>{window.reports.push({typ,kind,...p});return true;};window.reports=[];
  for(const id of ['loading','overlay','note','install-sheet']){const e=document.getElementById(id);if(e)e.hidden=true;}
  window.probe={flags,camera,canvas,renderer,binding,calls,media,gameView,crashlog,get contextCalls(){return contextCalls;},sample(){const m=crashlog.layoutMeasure(false,true);return{m,fault:crashlog.layoutFaultDetail(m,false),calls:structuredClone(calls),media:media.matches,cover:getComputedStyle(document.getElementById('rotate')).display,game:[gameView.w,gameView.h],contextCalls};}};
 });
 async function sample(name,size){if(size)await page.setViewportSize(size);await page.waitForFunction(()=>probe.canvas.clientWidth===probe.gameView.w&&probe.canvas.clientHeight===probe.gameView.h);const s=await page.evaluate(()=>probe.sample());rows.push({name,...s});return s;}
 let s=await sample('initial-landscape');check(!s.fault.msg&&s.m.buf.join()==='639,294','ordinary landscape projection is coherent',s);
 await page.evaluate(()=>{probe.flags.warm.done=true;probe.flags.startupSceneReady=true;probe.calls.length=0;});s=await sample('actual-covered-portrait',{width:393,height:793});
 check(s.media&&s.cover==='grid'&&s.game.join()==='393,793'&&s.m.buf.join()==='639,294'&&s.calls.length===0,'actual CSS/coarse media and binding defer preserve reported639×294 buffer',s);
 check(s.fault.faultClass===(baseline?'foreground-projection':'covered-projection')&&!!s.fault.msg,'covered projection '+(baseline?'reproduces old foreground report':'keeps msg/report with specific category'),s);
 if(!baseline){check(s.m.covered===1&&s.m.deferred===1&&s.m.retained.join()==='852,393','measured cover and cached actual binding state are bounded',s.m);}
 await page.evaluate(()=>{probe.crashlog.layoutSent=0;probe.crashlog.layoutCheck('fixture');});check(await page.evaluate(()=>reports.length===1&&!!reports[0].msg),'actual layoutCheck preserves report and message',await page.evaluate(()=>reports));
 const faults=await page.evaluate(()=>{const p=probe,m=p.crashlog.layoutMeasure(false,true),out=[],test=(name,v,hidden=false)=>out.push({name,fault:p.crashlog.layoutFaultDetail(v,hidden),m:v});
  const legacy={...m};delete legacy.covered;delete legacy.deferred;delete legacy.retained;test('legacy missing metadata stays strict',legacy);test('hidden retains background category',m,true);
  test('real CSS/window fault',{...m,inner:[393,750]});test('real visualViewport fault',{...m,vv:{...m.vv,h:700}});test('document mismatch',{...m,doc:[393,750]});test('rect offset',{...m,rect:[12,0,393,793]});test('retained aspect mismatch',{...m,aspect:1});test('retained buffer mismatch',{...m,buf:[639,310]});test('no actual pending defer',{...m,deferred:0});test('invalid retained size',{...m,retained:[0,393]});return out;});
 for(const f of faults)check(!!f.fault.msg&&f.fault.faultClass!=='covered-projection'&&(f.name!=='hidden retains background category'||f.fault.faultClass==='background-projection'),f.name,f);
 for(const [label,css] of [['hidden cover','display:none'],['transparent cover','background:transparent'],['partial cover','width:100px;height:100px;inset:auto;top:0;left:0'],['faded cover','opacity:.5']]){const row=await page.evaluate(css=>{const e=document.getElementById('rotate');e.style.cssText=css;const s=probe.sample();e.style.cssText='';return s;},css);check(!!row.fault.msg&&row.fault.faultClass!=='covered-projection',label+' cannot claim covered projection',row);}
 await page.screenshot({path:out+'/actual-portrait-cover.png',animations:'disabled'});
 s=await sample('return-original-landscape',{width:852,height:393});await page.evaluate(()=>probe.binding.flush());s=await sample('flushed-original-landscape');check(!s.fault.msg&&s.calls.length===0,'return original landscape flushes without buffer reallocation',s);
 await sample('second-covered-portrait',{width:393,height:793});await page.setViewportSize({width:844,height:390});await page.evaluate(()=>probe.binding.flush());s=await sample('new-landscape-flush');check(!s.fault.msg&&s.m.buf.join()==='633,292'&&s.calls.length===1,'different uncovered size flushes coherent actual camera/buffer',s);
 const bad=await page.evaluate(()=>{probe.camera.aspect=1;return probe.sample();});check(bad.fault.faultClass==='foreground-projection'&&!!bad.fault.msg,'genuine uncovered aspect error remains reportable',bad);
 check(await page.evaluate(()=>probe.contextCalls===0),'no WebGL/2D context acquired');check(!errors.length,'no browser errors',errors);check(JSON.stringify(hashes())===JSON.stringify(frozen),'executed source hashes exact');
 await page.evaluate(()=>probe.binding());
 }finally{await browser.close();fs.writeFileSync(out+'/result.json',JSON.stringify({baseline,checks,errors,rows,frozen,limits:'Actual index CSS/media/binding/CrashLog/camera with explicit renderer size stand-in; no WebGL/World/physical phone or crash cause claim.'},null,2));}if(checks.some(x=>!x.ok)||errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
