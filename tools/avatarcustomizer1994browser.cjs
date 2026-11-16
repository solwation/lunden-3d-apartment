// #1994: one before/result browser turn: production DOM + actual app callbacks/model pixels.
// PLAYWRIGHT_MODULE=... CHROME_PATH=... tools/browsertest.sh node tools/avatarcustomizer1994browser.cjs GAME OUT [BASE]
const fs = require('node:fs'), {execFileSync} = require('node:child_process'), assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [base='http://localhost:8794', out='docs/verification/1994', baseline='b9973faab2f376983f37707390855ee8fc09612e'] = process.argv.slice(2);
const rows=[], errors=[];
const check=(name, value, detail) => { rows.push({name, pass:!!value, detail}); assert(value, name); console.log('PASS '+name); };
(async()=>{
 fs.mkdirSync(out+'/before',{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try {
  const before=await browser.newPage({viewport:{width:1000,height:760}});
  await before.route(base+'/', r=>r.fulfill({contentType:'text/html',body:execFileSync('git',['show',baseline+':index.html']).toString().replaceAll('https://cdn.jsdelivr.net/npm/three@0.170.0/','/__three/')}));
  await before.route('**/src/customizer.js',r=>r.fulfill({contentType:'text/javascript',body:execFileSync('git',['show',baseline+':src/customizer.js'])}));
  await before.route('**/src/bootstrap.js',r=>r.fulfill({contentType:'text/javascript',body:`import * as C from './config.js'; import * as U from './customizer.js'; window.__look={...C.avatarLook('1994'),style:1,hairLength:0,height:175}; U.setupAvatarCustomizer({getLook:()=>__look,setLook:lk=>window.__look={...lk}}); document.querySelector('#loading').hidden=true; U.openAvatarCustomizer(); window.__ready=true;`}));
  await before.goto(base+'/'); await before.waitForFunction(()=>window.__ready);
  const offered=await before.locator('#avatar-customizer [data-type][data-index]').evaluateAll(bs=>bs.map(b=>[b.dataset.type,b.dataset.index]));
  await before.screenshot({path:out+'/before/desktop.png'});
  await before.locator('[data-shape=hairLength]').evaluate(e=>{e.value='8';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await before.locator('[data-shape=hairLength]').scrollIntoViewIfNeeded();
  await before.screenshot({path:out+'/before/hair.png'});
  await before.close();
  const ctx=await browser.newContext({viewport:{width:1000,height:760},deviceScaleFactor:1});
  await ctx.addInitScript(()=>{localStorage.setItem('lunden.name','1994');sessionStorage.setItem('lunden.nameSkipped','1');});
  const page=await ctx.newPage(); globalThis.page=page; globalThis.browser=browser;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/avatarpreview.js',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace('this.canvas = canvas;','this.canvas = canvas; window.__preview = this;')});});
  await page.goto(base+'/?shot&test=lazy&time=12&month=6&freeze&cloud=',{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__app?.renderer,null,{timeout:300000});
  await page.evaluate(async()=>{
   const a=window.__app,C=await import('/src/config.js'); a.renderer.setAnimationLoop(null);a.showOverlay(false);
   a.ghosts.setMyLook({...C.avatarLook('1994'),style:1,hairLength:0,height:175});
   // Exercise the same exported mirror choice used by every mirror target, with production main callbacks.
   const U=await import('/src/customizer.js'); U.mirrorChoice().run();
  });
  await page.waitForFunction(()=>window.__preview?.avatar);
  const canvas=page.locator('#avatar-preview-canvas');
  const pixels=()=>canvas.evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data));
  const diff=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>5)n++;return n;};
  const flush=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const input=async(sel,value)=>{await page.locator(sel).evaluate((e,value)=>{e.value=String(value);e.dispatchEvent(new Event('input',{bubbles:true}));},value);await flush();};
  check('actual app mirror choice opens five categories and real preview',await page.locator('[role=tab]').count()===5 && await page.evaluate(()=>__preview.avatar.mesh.isSkinnedMesh));
  const retained=await page.locator('#avatar-customizer').evaluate((el,offered)=>offered.every(([type,index])=>el.querySelector(`button[data-type="${type}"][data-index="${index}"],select[data-type="${type}"] option[value="${index}"]`)),offered);
  check('all original choices remain available',retained,{originalChoices:offered.length});
  await page.screenshot({path:out+'/desktop-body.png'});
  await page.getByRole('tab',{name:'Hår',exact:true}).click();await flush();
  let a=await pixels(); await input('[data-shape=hairLength]',8);let b=await pixels();
  check('straight hair min/max changes rendered pixels and real shader',diff(a,b)>100 && await page.evaluate(()=>__preview.avatar.material.userData.u.uHair.value===1.25),{pixels:diff(a,b)});
  await page.screenshot({path:out+'/hair-long.png'});
  await input('[data-shape=hairLength]',0);await page.screenshot({path:out+'/hair-short.png'});
  await page.locator('button[data-type=style][data-index="4"]').click();await flush();a=await pixels();await input('[data-shape=hairLength]',8);b=await pixels();check('curly hair length visible',diff(a,b)>100,{pixels:diff(a,b)});
  await input('#avatar-turn',95);a=await pixels();await input('[data-shape=hairLength]',0);b=await pixels();check('hair length visible from side',diff(a,b)>100,{pixels:diff(a,b)});
  await input('#avatar-turn',0);
  await page.getByRole('tab',{name:'Ansikte',exact:true}).click();await flush();a=await pixels();await input('[data-shape=noseSize]',8);b=await pixels();check('face shape reflected in real head',diff(a,b)>5,{pixels:diff(a,b)});
  await page.locator('button[data-type=eyes][data-index="5"]').click();await flush();check('eye colour reaches rendered model',await page.evaluate(async()=>__preview.avatar.look.eyes===(await import('/src/config.js')).EYES[5]));
  await page.getByRole('tab',{name:'Kläder',exact:true}).click();await flush();a=await pixels();await page.locator('button[data-type=cut][data-index="2"]').click();await flush();b=await pixels();check('hoodie changes model; fixed sleeves do not offer inert controls',diff(a,b)>100 && !(await page.locator('[data-group=sleeves]').isVisible()),{pixels:diff(a,b)});
  await page.getByRole('tab',{name:'Tillbehör',exact:true}).click();
  for(const [type,value] of [['hat','2'],['phones','1'],['glasses','2'],['necklace','3'],['earrings','2'],['ring','10'],['metal','2'],['bracelet','4'],['watch','6']]){
   await page.locator(`select[data-type=${type}]`).first().selectOption(value);await flush();
   check('native '+type+' select updates live avatar',await page.evaluate(([type,value])=>__preview.avatar.look[type]===Number(value),[type,value]));
  }
  await page.screenshot({path:out+'/desktop-accessories.png'});
  await page.getByRole('tab',{name:'Kropp',exact:true}).click();await flush();a=await pixels();await input('#avatar-height',120);b=await pixels();check('height changes visible full-body size',diff(a,b)>1000,{pixels:diff(a,b)});
  await input('#avatar-build',8);await page.locator('button[data-type=skin][data-index="3"]').click();await page.locator('button[data-type=gender][data-index="1"]').click();await flush();
  let saved=await page.evaluate(async()=>{const C=await import('/src/config.js');return C.encodeAvatarLook(__app.ghosts.myLook)});
  const oldPreview=await page.evaluate(()=>{window.__oldPreview=__preview;return !!__oldPreview.avatar});
  await page.getByRole('button',{name:'Klar',exact:true}).click();
  check('close disposes preview and preserves actual profile code',await page.evaluate(async code=>{const S=await import('/src/playerprofiles.js');return !__oldPreview.avatar && S.playerLocalStorage.getItem('lunden.avatar')===code},saved));
  await page.evaluate(()=>__app.openAvatarCustomizer());await page.waitForFunction(()=>__preview!==__oldPreview && !!__preview.avatar);
  check('reopen restores the complete chosen look',await page.evaluate(async code=>(await import('/src/config.js')).encodeAvatarLook(__preview.avatar.look)===code,saved));
  // Native keyboard category selection; focus remains on the selected tab.
  await page.getByRole('tab',{name:'Kropp',exact:true}).focus();await page.keyboard.press('ArrowRight');
  check('keyboard arrow selects hair category',await page.getByRole('tab',{name:'Hår',exact:true}).getAttribute('aria-selected')==='true');
  const cdp=await ctx.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  const tap=async locator=>{const r=await locator.boundingBox();assert(r);const touchPoints=[{x:r.x+r.width/2,y:r.y+r.height/2}];await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await flush();};
  await page.setViewportSize({width:390,height:844});
  await tap(page.getByRole('tab',{name:'Hår',exact:true}));await tap(page.locator('button[data-type=style][data-index="1"]'));await input('[data-shape=hairLength]',8);
  check('portrait touch category/style and preview usable; rotate cover hidden',await page.locator('[data-panel=hair]').isVisible() && await page.locator('#rotate').evaluate(e=>getComputedStyle(e).display==='none'));
  await page.screenshot({path:out+'/touch-portrait.png'});
  await page.setViewportSize({width:844,height:390});await tap(page.getByRole('tab',{name:'Tillbehör',exact:true}));await page.locator('select[data-type=glasses]').selectOption('3');await flush();
  check('landscape touch accessory selection updates preview',await page.evaluate(()=>__preview.avatar.look.glasses===3));
  await page.screenshot({path:out+'/touch-landscape.png'});
  for(const viewport of [{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(viewport);check('dialog and footer fit '+viewport.width+'x'+viewport.height,await page.locator('.customizer-card').evaluate(e=>{const r=e.getBoundingClientRect(),f=document.querySelector('.customizer-footer').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+.5&&r.top>=0&&r.bottom<=innerHeight+.5&&f.bottom<=innerHeight+.5}));}
  await page.keyboard.press('Escape');check('Escape closes editor',await page.locator('#avatar-customizer').isHidden());
  check('no uncaught browser errors',errors.length===0,errors);
  await ctx.close();
 }finally{fs.writeFileSync(out+'/browser.json',JSON.stringify({baseline,rows,errors,source:require('node:crypto').createHash('sha256').update(fs.readFileSync('src/customizer.js')).digest('hex')},null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
