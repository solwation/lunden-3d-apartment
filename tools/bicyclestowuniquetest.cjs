// #1035: actual unique owners (Miele, HeldDrawing, Wad)/Player/Life/keep, source-bound real mount/session/reload handlers.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),base=process.argv[2]||'http://localhost:8872',out=process.argv[3]||'/tmp/lunden-shots-stowreload1035/unique';
const read=f=>fs.readFileSync(path.join(root,f),'utf8'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const main=read('src/main.js'),worldSource=read('src/world.js'),original=read('tools/courtyardbicycletest.cjs'),definitions=original.slice(original.indexOf('function span('),original.indexOf('fs.mkdirSync(out'));
const parts=new Function('main','worldSource',definitions+';return parts;')(main,worldSource),start=original.indexOf('async ({parts,index,render})=>{'),end=original.indexOf('},{parts,index,render});}',start);
const setupSource=original.slice(start,end+1).replace('window.heldItem=()=>null;',"window.heldItem=(await import('/src/holdable.js')).heldItem;").replace('window.fns={active,use,standUp,placeNow,keepSession,','window.fns={active,use,standUp,placeNow,keepSession,saveCurrentResume,');
const setupOriginal=new Function('return ('+setupSource+')')();

const files=['src/keep.js','src/main.js','src/holdable.js','src/miele.js','src/posters.js','src/drawing.js','src/toiletpaper.js','src/cat.js','src/player.js','src/config.js','src/life.js','src/items.js','src/resume.js','src/courtyard.js','src/hand.js','tools/courtyardbicycletest.cjs','tools/bicyclestowfoodtest.cjs','tools/bicyclestowuniquetest.cjs'];
const hashes=Object.fromEntries(files.map(f=>[f,hash(read(f))]));
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(out+'/source.json',JSON.stringify({hashes,parts,setupSource},null,2));

const checks=[],errors=[],cases=[];let browser;
function check(ok,label,data){checks.push({ok:!!ok,label,data});console.log((ok?'PASS ':'FAIL ')+label);fs.writeFileSync(out+'/checkpoint.json',JSON.stringify({checks,errors,cases},null,2));}

(async()=>{try{
browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-gpu']});
const context=await browser.newContext({viewport:{width:900,height:600},hasTouch:true}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
page.setDefaultTimeout(5000);
await page.route('**/src/bootstrap.js*',r=>r.fulfill({contentType:'text/javascript',body:'// actual native components, no bootstrap/World'}));

async function setup(){
  await page.goto(base);
  await page.evaluate(setupOriginal,{parts,index:0,render:false});
  await page.evaluate(async()=>{
    const T=window.T,Held=await import('/src/holdable.js'),Keep=await import('/src/keep.js');
    const {MieleHeld}=await import('/src/miele.js'),{HeldDrawing,Posters}=await import('/src/posters.js'),{Drawing}=await import('/src/drawing.js');
    const {ToiletPaper}=await import('/src/toiletpaper.js'),{CatSpawner,BREEDS,VARIANTS,MIELE_COAT}=await import('/src/cat.js');
    const {Life}=await import('/src/life.js'),{Hand}=await import('/src/hand.js'),{Marks}=await import('/src/marks.js');

    window.Held=Held;window.Keep=Keep;window.keepWarnings=[];
    const warn=console.warn;
    console.warn=(...a)=>{if(String(a[0]).startsWith('keep:'))keepWarnings.push(a.map(String).join(' '));warn(...a);};

    window.scene=new T.Scene();scene.add(camera);
    window.hand=new Hand(camera,scene);
    window.hasRestoredBicycleHand=Keep.hasRestoredBicycleHand;
    window.sim=new Life({scene,camera});

    const toilet={kind:'lid',isOpen:true,toggle(){this.isOpen=!this.isOpen;},object:new T.Group(),flush:{pool:new T.Group(),t:1,toggle(){return true;}}};
    scene.add(toilet.object);scene.add(toilet.flush.pool);
    world.lids=[toilet];

    // Cat & Miele
    window.cat=new CatSpawner(world);scene.add(cat.object);
    window.miele=new MieleHeld(scene,camera,cat);
    window.mieleEvents=[];
    miele.onPickUp=()=>mieleEvents.push('pickup');
    miele.onHug=()=>mieleEvents.push('hug');
    miele.onLetGo=()=>mieleEvents.push('letgo');

    // Drawing & Posters
    window.drawing=new Drawing(scene,camera);
    window.marks=new Marks(scene,camera,[world.object],cat);
    window.posters=new Posters(scene,world,marks,null);
    window.heldDrawing=new HeldDrawing(scene,camera,drawing);
    heldDrawing.posters=posters;
    heldDrawing.rehang=(rec)=>posters.rehang(rec);
    heldDrawing.onDesk=(id)=>posters.onDelete?.(id);

    // Toilet paper
    window.toiletPaper=new ToiletPaper(scene,camera,world);
    toiletPaper.initLife(sim,world,d=>d.toggle());
    sim.restock();

    window.app={
      bicycleStow:{miele,heldDrawing,drawing:heldDrawing,toiletPaper,paper:toiletPaper},
      life:sim,holdables:[miele],cat,drawing,posters,heldDrawing,toiletPaper,scene,
      day:{hour:12,year:2026,month:10,date:14},lights:{},jetpack:{},suit:{},patio:{},world,
      BREEDS,VARIANTS
    };
    window.keepWorld=()=>Keep.saveWorld(app);

    window.describe=()=>{
      const item=Held.heldItem()??Held.stowedItem();
      let family,state;
      for(const [name,owner] of Object.entries(app.bicycleStow)){
        const s=owner.saveStowed(item);
        if(s){family=name;state=s;break;}
      }
      return {
        family,state,
        held:!!item?.held,
        stowed:!!Held.stowedItem(),
        parentCamera:item?.model?.parent===camera,
        pose:item?{p:item.model.position.toArray(),q:item.model.quaternion.toArray()}:null,
        miele:{catName:cat.catName,visible:cat.object.visible,held:cat.held,seen:cat.seen,hugs:miele.hugs,handPose:miele.handPose},
        drawing:{image:heldDrawing.image,meta:heldDrawing.meta,deskBlank:drawing.blank,postersCount:posters.list.length},
        wad:{sheets:toiletPaper.wad.sheets,rollLeft:toiletPaper.holders[0]?.item?.amount??toiletPaper.holders[0]?.left}
      };
    };

    window.prepare=()=>{
      if(player.riding)player.spawn(-14.38,13.4,0);
      player.spawn(bike.position.x-1.8,bike.position.z,0);
      focused=bike.target;
    };
    window.mount=()=>fns.use(bike.target);
    window.exit=()=>fns.standUp();

    if(resumed?.world)Keep.loadWorld(app,resumed.world);

    window.seed=kind=>{
      prepare();
      let item;
      if(kind==='miele'){
        const mieleBreed=BREEDS.find(b=>b.superRare);
        cat.setCat(mieleBreed,mieleBreed.coats[0],false);
        cat.object.visible=true;
        cat.seen=true;cat.photoDone=true;
        miele.take();
        miele.use(); // 1 hug
        mieleEvents.length=0;
        item=miele;
      }else if(kind==='drawing-desk'){
        drawing.ctx.fillStyle='#e03020';
        drawing.ctx.fillRect(10,10,60,60);
        drawing.tex.needsUpdate=true;
        drawing.blank=false;
        heldDrawing.take(drawing.take());
        item=heldDrawing;
      }else if(kind==='drawing-poster'){
        drawing.clear(false);
        try{localStorage.removeItem('lunden.drawing');}catch{}
        const testImage='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        heldDrawing.take(testImage,{id:'poster-spec-1035',time:12345678,rec:{id:'poster-spec-1035',image:testImage,surface:'wall',pos:[0,1,0],normal:[0,0,1],rot:0,time:12345678,updated:12345678}});
        item=heldDrawing;
      }else if(kind==='wad'){
        const h=toiletPaper.holders[0];
        h.pull();h.pull(); // pull 2 sheets
        h.tear(); // tear off 2 sheets into wad
        item=toiletPaper.wad;
      }
      return describe();
    };
  });
}

await page.goto(base);
const kinds=['miele','drawing-desk','drawing-poster','wad'];

for(const mode of ['f5','update']){
  for(const kind of kinds){
    await page.evaluate(()=>{sessionStorage.clear();try{localStorage.clear();}catch{}});
    await setup();
    const before=await page.evaluate(k=>seed(k),kind);
    check(!!before.family&&before.held,'real '+kind+' owner creates changed actual held portion ('+mode+')',before);

    const transition=await page.evaluate(()=>{
      const item=Held.heldItem(),model=item.model;
      mount();
      const stowed=!!player.riding&&Held.stowedItem()===item&&!item.held&&!item.model.parent;
      world.roofs.above=()=>player.pos.y+.5;
      const denied=!player.dismountBicycle()&&Held.stowedItem()===item;
      world.roofs.above=()=>Infinity;
      exit();
      const same=Held.heldItem()===item&&item.model===model&&item.model.parent===camera;
      mount();
      return {stowed,denied,same,remounted:!!player.riding};
    });
    check(Object.values(transition).every(Boolean),'actual '+kind+' same-instance mount/denied exit/dismount/remount ('+mode+')',transition);

    const saved=await page.evaluate(mode=>{
      if(mode==='f5')fns.keepSession();else fns.saveCurrentResume({world:keepWorld()});
      const r=JSON.parse(sessionStorage.getItem(mode==='f5'?'lunden.session':'lunden.resume')),q=player.bicycleSavePlace();
      return{record:r,safe:q?.toArray(),events:window.mieleEvents??[]};
    },mode);
    check(!!saved.record.world.bicycleHand&&saved.record.feetY===saved.safe[1]&&!saved.events.length,'actual source '+mode+' saves stowed '+kind+' and safe feet with zero domain replay',saved);

    await page.reload();
    await setup();
    const after=await page.evaluate(()=>({
      data:describe(),
      standing:!player.riding&&!Held.bicycleHandsBusy(),
      events:window.mieleEvents??[],
      remembered:Keep.hasRestoredBicycleHand()
    }));
    cases.push({kind,mode,before,saved,after});

    const stateMatch=JSON.stringify(after.data.state)===JSON.stringify(before.state);
    const poseMatch=JSON.stringify(after.data.pose)===JSON.stringify(before.pose);
    let domainOk=true;
    if(kind==='miele'){
      domainOk=after.data.miele.catName==='Miele'&&after.data.miele.seen&&after.data.miele.hugs===1&&after.data.miele.handPose==='hug';
    }else if(kind.startsWith('drawing')){
      domainOk=after.data.drawing.deskBlank&&after.data.drawing.postersCount===0&&(kind==='drawing-desk'?!after.data.drawing.meta:after.data.drawing.meta?.id==='poster-spec-1035');
    }else if(kind==='wad'){
      domainOk=after.data.wad.sheets===2&&after.data.wad.rollLeft===before.wad.rollLeft;
    }
    check(after.standing&&after.remembered&&after.data.held&&after.data.parentCamera&&stateMatch&&poseMatch&&domainOk&&!after.events.length,'genuine '+mode+' reload restores exact '+kind+' identity/content once while standing',after);

    const repeated=await page.evaluate(mode=>{
      if(mode==='f5')fns.keepSession();else fns.saveCurrentResume({world:keepWorld()});
      return !!JSON.parse(sessionStorage.getItem(mode==='f5'?'lunden.session':'lunden.resume')).world.bicycleHand;
    },mode);
    check(repeated,'already restored '+kind+' remains covered for repeated '+mode+' reload');

    await page.reload();
    await setup();
    const again=await page.evaluate(()=>({data:describe(),events:window.mieleEvents??[]}));
    check(JSON.stringify(again.data.state)===JSON.stringify(before.state)&&!again.events.length,'second actual '+mode+' reload cannot mint/eat/reward '+kind,again);

    const cleared=await page.evaluate(()=>{
      const item=Held.heldItem();
      item.putBack?.()??item.hide?.();
      return !Keep.hasRestoredBicycleHand()&&!Keep.saveWorld(app).bicycleHand;
    });
    check(cleared,'putting '+kind+' away stops the restored-hand receipt immediately');
  }
}

// Malformed / legacy tests
await page.evaluate(()=>sessionStorage.clear());
await setup();
const malformed=await page.evaluate(()=>{
  const warnings=keepWarnings.length;
  const before=JSON.stringify({catName:cat.catName,visible:cat.object.visible,held:cat.held,sheets:toiletPaper.wad.sheets,drawingHeld:heldDrawing.held});
  const bad=[
    null,
    {v:2,kind:'miele',state:{}},
    {v:1,kind:'__proto__',state:{}},
    {v:1,kind:'miele',state:{name:'NotMiele',seen:true}},
    {v:1,kind:'miele',state:{name:'Miele',seen:'yes'}},
    {v:1,kind:'miele',state:{name:'Miele',seen:true,hugs:-1}},
    {v:1,kind:'heldDrawing',state:{image:123}},
    {v:1,kind:'heldDrawing',state:{image:'http://malicious'}},
    {v:1,kind:'heldDrawing',state:{image:'data:image/png;base64,123',meta:'bad'}},
    {v:1,kind:'toiletPaper',state:{sheets:0}},
    {v:1,kind:'toiletPaper',state:{sheets:999}},
    {v:1,kind:'toiletPaper',state:{sheets:'two'}}
  ];
  for(const r of bad)Keep.loadWorld(app,{v:1,bicycleHand:r});
  return{
    same:before===JSON.stringify({catName:cat.catName,visible:cat.object.visible,held:cat.held,sheets:toiletPaper.wad.sheets,drawingHeld:heldDrawing.held}),
    empty:!Held.heldItem(),
    silent:keepWarnings.length===warnings,
    count:bad.length
  };
});
check(malformed.same&&malformed.empty&&malformed.silent,'unknown/legacy/malformed optional stow records are silent and mint no stock',malformed);

// Reset during stow tests
const resetTests=await page.evaluate(()=>{
  // Test miele reset during ride
  seed('miele');
  mount();
  cat.hide();
  const catAbsent=!Keep.saveWorld(app).bicycleHand;
  player.spawn(-14.38,13.4,0);

  // Test drawing reset during ride
  seed('drawing-desk');
  mount();
  heldDrawing.release();
  const drawingAbsent=!Keep.saveWorld(app).bicycleHand;
  player.spawn(-14.38,13.4,0);

  // Test wad reset during ride
  seed('wad');
  mount();
  toiletPaper.reset();
  const wadAbsent=!Keep.saveWorld(app).bicycleHand;
  player.spawn(-14.38,13.4,0);

  return{catAbsent,drawingAbsent,wadAbsent,empty:!Held.heldItem()&&!Held.bicycleHandsBusy()};
});
check(Object.values(resetTests).every(Boolean),'actual owner reset during riding cannot save or resurrect removed unique items',resetTests);

check(await page.evaluate(()=>webglCalls===0),'native integration requests zero WebGL');
check(errors.length===0,'zero browser page errors',errors);
check(files.every(f=>hash(read(f))===hashes[f]),'all executed runtime/producer paths stay frozen');

await page.evaluate(rows=>{
  for(const el of document.body.children)if(el.tagName!=='SCRIPT')el.hidden=true;
  const log=document.createElement('pre');
  log.textContent='Actual bicycle unique items reload checks (DOM diagnostics, no rendered models/World)\n'+rows.map(x=>(x.ok?'PASS ':'FAIL ')+x.label).join('\n');
  log.style.cssText='white-space:pre-wrap;font:12px monospace;background:#fff;color:#111';
  document.body.append(log);
},checks);
await page.setViewportSize({width:1100,height:1100});
await page.screenshot({path:out+'/native-unique-reloads.png'});

fs.writeFileSync(out+'/result.json',JSON.stringify({checks,errors,cases,hashes,limits:'Actual unique owners (Miele, HeldDrawing, Wad), actual Player + source-bound main mount/save/reload. Minimal scene/camera/collision collaborators; no fullWorld/physical phone/FPS or render claim.'},null,2));
process.exitCode=checks.every(x=>x.ok)?0:1;
}catch(e){
  console.error(e);
  fs.writeFileSync(out+'/failure.json',JSON.stringify({checks,errors,cases,error:e.stack},null,2));
  process.exitCode=1;
}finally{
  await browser?.close();
}})();
