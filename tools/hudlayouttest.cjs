#!/usr/bin/env node
// no &test: tests real HUD viewport bounds; game bootstrap is suppressed.
// Real index DOM/CSS and icon initialization; game bootstrap is deliberately suppressed.
// This checks layout and real Combat life updates, not 3D rendering or network gameplay.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = process.argv[2] || 'http://localhost:8000';
const out = process.argv[3];
const sizes = [[844,390],[667,375],[932,430],[568,320],[1280,720]];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true });
  const results = [], pageErrors = [];
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/src/bootstrap.js', route => route.fulfill({ contentType: 'text/javascript', body: '// HUD-only test: no game renderer.' }));
    for (const [width,height] of sizes) for (const safe of [[0,0,0,0],[44,44,20,20],[44,0,18,0]]) {
      await page.setViewportSize({width,height});
      await page.goto(`${base}/index.html`);
      await page.evaluate(async ({touch,safe}) => {
        const originalContext = HTMLCanvasElement.prototype.getContext;
        window.testWebglCalls = 0;
        HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
          if (/webgl/i.test(kind)) { window.testWebglCalls++; throw new Error('No WebGL permitted in HUD layout fixture'); }
          return originalContext.call(this, kind, ...args);
        };
        const {initHudIcons,setWeatherIcon} = await import('/src/hudicons.js');
        const {setScoreElement} = await import('/src/stats.js');
        const THREE = await import('three');
        const {Compass} = await import('/src/compass.js');
        const {Combat} = await import('/src/combat.js');
        initHudIcons();
        document.body.classList.toggle('touch',touch);
        for (const [i,key] of ['sl','sr','st','sb'].entries()) document.documentElement.style.setProperty('--'+key,safe[i]+'px');
        for (const id of ['overlay','loading','rotate']) document.getElementById(id).hidden=true;
        document.getElementById('hud').hidden=true; // real startup initializes Compass while the HUD is hidden
        // Mirror main.js's score assembly without changing production IDs or handlers.
        const score=document.getElementById('score'); setScoreElement(score);
        const weather=document.createElement('span'); weather.id='weather'; setWeatherIcon(weather,'cloud','Molnigt');
        const temp=document.createElement('span'); temp.id='temp'; temp.textContent='−23°';
        const clock=document.createElement('div'); clock.id='level'; clock.innerHTML='<span class="clock">23:59</span>';
        score.prepend(weather,temp,clock); score.append(document.getElementById('terminal-btn'));
        score.querySelector('.score-val').textContent='123 456';
        document.getElementById('presence').innerHTML='<span class="presence-icon"><svg viewBox="0 0 24 24"><circle cx="8" cy="7" r="4"/><path d="M0 21v-3c0-8 16-8 16 0v3Z"/></svg></span><span class="presence-count">99</span>';
        const compass=document.getElementById('compass');
        const camera=new THREE.PerspectiveCamera();
        window.testCompass=new Compass(camera,compass);
        const ghosts={connected:true,others:new Map([['foe',{h:'nerf',root:{visible:true},snaps:[{}]}]])};
        window.testWeapon='nerf';
        window.testCombat=new Combat({ghosts,camera,scene:new THREE.Scene(),weapon:()=>window.testWeapon,feet:()=>new THREE.Vector3()});
        window.testCombat.update(0);
        document.getElementById('corner-qr').hidden=touch;
        document.getElementById('hud').hidden=false;
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); // ResizeObserver follows reveal
      },{touch:width<1000,safe});
      const result=await page.evaluate(({width,height,safe}) => {
        const errors=[]; const check=(ok,message)=>{if(!ok)errors.push(message);};
        const near=(a,b)=>Math.abs(a-b)<.1;
        const bounds=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
        const css=selector=>getComputedStyle(document.querySelector(selector));
        const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;
        const left=bounds('#score'),right=bounds('#hud-top'),compass=bounds('#compass'),lives=bounds('#lives');
        check(near(left.left,safe[0]+4)&&near(right.right,width-safe[1]-4),'badges lack 4px safe-area edge margin');
        check(near(lives.top,compass.bottom+12),'lives lack 12px gap below actual compass');
        check(near((lives.left+lives.right)/2,(compass.left+compass.right)/2),'lives not centered below compass');
        check(!overlaps(lives,left)&&!overlaps(lives,right),'lives overlap badge');
        window.testCombat.hurt({l:7});window.testCombat.update(0);
        check(document.getElementById('lives').textContent.endsWith('7/'+window.testCombat.maxLives),'life count does not update');
        check(near(left.top,right.top)&&near(left.height,right.height),'badge tops/heights differ');
        for(const key of ['backgroundColor','borderRadius','boxShadow','borderTopWidth','backdropFilter'])check(css('#score')[key]===css('#hud-top')[key],'shell differs: '+key);
        for(const [name,box] of Object.entries({left,right,compass,lives}))check(box.left>=safe[0]-.1&&box.right<=width-safe[1]+.1&&box.top>=safe[2]-.1&&box.bottom<=height-safe[3]+.1,name+' outside safe viewport');
        check(near(compass.height,left.height)&&near(compass.top,right.top),'compass differs from shared badge height/top');
        check(near(right.left-compass.right,4),'compass not directly beside right badge with 4px gap');
        for(const letter of document.querySelectorAll('.compass-letter')){const b=letter.getBoundingClientRect();check(parseFloat(getComputedStyle(letter).fontSize)>=10,'compass letters smaller than 10px');check(b.left>=compass.left-.1&&b.right<=compass.right+.1&&b.top>=compass.top-.1&&b.bottom<=compass.bottom+.1,'compass letter outside its surface');}
        check(!overlaps(left,right),'badges overlap');check(!overlaps(compass,left)&&!overlaps(compass,right),'compass overlaps badge');
        const cell=parseFloat(css('#furniture-btn').width),unit=cell/2;
        const cells=['#weather','#temp','#level','.score-main','#presence',...(width<1000?['#terminal-btn']:[])];
        for(const selector of cells){const box=bounds(selector);check(near(box.height,cell),'cell height '+selector);if(width>600)check(near(box.width/unit,Math.round(box.width/unit)),'nonmodular width '+selector);check(document.querySelector(selector).scrollWidth<=document.querySelector(selector).clientWidth,'cell text clipped '+selector);check(box.left>=left.left&&box.right<=left.right+.1,'cell outside shell '+selector);}
        check(near(bounds('#weather').right,bounds('#temp').left)&&css('#temp').borderLeftWidth==='0px','weather/temperature pair divided');
        for(const selector of ['#temp','#level','#presence'])check(parseFloat(css('.score-val').fontSize)>parseFloat(css(selector).fontSize),'score not prominent '+selector);
        for(const selector of ['#furniture-btn','#stats-btn','#mute','#pause',...(width<1000?['#terminal-btn']:[])]){
          const b=bounds(selector);check(near(b.width,cell)&&near(b.height,cell)&&cell>=44,'button cell '+selector);
          const button=document.querySelector(selector),icon=button.querySelector('.hud-icon');
          check(Boolean(button.getAttribute('aria-label')&&button.title&&icon),'icon/accessibility '+selector);
          if(icon){check(getComputedStyle(icon).pointerEvents==='none','icon intercepts pointer '+selector);check(icon.getAttribute('stroke-width')==='1.7','icon stroke '+selector);}
        }
        const feedback=document.querySelector('#score .plus');
        for(const [text,minus] of [['+15',false],['−5 Frysen står fortfarande öppen',true]]){
          feedback.textContent=text;feedback.classList.toggle('minus',minus);
          const box=bounds('#score .plus'),parent=bounds('.score-main');
          check(box.left>=parent.left&&box.right<=parent.right+.1&&box.top>=parent.top&&box.bottom<=parent.bottom+.1,'feedback outside fixed score cell');
          check(feedback.scrollWidth<=feedback.clientWidth&&feedback.scrollHeight<=feedback.clientHeight,'feedback text clipped');
          check(css('.score-val').visibility==='hidden'&&css('#score .plus').visibility==='visible','feedback overlaps score text');
          if(minus)check(css('#score .plus').color==='rgb(255, 107, 94)','minus feedback loses red');
        }
        feedback.textContent='';feedback.classList.remove('minus');check(css('.score-val').visibility==='visible','score does not restore after feedback');
        // Adjuncts can appear during play. Heat modes are mutually exclusive; minimap is independent.
        for(const mode of ['jetpack','vacuum-hud']){
          document.getElementById(mode).hidden=false;
          if(mode==='jetpack')document.getElementById(mode).classList.add('cut');
          const heat=bounds('#'+mode);check(!overlaps(heat,left)&&!overlaps(heat,compass),'heat overlaps header '+mode);
          document.getElementById(mode).hidden=true;document.getElementById(mode).classList.remove('cut');
        }
        const minimap=document.getElementById('minimap');minimap.hidden=false;
        check(!overlaps(bounds('#minimap'),right)&&!overlaps(bounds('#minimap'),compass),'minimap overlaps header');minimap.hidden=true;
        if(width<1000){
          for(const id of ['jet-up','jet-down','web-btn'])document.getElementById(id).hidden=false;
          const controls=['lives','compass','jet-up','jet-down','web-btn','jump-btn','measure-btn','crouch-btn'];
          for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++)check(!overlaps(bounds('#'+controls[i]),bounds('#'+controls[j])),'controls overlap '+controls[i]+'/'+controls[j]);
          for(const id of controls.slice(2)){const b=bounds('#'+id);check(!overlaps(b,left)&&!overlaps(b,right),'control overlaps badge '+id);check(b.top>=safe[2]&&b.bottom<=height-safe[3]+.1,'control outside viewport '+id);}
          for(const id of ['jet-up','jet-down','web-btn'])document.getElementById(id).hidden=true;
        }else check(!overlaps(bounds('#corner-qr'),left),'QR overlaps badge');
        document.body.classList.add('hud-no-blur');check(css('#score').backdropFilter==='none'&&css('#hud-top').backdropFilter==='none','blur fallback');document.body.classList.remove('hud-no-blur');
        const button=document.getElementById('furniture-btn');button.disabled=true;check(Number(getComputedStyle(button).opacity)<.5,'disabled state');button.disabled=false;
        const normal=getComputedStyle(button).backgroundColor;button.setAttribute('aria-pressed','true');check(getComputedStyle(button).backgroundColor!==normal,'pressed state');button.removeAttribute('aria-pressed');
        // #896: test the actual current weapon and life policy, not merely a disconnected armed player.
        const lifeStates=[],lifeState=label=>lifeStates.push({label,weapon:window.testWeapon,connected:window.testCombat.ghosts.connected,lives:window.testCombat.lives,hidden:document.getElementById('lives').hidden,text:document.getElementById('lives').textContent});
        window.testWeapon='';window.testCombat.update(0);lifeState('injured-unarmed');
        check(!document.getElementById('lives').hidden&&!window.testCombat.active,'injured unarmed lives are not visible outside combat');
        check(document.getElementById('lives').textContent.endsWith('7/'+window.testCombat.maxLives),'injured unarmed life count differs');
        window.testCombat.life(window.testCombat.maxLives);window.testCombat.update(0);lifeState('full-unarmed');
        check(document.getElementById('lives').hidden,'full unarmed lives remain visible outside combat');
        window.testCombat.life(7);window.testCombat.ghosts.connected=false;window.testCombat.update(0);lifeState('injured-unarmed-offline');
        check(!document.getElementById('lives').hidden,'injured unarmed offline lives are hidden');
        window.testCombat.life(window.testCombat.maxLives);window.testWeapon='nerf';window.testCombat.ghosts.connected=true;window.testCombat.update(0);lifeState('full-armed-combat');
        check(!document.getElementById('lives').hidden&&window.testCombat.active,'armed combat full life visibility does not restore');
        // Keep a real injured/unarmed HUD for the saved image; no forced visibility or guessed counter.
        window.testWeapon='';window.testCombat.life(7);window.testCombat.update(0);
        check(window.testWebglCalls===0,'HUD fixture attempted WebGL');
        const fontMetrics=Object.fromEntries(['#temp','#level','.score-main'].map(selector=>{const el=document.querySelector(selector),style=getComputedStyle(el);return[selector,{clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,bounds:bounds(selector),fontFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight}];}));
        return {width,height,safe,cell,left,right,compass,lives,lifeStates,fontMetrics,errors};
      },{width,height,safe});
      results.push(result);
      if(out){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,`hud-only-after-${width}-safe-${safe.join('-')}.png`)});}
    }
    // Resize the same live Compass instead of rebuilding it: its observer must move lives.
    await page.setViewportSize({width:667,height:375});
    await page.waitForFunction(()=>{const c=document.getElementById('compass').getBoundingClientRect(),l=document.getElementById('lives').getBoundingClientRect();return Math.abs((c.left+c.right-l.left-l.right)/2)<.1;},null,{polling:100});
    // Exercise the real stats feedback timers once, without any game bootstrap.
    await page.evaluate(async()=>{const {bump}=await import('/src/stats.js');bump('tv',1,'hud-layout-feedback');});
    await page.waitForFunction(()=>document.querySelector('#score .plus').textContent.startsWith('+'));
    await page.waitForFunction(()=>document.querySelector('#score .plus').textContent==='',{},{timeout:3500});
    if(!await page.evaluate(()=>getComputedStyle(document.querySelector('.score-val')).visibility==='visible'))throw new Error('real gain timer did not restore score');
    await page.evaluate(async()=>{const {penalize}=await import('/src/stats.js');penalize('freezerLonger');});
    await page.waitForFunction(()=>document.querySelector('#score .plus').classList.contains('minus'));
    await page.waitForFunction(()=>document.querySelector('#score .plus').textContent==='',{},{timeout:4000});
    if(!await page.evaluate(()=>getComputedStyle(document.querySelector('.score-val')).visibility==='visible'))throw new Error('real deduction timer did not restore score');
    if(out)fs.writeFileSync(path.join(out,'layout-results.json'),JSON.stringify(results,null,2));
    if(pageErrors.length)throw new Error('page errors: '+JSON.stringify(pageErrors));
    const failures=results.flatMap(r=>r.errors.map(e=>`${r.width}x${r.height} safe=${r.safe}: ${e}`));
    if(failures.length)throw new Error(failures.join('\n'));
    console.log(`PASS: ${results.length} real HUD DOM/CSS layouts, five viewports, three safe-area cases; game renderer suppressed.`);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
