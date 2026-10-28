// #884 pure counter + actual index/Presence HUD, optional bounded actual-apartment draw integration.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.argv[2] || 'http://localhost:8871',out=process.argv[3] || '/tmp/lunden-fps884-surface',app=process.argv.includes('--app'),probe=process.argv.includes('--capture-probe'),mode=probe?'capture':app?'app':'native',baselineMarker=process.argv.includes('--baseline-marker');
let checks=0;const check=(ok,text)=>{assert.ok(ok,text);checks++;console.log(`PASS ${text}`);};
(async()=>{
  fs.mkdirSync(out,{recursive:true});const checkpoint=data=>fs.writeFileSync(`${out}/${mode}-checkpoint.json`,JSON.stringify({checks,...data},null,2));const {FrameRate}=await import('../src/fps.js');
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
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:(app||probe)?['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--no-sandbox','--disable-gpu']});
  const errors=[],results=[];
  try{
    if(probe){
      const variant=process.env.FPS_CAPTURE || 'resume-surface',page=await browser.newPage({viewport:{width:667,height:375}});page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:'// tiny real WebGL capture diagnosis, no apartment'}));await page.goto(base);
      await page.evaluate(async()=>{const T=await import('three');window.nativeRAF=requestAnimationFrame.bind(window);window.nativeCancelRAF=cancelAnimationFrame.bind(window);const r=new T.WebGLRenderer({antialias:true});r.domElement.id='game-canvas';document.body.prepend(r.domElement);const scene=new T.Scene();scene.background=new T.Color('#247ca0');const camera=new T.PerspectiveCamera(50,160/90,.1,10);camera.position.z=3;scene.add(new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial({color:'#efcd68'})));const {bindGameViewport}=await import('/src/viewport.js');bindGameViewport(r,camera);r.setPixelRatio(1);r.setSize(320,180,false);window.captureProbe={r,scene,camera};r.setAnimationLoop(()=>r.render(scene,camera));for(const id of ['overlay','loading','rotate'])document.getElementById(id).hidden=true;document.getElementById('hud').hidden=false;const {initHudIcons}=await import('/src/hudicons.js'),{setScoreElement}=await import('/src/stats.js'),{Presence}=await import('/src/presence.js'),{FrameRate}=await import('/src/fps.js');initHudIcons();setScoreElement(document.getElementById('score'));const p=new Presence('',document.getElementById('presence')),fps=new FrameRate();fps.sample(0,false,true);p.el.querySelector('.fps-value').textContent=String(fps.sample(600,true,true));document.body.classList.add('touch');});
      await page.waitForTimeout(50);await page.evaluate(()=>captureProbe.r.setAnimationLoop(null));await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
      const canvas=await page.evaluate(()=>{const {r,scene,camera}=captureProbe;r.render(scene,camera);r.getContext().finish();return r.domElement.toDataURL('image/png');});fs.writeFileSync(`${out}/capture-${variant}-canvas.png`,Buffer.from(canvas.split(',')[1],'base64'));check(canvas.length>500,'synchronous final tiny WebGL draw/gl.finish exports actual canvas PNG (no HUD)');checkpoint({variant,errors,stage:'before native capture'});
      if(variant==='paired')await page.evaluate(()=>captureProbe.r.domElement.style.visibility='hidden');
      await page.clock.resume();if(variant.startsWith('restore'))await page.evaluate(()=>{window.requestAnimationFrame=nativeRAF;window.cancelAnimationFrame=nativeCancelRAF;return new Promise(resolve=>nativeRAF(()=>nativeRAF(resolve)));});
      const cdp=await page.context().newCDPSession(page);let captureTimer;try{const png=await Promise.race([cdp.send('Page.captureScreenshot',{format:'png',fromSurface:variant!=='restore-view'&&variant!=='paired',captureBeyondViewport:false}),new Promise((_,reject)=>{captureTimer=setTimeout(()=>reject(new Error('tiny native capture exceeded5s')),5000);})]);fs.writeFileSync(`${out}/capture-${variant}.png`,Buffer.from(png.data,'base64'));check(png.data.length>500,variant==='paired'?'actual HUD DOM captured separately with only tiny canvas hidden':'actual tiny WebGL plus DOM captured by native CDP');}finally{clearTimeout(captureTimer);await cdp.detach();}results.push({variant});
    }else if(!app){
      const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));let count=7,fail=false;
      if(baselineMarker&&process.env.BASELINE_MARKER)await page.route('**/src/hitmarker.js',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.BASELINE_MARKER,'utf8')}));
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
            markerLivesClear:!overlap(marker,lives),
            clearance:!overlap(score,right)&&!overlap(lives,score)&&!overlap(lives,right)&&Math.abs(lives.top-compass.bottom-12)<.2&&!overlap(marker,score)&&!overlap(marker,right)&&(cross.top+cross.bottom)/2-marker.bottom>=20-.2};
        },{width,height,safe});
        if(!(row.stack&&row.divider&&row.glyphs&&row.edges&&row.clearance)) console.log(JSON.stringify(row,null,2));
        check(row.stack&&row.divider&&row.glyphs&&row.edges&&row.clearance,`${width}: stacked divided cells fit same badge, safe areas and other HUD/marker`);results.push(row);
        const affected=width===568&&safe[2]>0;check(baselineMarker&&affected?!row.markerLivesClear:row.markerLivesClear,`${width}: ${baselineMarker&&affected?'baseline reproduces marker/lives overlap':'actual marker clears lives'}`);
        if(width===568&&safe[2]===20){checkpoint({errors,results});await page.screenshot({path:`${out}/marker-safe-568.png`});}
        if(safe[0]===0){checkpoint({errors,results});await page.screenshot({path:`${out}/hud-${width}.png`});}
      }
      if(!baselineMarker){
        await page.setViewportSize({width:568,height:320});
        await page.evaluate(()=>{for(const [k,v]of Object.entries({sl:44,sr:44,st:20,sb:20}))document.documentElement.style.setProperty('--'+k,v+'px');document.body.classList.add('touch');combat.hit({w:'rifle',head:true,to:'foe',l:9,dead:false});return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
        check(await page.evaluate(async()=>{const m=combat.hitMarker.el.getBoundingClientRect(),l=document.getElementById('lives').getBoundingClientRect();return l.left-m.right>=(await import('/src/config.js')).COMBAT.hitMarker.livesGapPx-.2&&getComputedStyle(combat.hitMarker.el).pointerEvents==='none';}),'overlapping receipt moves only far enough left for named lives clearance');
        check(await page.evaluate(()=>{const el=combat.hitMarker.el,original=el.getBoundingClientRect;let reads=0;el.getBoundingClientRect=function(){reads++;return original.call(this);};for(let i=0;i<100;i++)combat.update(0);delete el.getBoundingClientRect;return reads===0;}),'100 actual Combat updates perform no marker geometry reads');
        await page.evaluate(()=>{const r=combat.hitMarker.el.getBoundingClientRect(),b=document.createElement('button');b.id='marker-click-probe';b.style.cssText=`position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:19`;window.markerClicks=0;b.addEventListener('click',()=>markerClicks++);document.body.append(b);});
        const at=await page.evaluate(()=>{const r=combat.hitMarker.el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});await page.mouse.click(at.x,at.y);
        check(await page.evaluate(()=>markerClicks===1&&!combat.hitMarker.el.hidden),'actual mouse click passes through relocated visible marker');await page.evaluate(()=>document.getElementById('marker-click-probe').remove());
        await page.setViewportSize({width:667,height:375});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        check(await page.evaluate(()=>{const r=combat.hitMarker.el.getBoundingClientRect();return !combat.hitMarker.el.hidden&&Math.abs((r.left+r.right)/2-innerWidth/2)<.2&&combat.hitMarker.el.style.marginLeft==='0px';}),'viewport resize recenters the same still-live receipt when clear');
        await page.setViewportSize({width:568,height:320});await page.evaluate(()=>{combat.hit({w:'rifle',head:true});combat.hitMarker.clear();});
        check(await page.evaluate(()=>combat.hitMarker.el.hidden&&combat.hitMarker.layoutFrame===0&&combat.hitMarker.el.style.marginLeft==='0px'),'clear cancels pending placement and centered state is restored');
        await page.evaluate(()=>{combat.hit({w:'rifle',head:true});combat.reset();});check(await page.evaluate(()=>combat.hitMarker.el.hidden&&combat.hitMarker.layoutFrame===0),'actual Combat reset clears receipt and queued placement');
      }
      await page.evaluate(async()=>{const {Presence}=await import('/src/presence.js');const el=document.createElement('span');document.body.append(el);window.off=new Presence('',el);});
      check(await page.evaluate(()=>off.el.querySelector('.fps-value')?.textContent==='—'),'FPS cell exists before/without online service');
    }else{
      const context=await browser.newContext({viewport:{width:667,height:375},hasTouch:true,deviceScaleFactor:1}),page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
      const started=Date.now();let phaseTimer;await page.goto(base+'/?lowmem&phone&quality=0&at=4.2,3.9,180&time=12&freeze&cloud=',{waitUntil:'commit'});
      await page.waitForFunction(()=>window.__app?.renderer&&__app.loadingEl.hidden,null,{timeout:240000,polling:200});
      phaseTimer=setTimeout(()=>browser.close(),60000);
      check(await page.evaluate(()=>__app.testMode===null),'actual apartment constructed without test mode');
      await page.evaluate(()=>{__app.renderer.setAnimationLoop(null);__app.renderer.setPixelRatio(1);__app.renderer.setSize(320,180,false);__app.showOverlay(false);});
      await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
      await page.evaluate(()=>{const a=__app,original=a.renderer.render.bind(a.renderer);window.draws=0;a.renderer.render=(s,c)=>{draws++;return original(s,c);};a.frameRate.reset();a.frame(.02);window.warmSkipped=a.warm.done;});
      async function sample(n,ms){await page.evaluate(()=>draws=0);for(let i=0;i<n;i++){const delta=Array.isArray(ms)?ms[i]:ms;await page.clock.runFor(delta);await page.evaluate(ms=>__app.frame(ms/1000),delta);}return page.evaluate(()=>({draws,value:__app.frameRate.value,text:document.querySelector('.fps-value').textContent}));}
      const ordinary=await sample(1,600);check(ordinary.draws===1&&ordinary.value===2,'actual main frame counts one ordinary scene draw over controlled elapsed time');checkpoint({ordinary});
      const extra=await page.evaluate(()=>{const a=__app,before=a.frameRate.frames;a.renderer.render(a.scene,a.camera);return a.frameRate.frames===before;});check(extra,'actual extra renderer calls outside ordinary main hook do not inflate FPS');checkpoint({ordinary,extra});
      await page.evaluate(()=>{__app.use(__app.note);__app.showOverlay(true);__app.showOverlay(false);__app.frame(0);});const reading=await sample(3,[200,1,399]);check(reading.draws===2&&reading.value===3,'actual phone reading gate: three logic callbacks, two due scene frames, 3 FPS');
      fs.writeFileSync(`${out}/app-checkpoint.json`,JSON.stringify({checks,errors,ordinary,reading,stage:'before-images'},null,2));
      await page.evaluate(()=>document.getElementById('note-close').click());
      await page.evaluate(()=>__app.showOverlay(true));check(await page.evaluate(()=>__app.frameRate.value===null&&document.querySelector('.fps-value').textContent==='—'),'actual pause immediately clears stale FPS');
      await sample(2,20);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
      const hidden=await sample(2,20);check(hidden.draws===0&&hidden.value===null,'controlled hidden flag stops phone draws and keeps FPS unknown');
      await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));__app.showOverlay(false);__app.frame(.02);});
      const resumed=await sample(1,600);check(resumed.draws===1&&resumed.value===2,'actual resume starts fresh controlled 2-FPS window with no stale spike');
      const redundant=await page.evaluate(()=>{const before=document.querySelector('.fps-value').textContent;__app.showOverlay(false);return {before,after:document.querySelector('.fps-value').textContent,events:__app.fpsDiag.events};});
      check(redundant.before==='2'&&redundant.after==='2'&&redundant.events.length>0&&redundant.events.some(e=>e.type==='reset'),'redundant showOverlay(false) retains active FPS without resetting, diag events recorded');
      clearTimeout(phaseTimer);
      checkpoint({errors,ordinary,reading,hidden,resumed,extra,stage:'all assertions before image'});
      results.push({ordinary,reading,hidden,resumed,extra,warmSkipped:await page.evaluate(()=>warmSkipped),elapsedMs:Date.now()-started,evidence:'actual WebGL apartment with320×180 draw buffer; controlled clock/visibility and callback cadence, not physical phone or measured hardware FPS'});
      fs.writeFileSync(`${out}/app-result.json`,JSON.stringify({checks,errors,results},null,2));
      // Explicit paired capture: real synchronous game pixels, then real DOM with only its canvas hidden.
      const canvas=await page.evaluate(()=>{const a=__app;a.frame(0);a.renderer.getContext().finish();const c=a.renderer.domElement;return {png:c.toDataURL('image/png'),width:c.width,height:c.height,fps:document.querySelector('.fps-value').textContent};});
      check(canvas.width===320&&canvas.height===180&&canvas.fps==='2'&&canvas.png.length>500,'actual synchronous game canvas PNG retains controlled FPS and320×180 buffer (canvas only)');fs.writeFileSync(`${out}/actual-game-canvas.png`,Buffer.from(canvas.png.split(',')[1],'base64'));checkpoint({errors,ordinary,reading,hidden,resumed,extra,captureMode:'paired',gameCanvas:{width:canvas.width,height:canvas.height,fps:canvas.fps},stage:'before DOM image'});
      await page.evaluate(async()=>{await document.fonts.ready;__app.renderer.domElement.style.visibility='hidden';});await page.clock.resume();
      const cdp=await context.newCDPSession(page);let captureTimer;
      try { const png=await Promise.race([cdp.send('Page.captureScreenshot',{format:'png',fromSurface:false,captureBeyondViewport:false}),new Promise((_,reject)=>{captureTimer=setTimeout(()=>reject(new Error('native HUD DOM capture exceeded15s')),15000);})]);fs.writeFileSync(`${out}/actual-hud-dom.png`,Buffer.from(png.data,'base64'));check(png.data.length>500,'actual current HUD DOM PNG captured separately with only game canvas hidden'); } finally {clearTimeout(captureTimer);await cdp.detach();}
      results[0].capture={mode:'paired actual canvas and DOM; no composited/full-app image',gameCanvas:'actual-game-canvas.png',hudDOM:'actual-hud-dom.png'};
    }
    check(errors.length===0,`no page errors: ${JSON.stringify(errors)}`);fs.writeFileSync(`${out}/${mode}-result.json`,JSON.stringify({checks,errors,results},null,2));console.log('ALL PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
