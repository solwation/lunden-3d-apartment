// #884 pure counter + actual index/Presence HUD, optional bounded actual-apartment draw integration.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.argv[2] || 'http://localhost:8871',out=process.argv[3] || '/tmp/lunden-fps884-surface',app=process.argv.includes('--app');
let checks=0;const check=(ok,text)=>{assert.ok(ok,text);checks++;console.log(`PASS ${text}`);};
(async()=>{
  fs.mkdirSync(out,{recursive:true});const {FrameRate}=await import('../src/fps.js');
  let f=new FrameRate();f.sample(0,false,true);for(let i=1;i<=100;i++)f.sample(i*10,i%5<3,true);
  check(f.value===60,'60 ordinary draws / 100 logic callbacks / second gives 60 FPS');
  f=new FrameRate();f.sample(0,false,true);for(let i=1;i<=100;i++)f.sample(i*10,i%10===0,true);
  check(f.value===10,'covered-view 10 draws / 100 callbacks gives 10 FPS');
  const last=f.value;f.sample(1100,false,true);check(f.value===last,'positive last window retained until next sampling deadline');
  f.sample(1200,true,false);check(f.value===null&&f.frames===0,'pause/hidden excludes draws and clears stale value');
  f.sample(100000,true,true);check(f.value===null,'resume starts a new elapsed-time baseline');
  for(let i=1;i<=50;i++)f.sample(100000+i*10,i%10===0,true);check(f.value===10,'resume has no stale spike from the old window');
  f=new FrameRate();for(let i=0;i<=100;i++)f.sample(i*10,true,false);check(f.value===null&&f.frames===0,'covered startup/warm-up is not credited as ordinary gameplay');
  f.sample(2000,false,true);for(let i=1;i<=100;i++)f.sample(2000+i*10,i%5<3,true);check(f.value===60,'ordinary count is independent of extra passes not reported by its caller');
  f.sample(10,true,true);check(f.value===null,'clock discontinuity clears old window');
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:app?['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--no-sandbox','--disable-gpu']});
  const errors=[],results=[];
  try{
    if(!app){
      const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));let count=7,fail=false;
      await page.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// native HUD only'}));
      await page.route('**/fixture-api/presence/**',r=>fail?r.abort('failed'):r.fulfill({contentType:'application/json',body:JSON.stringify({count,names:['Tester'],players:[{name:'Tester',score:1}]})}));
      for(const [width,height] of [[568,320],[667,375],[844,390],[1280,720]])for(const safe of [[0,0,0,0],[44,44,20,20],[44,0,18,0]]){
        await page.setViewportSize({width,height});count=7;fail=false;await page.goto(base);
        await page.evaluate(async({width,safe,base})=>{
          const {initHudIcons,setWeatherIcon}=await import('/src/hudicons.js'),{setScoreElement}=await import('/src/stats.js'),{Presence}=await import('/src/presence.js'),{FrameRate}=await import('/src/fps.js');
          const T=await import('three'),{Compass}=await import('/src/compass.js'),{Combat}=await import('/src/combat.js');
          initHudIcons();document.body.classList.toggle('touch',width<1000);for(const [i,k]of ['sl','sr','st','sb'].entries())document.documentElement.style.setProperty('--'+k,safe[i]+'px');
          for(const id of ['overlay','loading','rotate'])document.getElementById(id).hidden=true;
          const score=document.getElementById('score');setScoreElement(score);const weather=document.createElement('span');weather.id='weather';setWeatherIcon(weather,'cloud','Molnigt');
          const temp=document.createElement('span');temp.id='temp';temp.textContent='−23°';const level=document.createElement('span');level.id='level';level.textContent='23:59';score.prepend(weather,temp,level);score.append(document.getElementById('terminal-btn'));
          score.querySelector('.score-val').textContent='123 456';window.presence=new Presence(base+'/fixture-api',document.getElementById('presence'));window.fpsNode=presence.el.querySelector('.fps-value');
          window.rate=new FrameRate();rate.sample(0,false,true);for(let i=1;i<=100;i++)rate.sample(i*10,i%5<3,true);fpsNode.textContent=String(rate.value);
          const camera=new T.PerspectiveCamera();window.compass=new Compass(camera,document.getElementById('compass'));
          window.combat=new Combat({camera,scene:new T.Scene(),ghosts:{connected:true,others:new Map([['foe',{h:'nerf',root:{visible:true},snaps:[{}]}]])},weapon:()=> 'nerf',feet:()=>new T.Vector3()});
          combat.life(7);combat.update(0);combat.hit({w:'rifle',head:true,to:'foe',l:9,dead:false});document.getElementById('hud').hidden=false;
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        },{width,safe,base});
        await page.waitForFunction(()=>presence.count===7);count=24;await page.evaluate(()=>presence.beat());
        check(await page.evaluate(()=>presence.count===24&&presence.el.querySelector('.fps-value')===fpsNode&&fpsNode.textContent==='60'),`${width}: actual Presence response retains FPS cell/node/value`);
        fail=true;await page.evaluate(()=>presence.beat());fail=false;
        check(await page.evaluate(()=>fpsNode.textContent==='60'),`${width}: offline heartbeat does not remove FPS`);
        const row=await page.evaluate(({width,height,safe})=>{
          const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON(),online=rect('.presence-online'),fps=rect('.presence-fps'),box=rect('#presence'),score=rect('#score'),right=rect('#hud-top'),compass=rect('#compass'),lives=rect('#lives'),marker=rect('#hit-marker'),cross=rect('#crosshair');
          const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;
          const inside=(a,b)=>a.left>=b.left-.2&&a.right<=b.right+.2&&a.top>=b.top-.2&&a.bottom<=b.bottom+.2;
          const glyph=s=>{const r=document.createRange();r.selectNodeContents(document.querySelector(s));return r.getBoundingClientRect().toJSON();};
          return {width,height,safe,online,fps,box,score,right,compass,lives,marker,stack:online.top<fps.top&&Math.abs(online.bottom-fps.top)<.2&&inside(online,box)&&inside(fps,box),divider:parseFloat(getComputedStyle(document.querySelector('.presence-fps')).borderTopWidth)>0,
            glyphs:inside(glyph('.fps-value'),fps)&&inside(glyph('.fps-unit'),fps)&&inside(glyph('.presence-count'),online),edges:Math.abs(score.left-safe[0]-4)<.2&&Math.abs(right.right-width+safe[1]+4)<.2,
            clearance:!overlap(score,right)&&!overlap(lives,score)&&!overlap(lives,right)&&Math.abs(lives.top-compass.bottom-12)<.2&&!overlap(marker,score)&&!overlap(marker,right)&&(cross.top+cross.bottom)/2-marker.bottom>=20-.2};
        },{width,height,safe});
        if(!(row.stack&&row.divider&&row.glyphs&&row.edges&&row.clearance)) console.log(JSON.stringify(row,null,2));
        check(row.stack&&row.divider&&row.glyphs&&row.edges&&row.clearance,`${width}: stacked divided cells fit same badge, safe areas and other HUD/marker`);results.push(row);
        if(safe[0]===0)await page.screenshot({path:`${out}/hud-${width}.png`});
      }
      await page.evaluate(async()=>{const {Presence}=await import('/src/presence.js');const el=document.createElement('span');document.body.append(el);window.off=new Presence('',el);});
      check(await page.evaluate(()=>off.el.querySelector('.fps-value')?.textContent==='—'),'FPS cell exists before/without online service');
    }else{
      const context=await browser.newContext({viewport:{width:480,height:300},hasTouch:true,deviceScaleFactor:1}),page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
      const started=Date.now();let phaseTimer;await page.goto(base+'/?lowmem&phone&quality=0&at=4.2,3.9,180&time=12&freeze&cloud=',{waitUntil:'commit'});
      await page.waitForFunction(()=>window.__app?.renderer&&__app.loadingEl.hidden,null,{timeout:240000,polling:200});
      phaseTimer=setTimeout(()=>browser.close(),60000);
      check(await page.evaluate(()=>__app.testMode===null),'actual apartment constructed without test mode');
      await page.evaluate(()=>{__app.renderer.setAnimationLoop(null);__app.showOverlay(false);});
      await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
      await page.evaluate(()=>{const a=__app,original=a.renderer.render.bind(a.renderer);window.draws=0;a.renderer.render=(s,c)=>{draws++;return original(s,c);};a.frameRate.reset();a.frame(.02);window.warmSkipped=a.warm.done;});
      async function sample(n,ms){await page.evaluate(()=>draws=0);for(let i=0;i<n;i++){await page.clock.runFor(ms);await page.evaluate(ms=>__app.frame(ms/1000),ms);}return page.evaluate(()=>({draws,value:__app.frameRate.value,text:document.querySelector('.fps-value').textContent}));}
      const ordinary=await sample(5,200);check(ordinary.draws===5&&ordinary.value===5,'actual main frame counts five ordinary scene draws over controlled elapsed time');
      const extra=await page.evaluate(()=>{const a=__app,before=a.frameRate.frames;a.renderer.render(a.scene,a.camera);return a.frameRate.frames===before;});check(extra,'actual extra renderer calls outside ordinary main hook do not inflate FPS');
      await page.evaluate(()=>__app.use(__app.note));const reading=await sample(30,20);check(reading.draws===6&&reading.value===10,'actual phone reading gate: 30 logic callbacks, six drawn scene frames, 10 FPS');
      fs.writeFileSync(`${out}/app-checkpoint.json`,JSON.stringify({checks,errors,ordinary,reading,stage:'before-images'},null,2));
      await page.screenshot({path:`${out}/actual-app-reading.png`});await page.locator('#note-close').click({force:true});
      await page.evaluate(()=>__app.showOverlay(true));check(await page.evaluate(()=>__app.frameRate.value===null&&document.querySelector('.fps-value').textContent==='—'),'actual pause immediately clears stale FPS');
      await sample(2,20);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
      const hidden=await sample(2,20);check(hidden.draws===0&&hidden.value===null,'controlled hidden flag stops phone draws and keeps FPS unknown');
      await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));__app.showOverlay(false);__app.frame(.02);});
      const resumed=await sample(5,200);check(resumed.draws===5&&resumed.value===5,'actual resume starts fresh 5-FPS window with no stale spike');await page.screenshot({path:`${out}/actual-app-resumed.png`});
      clearTimeout(phaseTimer);
      results.push({ordinary,reading,hidden,resumed,extra,warmSkipped:await page.evaluate(()=>warmSkipped),elapsedMs:Date.now()-started,evidence:'actual WebGL apartment; controlled clock/visibility and callback cadence, not physical phone or measured hardware FPS'});
    }
    check(errors.length===0,`no page errors: ${JSON.stringify(errors)}`);fs.writeFileSync(`${out}/${app?'app':'native'}-result.json`,JSON.stringify({checks,errors,results},null,2));console.log('ALL PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
