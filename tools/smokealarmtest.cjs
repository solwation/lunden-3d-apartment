// #1179: actual Chicken/Grill/Hood/AirFryer/FishPack/Fries/SmokeAlarm + verbatim main alarm binding; no World/WebGL.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const [base='http://localhost:8795',out='/tmp/lunden-alarm1179-codex/after']=process.argv.slice(2),baseline=process.env.BASELINE_CHICKEN;
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-gpu']});const errors=[];
 try{const p=await browser.newPage({viewport:{width:1000,height:720}});p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/src/bootstrap.js*',r=>r.fulfill({body:'// actual bounded module fixture',contentType:'text/javascript'}));
 if(baseline)await p.route('**/src/chicken.js*',r=>r.fulfill({body:fs.readFileSync(baseline,'utf8'),contentType:'text/javascript'}));await p.goto(base);
 const result=await p.evaluate(async baseline=>{
  const get=HTMLCanvasElement.prototype.getContext;window.glCalls=0;HTMLCanvasElement.prototype.getContext=function(k,...a){if(/webgl/i.test(k)){glCalls++;throw Error('WebGL forbidden');}return get.call(this,k,...a);};
  const T=await import('three'),C=await import('/src/config.js'),{Chicken}=await import('/src/chicken.js'),{Grill}=await import('/src/grill.js'),{Pan}=await import('/src/pan.js'),{Hood,SmokeAlarm}=await import('/src/hood.js'),{AirFryer}=await import('/src/airfryer.js'),{FishPack}=await import('/src/fishfingers.js'),{Fries}=await import('/src/fries.js'),{sfx}=await import('/src/audio.js');
  const checks=[],check=(ok,label)=>{checks.push({ok:!!ok,label});if(!ok)throw Error(label);},audio={starts:0,stops:0,rings:0};sfx.alarm=()=>{audio.starts++;return{stop(){audio.stops++;}};};
  const scene=new T.Scene(),camera=new T.PerspectiveCamera();scene.add(camera);const drawer={object:new T.Group(),normal:new T.Vector3(0,0,1)},fridge={object:new T.Group(),shelfSpot:new T.Vector3(0,1,0),isOpen:true};scene.add(drawer.object,fridge.object);
  const hob={zone:new T.Vector3(4,.93,2),on:true},pan=new Pan(scene,camera,drawer,hob),chicken=new Chicken(scene,camera,fridge,pan,hob),grills=[new Grill(),new Grill({kind:'kettle',local:true})];grills.forEach(g=>scene.add(g.object));
  const hood=new Hood({x0:3.7,x1:4.3,z0:1.7,z1:2.3,y0:1.8,y1:2.1});chicken.hood=hood;
  const freezer={inside:{cx:0,cz:0},shelves:[.4,.7],isOpen:true},fryer=new AirFryer(.93),fish=new FishPack(scene,camera,freezer),fries=new Fries(scene,camera,freezer,fryer);fish.fryer=fryer;scene.add(fryer.object);
  const smokeAlarm=new SmokeAlarm();smokeAlarm.onRing=()=>audio.rings++;
  const main=await(await fetch('/src/main.js')).text(),line=main.split('\n').find(l=>l.trim().startsWith('smokeAlarm.update(dt,'));if(!line)throw Error('missing production main alarm binding');
  const mainAlarm=new Function('dt','smokeAlarm','chicken','fish','fries',line);const runAlarm=(seconds)=>{for(let t=0;t<seconds;t+=.1)mainAlarm(.1,smokeAlarm,chicken,fish,fries);};
  const silent=label=>{const calls=audio.starts;runAlarm(C.SMOKE_ALARM.delay+.5);check(!smokeAlarm.ringing&&audio.starts===calls,label);};
  const pick=()=>{chicken.take();check(chicken.held,'real whole-bird take succeeds');};
  silent('raw chicken in fridge does not alarm');
  for(const grill of grills){
   pick();grill.set(true,{silent:true});check(chicken.intoGrill(grill),'actual lit grill accepts bird');
   for(let t=0;t<C.CHICKEN.cookSeconds+.1;t+=.1)chicken.update(.1);
   check(chicken.done&&chicken.smoking&&chicken.smoke.some(s=>s.visible),'real grilled chicken has unchanged visible hot smoke');silent(grill.kind+' cooking outdoors does not alarm');
   pick();chicken.placeAt(new T.Vector3(2,.75,14));chicken.update(.01);check(chicken.smoking,'finished bird retains visual smoke after actual patio placement');
   if(baseline){runAlarm(C.SMOKE_ALARM.delay+.5);check(smokeAlarm.ringing&&audio.starts===1,'BEFORE: finished patio bird falsely starts actual kitchen alarm');smokeAlarm.reset();break;}
   silent(grill.kind+' finished bird on patio plate does not alarm');pick();silent('finished bird carried in hand does not alarm');
   chicken.placeAt(new T.Vector3(4,.93,2));chicken.update(.01);silent('finished bird placed in kitchen is still not active cooking');
   pick();chicken.intoGrill(grill);for(let t=0;t<C.CHICKEN.burnSeconds;t+=.1)chicken.update(.1);check(chicken.burnt,'continued actual grilling still burns bird');silent('burning outdoor grill is not an indoor source');
   pick();chicken.placeAt(new T.Vector3(2,.75,14));chicken.update(.01);silent('burnt bird removed to patio cannot feed indoor alarm');
  }
  let baselineAudio=null;
  if(baseline){baselineAudio={...audio};chicken.goHome();fridge.isOpen=false;chicken.update(.1);fridge.isOpen=true;audio.starts=audio.stops=audio.rings=0;}
  {
   // Exercise the existing active air-fryer sources with actual placement and heating; no new pan/fan policy.
   fish.press();fryer.setOpen(true);fish.airfryHeld();fryer.setOpen(false);fryer.update(1);fryer.press();const finger=fish.inFryer[0];check(!!finger&&fryer.cooking,'actual fish is in a running fryer');
   finger.cook=C.FISH.fry.burnAt;finger.fry(.1);check(fish.fryerSmoke,'actual burnt heating fish emits kitchen alarm source');runAlarm(C.SMOKE_ALARM.delay+.5);check(smokeAlarm.ringing&&audio.starts===1&&audio.rings===1,'existing fish fryer starts alarm/audio and penalty callback once');
   fryer.stop();mainAlarm(.1,smokeAlarm,chicken,fish,fries);check(!smokeAlarm.ringing&&audio.stops===1&&smokeAlarm.smokyFor===0,'stopping heat immediately stops alarm and clears delay');finger.take();finger.placeAt(new T.Vector3(2,.75,14));silent('finished removed fish is not a kitchen source');
   fryer.setOpen(true);fries.pour();fryer.setOpen(false);fryer.update(1);fryer.press();fries.cook=C.FRIES.burnAt;fries.update(.1);check(fries.smoke,'actual burnt fries in heating fryer remain a source');runAlarm(C.SMOKE_ALARM.delay+.5);check(smokeAlarm.ringing&&audio.starts===2,'existing fries source starts actual alarm/audio');
   fryer.setOpen(true);mainAlarm(.1,smokeAlarm,chicken,fish,fries);check(!smokeAlarm.ringing&&audio.stops===2,'taking basket out pauses heat and quiets alarm');fryer.setOpen(false);fryer.update(1);runAlarm(C.SMOKE_ALARM.delay+.5);check(smokeAlarm.ringing&&audio.starts===3,'continued actual heating must cross full delay again');smokeAlarm.reset();check(!smokeAlarm.ringing&&audio.stops===3,'existing F/reset stops actual alarm/audio');fryer.stop();
   // The obsolete chicken-pan hook must fail closed on stale flags; real Chicken.intoPan remains refused.
   if(!baseline){pick();check(chicken.intoPan()===false&&chicken.held,'grill-only chicken still refuses pan cooking');chicken.inPan=true;silent('stale inPan flag while held cannot turn finished smoke into cooking');chicken.inPan=false;}
   hood.set(true);const point=hob.zone.clone().add(new T.Vector3(0,.12,0));check(hood.draws(point),'actual hood still captures under its running intake');hood.set(false);check(!hood.draws(point),'actual stopped hood does not draw smoke');
   chicken.putBack();fridge.isOpen=false;chicken.update(.1);check(!chicken.smoking,'closed fridge still ends visual smoke');silent('cool/reset chicken stays quiet');
  }
  check(glCalls===0,'all cooking/alarm assertions use zero WebGL');
  document.body.replaceChildren();const h=document.createElement('h1');h.textContent=baseline?'Före: färdig grillmat startar kökslarm':'Efter: färdig grillmat är tyst';document.body.append(h);const pre=document.createElement('pre');pre.textContent=checks.map(c=>'PASS '+c.label).join('\n')+'\n\nAudio start/stop: '+audio.starts+'/'+audio.stops+'\nNative modules; no World or WebGL. Audio output is a counted stub.';document.body.append(pre);return{checks,audio,baselineAudio,line,glCalls};
 },!!baseline);
 assert.deepEqual(errors,[]);const paths=['src/chicken.js','src/hood.js','src/main.js','src/airfryer.js','src/fishfingers.js','src/fries.js','tools/smokealarmtest.cjs'];result.hashes=Object.fromEntries(paths.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));result.errors=errors;result.baselineHash=baseline?crypto.createHash('sha256').update(fs.readFileSync(baseline)).digest('hex'):null;
 fs.writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2));await p.screenshot({path:`${out}/native-alarm.png`,fullPage:true});console.log(`PASS ${result.checks.length} native cooking/alarm checks`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
