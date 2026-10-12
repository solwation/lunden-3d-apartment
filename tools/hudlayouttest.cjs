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
  const results = [];
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route('**/src/bootstrap.js', route => route.fulfill({ contentType: 'text/javascript', body: '// HUD-only test: no game renderer.' }));
    for (const [width,height] of sizes) for (const safe of [[0,0,0,0],[44,44,20,20],[44,0,18,0]]) {
      await page.setViewportSize({width,height});
      await page.goto(`${base}/index.html`);
      await page.evaluate(async ({touch,safe}) => {
        const {initHudIcons,setWeatherIcon} = await import('/src/hudicons.js');
        const {setScoreElement} = await import('/src/stats.js');
        const THREE = await import('three');
        const {Compass} = await import('/src/compass.js');
        const {Combat} = await import('/src/combat.js');
        initHudIcons();
        document.body.classList.toggle('touch',touch);
        for (const [i,key] of ['sl','sr','st','sb'].entries()) document.documentElement.style.setProperty('--'+key,safe[i]+'px');
        for (const id of ['overlay','loading','rotate']) document.getElementById(id).hidden=true;
        document.getElementById('hud').hidden=false;
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
        window.testCombat=new Combat({ghosts,camera,scene:new THREE.Scene(),weapon:()=> 'nerf',feet:()=>new THREE.Vector3()});
        window.testCombat.update(0);
        document.getElementById('corner-qr').hidden=touch;
      },{touch:width<1000,safe});
      const result=await page.evaluate(({width,height,safe}) => {
        const errors=[]; const check=(ok,message)=>{if(!ok)errors.push(message);};
        const near=(a,b)=>Math.abs(a-b)<.1;
        const bounds=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
        const css=selector=>getComputedStyle(document.querySelector(selector));
        const overlaps=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;
        const left=bounds('#score'),right=bounds('#hud-top'),compass=bounds('#compass'),lives=bounds('#lives');
        check(near(lives.top,compass.bottom+12),'lives lack 12px gap below actual compass');
        check(near((lives.left+lives.right)/2,(compass.left+compass.right)/2),'lives not centered below compass');
        check(!overlaps(lives,left)&&!overlaps(lives,right),'lives overlap badge');
        window.testCombat.hurt({l:7});window.testCombat.update(0);
        check(document.getElementById('lives').textContent.endsWith('7/'+window.testCombat.maxLives),'life count does not update');
        check(near(left.top,right.top)&&near(left.height,right.height),'badge tops/heights differ');
        for(const key of ['backgroundColor','borderRadius','boxShadow','borderTopWidth','backdropFilter'])check(css('#score')[key]===css('#hud-top')[key],'shell differs: '+key);
        for(const [name,box] of Object.entries({left,right,compass,lives}))check(box.left>=safe[0]-.1&&box.right<=width-safe[1]+.1&&box.top>=safe[2]-.1&&box.bottom<=height-safe[3]+.1,name+' outside safe viewport');
        check(!overlaps(left,right),'badges overlap');check(!overlaps(compass,left)&&!overlaps(compass,right),'compass overlaps badge');
        const cell=parseFloat(css('#furniture-btn').width),unit=cell/2;
        const cells=['#weather','#temp','#level','.score-main','#presence',...(width<1000?['#terminal-btn']:[])];
        for(const selector of cells){const box=bounds(selector);check(near(box.height,cell),'cell height '+selector);check(near(box.width/unit,Math.round(box.width/unit)),'nonmodular width '+selector);check(box.left>=left.left&&box.right<=left.right+.1,'cell outside shell '+selector);}
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
        window.testCombat.ghosts.connected=false;window.testCombat.update(0);
        check(document.getElementById('lives').hidden,'lives stay visible outside combat');
        window.testCombat.ghosts.connected=true;window.testCombat.update(0);
        return {width,height,safe,cell,left,right,compass,lives,errors};
      },{width,height,safe});
      results.push(result);
      if(out&&safe.every(v=>v===0)){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,`hud-only-after-${width}.png`)});}
    }
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
    const failures=results.flatMap(r=>r.errors.map(e=>`${r.width}x${r.height} safe=${r.safe}: ${e}`));
    if(failures.length)throw new Error(failures.join('\n'));
    console.log(`PASS: ${results.length} real HUD DOM/CSS layouts, five viewports, three safe-area cases; game renderer suppressed.`);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
